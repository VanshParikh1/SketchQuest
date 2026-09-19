import { createHash } from "node:crypto";
import { z } from "zod";
import {
  LevelSchema,
  sanitizeLevel,
  validateLevel,
  type Level,
  type LevelResponse,
} from "@sketchquest/shared";
import { pickFallback } from "./fallbackLevels";
import { readDiskLevel, writeDiskLevel } from "./levelCache";
import { generate, type GenerateOptions, liveAvailable, thinkingFromEnv } from "./gemini";
import { buildRepairPrompt, LEVEL_SYSTEM_PROMPT, LEVEL_USER_PROMPT } from "./prompts";

/** Soft end-to-end target: repairs are skipped once this is spent. */
const TOTAL_BUDGET_MS = 8000;
const FIRST_CALL_TIMEOUT_MS = 6000;
const REPAIR_TIMEOUT_MS = 4000;
const MAX_REPAIRS = 2;
/** Not worth starting a repair call with less than this left. */
const MIN_REPAIR_MS = 1500;
const CACHE_LIMIT = 200;

const LEVEL_JSON_SCHEMA = (() => {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(LevelSchema) as Record<string, unknown>;
  return schema;
})();

export type SketchImage = { data: string; mimeType: string };
export type Generate = (options: GenerateOptions) => Promise<string>;

export type LevelFromSketchOptions = {
  /** Injectable for tests. */
  generate?: Generate;
  /** Set false to bypass the response cache (run-samples). */
  cache?: boolean;
};

const cache = new Map<string, LevelResponse>();
const inFlight = new Map<string, Promise<LevelResponse>>();

function remember(hash: string, response: LevelResponse): void {
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(hash, response);
}

/** Drops the in-memory cache only (tests use this to simulate a restart; the disk cache stays). */
export function clearMemoryCache(): void {
  cache.clear();
}

export function imageHash(image: SketchImage): string {
  return createHash("sha256").update(image.data).digest("hex");
}

/** Sketch photo -> a playable level. Never throws: any failure yields a fallback level. */
export async function levelFromSketch(
  image: SketchImage,
  options: LevelFromSketchOptions = {}
): Promise<LevelResponse> {
  const useCache = options.cache !== false;
  const hash = imageHash(image);

  if (useCache) {
    const hit = cache.get(hash);
    if (hit) {
      console.log(`[level] ${hash.slice(0, 8)} cache hit`);
      return structuredClone(hit);
    }
    const pending = inFlight.get(hash);
    if (pending) return structuredClone(await pending);
  }

  const run = (async () => {
    if (useCache) {
      const stored = await readDiskLevel(hash);
      if (stored) {
        console.log(`[level] ${hash.slice(0, 8)} disk cache hit`);
        remember(hash, stored);
        return stored;
      }
    }
    const response = await buildLevel(image, hash, options.generate ?? generate);
    // Fallbacks aren't cached: a retry of the same photo should get another shot at Gemini.
    if (useCache && !response.meta.fallback) {
      remember(hash, response);
      await writeDiskLevel(hash, response);
    }
    return response;
  })();

  if (!useCache) return run;
  inFlight.set(hash, run);
  try {
    return structuredClone(await run);
  } finally {
    inFlight.delete(hash);
  }
}

async function buildLevel(image: SketchImage, hash: string, gen: Generate): Promise<LevelResponse> {
  const started = Date.now();
  const tag = `[level] ${hash.slice(0, 8)}`;
  const remaining = () => TOTAL_BUDGET_MS - (Date.now() - started);
  const fallback = (reason: string): LevelResponse => {
    console.warn(`${tag} fallback (${reason}) total=${Date.now() - started}ms`);
    return { level: pickFallback(hash), meta: { repairs: 0, fallback: true } };
  };

  if (gen === generate && !liveAvailable()) return fallback("GEMINI_API_KEY not set");

  const imagePart = { type: "image", data: image.data, mime_type: image.mimeType } as const;

  let level: Level;
  try {
    const t = Date.now();
    level = await callForLevel(gen, {
      label: "level",
      system: LEVEL_SYSTEM_PROMPT,
      input: [{ type: "text", text: LEVEL_USER_PROMPT }, imagePart],
      timeoutMs: Math.min(FIRST_CALL_TIMEOUT_MS, remaining()),
    });
    console.log(`${tag} gemini call ${Date.now() - t}ms`);
  } catch (error) {
    return fallback(`first call failed: ${describe(error)}`);
  }

  let repairs = 0;
  for (;;) {
    const verdict = validateLevel(level);
    if (verdict.reachable) {
      console.log(`${tag} ok repairs=${repairs} total=${Date.now() - started}ms`);
      return { level, meta: { repairs, fallback: false } };
    }
    if (repairs >= MAX_REPAIRS) return fallback(`still unreachable after ${repairs} repairs: ${verdict.report[0]}`);
    if (remaining() < MIN_REPAIR_MS) return fallback(`out of time budget: ${verdict.report[0]}`);

    repairs++;
    try {
      const t = Date.now();
      level = await callForLevel(gen, {
        label: `repair ${repairs}`,
        system: LEVEL_SYSTEM_PROMPT,
        input: [{ type: "text", text: buildRepairPrompt(level, verdict.report) }, imagePart],
        timeoutMs: Math.min(REPAIR_TIMEOUT_MS, remaining()),
      });
      console.log(`${tag} repair ${repairs} ${Date.now() - t}ms`);
    } catch (error) {
      return fallback(`repair ${repairs} failed: ${describe(error)}`);
    }
  }
}

/** One structured-output call -> parsed, sanitized Level. */
async function callForLevel(
  gen: Generate,
  call: Pick<GenerateOptions, "label" | "system" | "input" | "timeoutMs">
): Promise<Level> {
  const text = await gen({
    ...call,
    schema: LEVEL_JSON_SCHEMA,
    temperature: 0.2,
    thinkingLevel: thinkingFromEnv("GEMINI_LEVEL_THINKING"),
  });
  const parsed: unknown = JSON.parse(stripFence(text));
  return LevelSchema.parse(sanitizeLevel(parsed));
}

/** Models occasionally wrap JSON in a markdown fence even with a schema. */
function stripFence(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
