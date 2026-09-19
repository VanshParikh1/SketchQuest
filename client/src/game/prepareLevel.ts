import { LevelSchema, sanitizeLevel, type Level } from "@sketchquest/shared";
import { fixLevel } from "./fixLevel";

/** Untrusted level data -> a validated Level that is safe to spawn into. */
export function prepareLevel(input: unknown): Level {
  return LevelSchema.parse(fixLevel(sanitizeLevel(input)));
}
