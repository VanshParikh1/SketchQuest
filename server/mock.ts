import { sampleLevel, type Level, type LevelResponse } from "@sketchquest/shared";
import type { RoastRequest } from "@sketchquest/shared";
import { isMockFallback } from "./config";
import { fallbackLevels } from "./fallbackLevels";
import { cannedRoast } from "./roast";

/**
 * GEMINI_MOCK=1 stand-ins for /api/level and /api/roast: fake latency plus
 * canned data, so the whole app runs end to end with zero Gemini calls.
 */

export const MOCK_LEVEL_DELAY_MS = [2000, 4000] as const;
export const MOCK_ROAST_DELAY_MS = [300, 1200] as const;

export type MockDeps = {
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const between = (random: () => number, [min, max]: readonly [number, number]) =>
  Math.round(min + random() * (max - min));

/** Hand-made fallback levels plus the sample level, served in rotation. */
const rotation: readonly Level[] = [...fallbackLevels, sampleLevel];
let next = 0;

/** Restarts the level rotation (tests). */
export function resetMockRotation(): void {
  next = 0;
}

/** Levels rotate per request; meta.fallback is false unless GEMINI_MOCK_FALLBACK=1. */
export async function mockLevel({ sleep = realSleep, random = Math.random }: MockDeps = {}): Promise<LevelResponse> {
  await sleep(between(random, MOCK_LEVEL_DELAY_MS));
  const level = structuredClone(rotation[next++ % rotation.length]!);
  return { level, meta: { repairs: 0, fallback: isMockFallback() } };
}

/** Canned line for the cause, escalated by deathsAtSpot, never one of recentRoasts. */
export async function mockRoast(
  req: RoastRequest,
  { sleep = realSleep, random = Math.random }: MockDeps = {}
): Promise<string> {
  await sleep(between(random, MOCK_ROAST_DELAY_MS));
  return cannedRoast(req.cause, req.deathsAtSpot, req.recentRoasts, random);
}
