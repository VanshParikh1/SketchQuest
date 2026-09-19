import "./env";
import { GoogleGenAI } from "@google/genai";

/** Model for level generation. Override with GEMINI_MODEL. */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

let client: GoogleGenAI | null = null;

export function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return (client ??= new GoogleGenAI({ apiKey }));
}

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/** Rejects with TimeoutError if `run` hasn't settled in `ms`; aborts the underlying request via the signal. */
export async function withTimeout<T>(
  label: string,
  ms: number,
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError(label, ms));
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** gemini-3.8-flash accepts these; "minimal" is rejected with a 400. */
export type ThinkingLevel = "low" | "medium" | "high";
const THINKING_LEVELS: readonly string[] = ["low", "medium", "high"];

/** Reads a thinking level from an env var, falling back to "low" (warns once per bad value). */
export function thinkingFromEnv(name: string): ThinkingLevel {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return "low";
  if (THINKING_LEVELS.includes(raw)) return raw as ThinkingLevel;
  if (!warnedThinking.has(raw)) {
    warnedThinking.add(raw);
    console.warn(`[gemini] ${name}="${raw}" is not one of ${THINKING_LEVELS.join("/")}; using "low"`);
  }
  return "low";
}
const warnedThinking = new Set<string>();

export type InputPart = { type: "text"; text: string } | { type: "image"; data: string; mime_type: string };

export type GenerateOptions = {
  label: string;
  system: string;
  input: string | InputPart[];
  timeoutMs: number;
  model?: string;
  /** JSON schema for structured output. Omit for plain text. */
  schema?: Record<string, unknown>;
  temperature?: number;
  thinkingLevel?: ThinkingLevel;
  maxOutputTokens?: number;
  /** Fail fast: no SDK retries (429s and 5xx surface immediately). Level calls keep the default retries. */
  noRetries?: boolean;
};

/**
 * The Interactions generation_config type has no `temperature` field, so it
 * is sent through extra_body. gemini-3.8-flash accepts it. As a guard, if a
 * call 400s with temperature set and the same call succeeds without it, we
 * stop sending it for the life of the process (logged once). A 400 that also
 * fails without temperature is not temperature's fault and changes nothing.
 */
let temperatureSupported = true;

/** One Interactions API call; returns the model's text output. */
export async function generate(options: GenerateOptions): Promise<string> {
  const { label, system, input, timeoutMs, schema, thinkingLevel, maxOutputTokens, noRetries } = options;
  const temperature = temperatureSupported ? options.temperature : undefined;
  const ai = getClient();

  const call = (signal: AbortSignal, temp: number | undefined) =>
    ai.interactions.create(
      {
        model: options.model ?? GEMINI_MODEL,
        system_instruction: system,
        input,
        store: false,
        ...(schema && { response_format: { type: "text", mime_type: "application/json", schema } }),
      },
      {
        timeout_ms: timeoutMs,
        ...(noRetries && { retries: { strategy: "none" as const } }),
        fetch_options: { signal },
        // extra_body replaces generation_config wholesale, so it carries every field.
        extra_body: {
          generation_config: {
            ...(temp !== undefined && { temperature: temp }),
            ...(thinkingLevel && { thinking_level: thinkingLevel }),
            ...(maxOutputTokens && { max_output_tokens: maxOutputTokens }),
          },
        },
      }
    );

  const text = await withTimeout(label, timeoutMs, async (signal) => {
    try {
      return (await call(signal, temperature)).output_text;
    } catch (error) {
      if (temperature !== undefined && isBadRequest(error)) {
        const retried = (await call(signal, undefined)).output_text;
        if (temperatureSupported) {
          temperatureSupported = false;
          console.warn(`[gemini] ${label}: 400 only when temperature is set; no longer sending it`);
        }
        return retried;
      }
      throw error;
    }
  });

  if (!text) throw new Error(`${label}: empty model response`);
  return text;
}

function isBadRequest(error: unknown): boolean {
  const status = (error as { status?: number; statusCode?: number } | null)?.status ??
    (error as { statusCode?: number } | null)?.statusCode;
  return status === 400;
}
