import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fixturesDir } from "./config";
import type { GenerateOptions } from "./gemini";

/**
 * Record/replay of raw Gemini text responses. The filename is
 * <kind>-<promptHash>-<inputHash>.json where kind is the call label's first
 * word (level / repair / roast), promptHash covers the system prompt plus the
 * JSON schema (a prompt change orphans old fixtures) and inputHash covers the
 * request input with images reduced to their sha256.
 */

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

export type Fixture = {
  kind: string;
  label: string;
  model?: string;
  promptHash: string;
  inputHash: string;
  recordedAt: string;
  text: string;
};

export class FixtureMissError extends Error {
  constructor(label: string, file: string) {
    super(
      `GEMINI_REPLAY=1 but there is no recorded fixture for the "${label}" call (looked for ${file}). ` +
        `Record one with GEMINI_RECORD=1 and a real key (a prompt or input change needs a re-record), or unset GEMINI_REPLAY. No API call was made.`
    );
    this.name = "FixtureMissError";
  }
}

export function fixtureKey(options: Pick<GenerateOptions, "label" | "system" | "input" | "schema">) {
  const input =
    typeof options.input === "string"
      ? options.input
      : options.input.map((part) => (part.type === "text" ? part.text : `image:${part.mime_type}:${sha(part.data)}`));
  const kind = options.label.split(/\s+/)[0]!.toLowerCase();
  const promptHash = sha(options.system + "\n" + JSON.stringify(options.schema ?? null)).slice(0, 8);
  const inputHash = sha(JSON.stringify(input)).slice(0, 12);
  return { kind, promptHash, inputHash, file: `${kind}-${promptHash}-${inputHash}.json` };
}

export function fixturePath(options: Parameters<typeof fixtureKey>[0]): string {
  return path.join(fixturesDir(), fixtureKey(options).file);
}

/** Returns the recorded text, or throws FixtureMissError. Never calls the API. */
export function replayFixture(options: GenerateOptions): string {
  const file = fixturePath(options);
  let fixture: Fixture;
  try {
    fixture = JSON.parse(fs.readFileSync(file, "utf8")) as Fixture;
  } catch {
    console.error(`[replay] MISS ${options.label}: ${path.basename(file)}`);
    throw new FixtureMissError(options.label, file);
  }
  if (typeof fixture.text !== "string" || !fixture.text) throw new FixtureMissError(options.label, file);
  console.log(`[replay] hit ${options.label}: ${path.basename(file)}`);
  return fixture.text;
}

export function saveFixture(options: GenerateOptions, text: string, model?: string): void {
  const { kind, promptHash, inputHash, file } = fixtureKey(options);
  const fixture: Fixture = {
    kind,
    label: options.label,
    model,
    promptHash,
    inputHash,
    recordedAt: new Date().toISOString(),
    text,
  };
  try {
    fs.mkdirSync(fixturesDir(), { recursive: true });
    fs.writeFileSync(path.join(fixturesDir(), file), JSON.stringify(fixture, null, 2) + "\n");
    console.log(`[record] saved ${file}`);
  } catch (error) {
    console.warn("[record] could not save fixture:", error instanceof Error ? error.message : error);
  }
}
