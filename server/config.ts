import path from "node:path";
import "./env";

/**
 * Runtime switches for spending (or not spending) Gemini quota. Everything
 * reads process.env at call time so tests can flip modes without reloading.
 * See the README Deploy section for the recommended combinations.
 */

const truthy = (name: string): boolean =>
  ["1", "true", "yes", "on"].includes((process.env[name] ?? "").trim().toLowerCase());

/** GEMINI_MOCK=1: /api/level and /api/roast never touch Gemini and return canned data after a fake delay. */
export const isMock = (): boolean => truthy("GEMINI_MOCK");
/** GEMINI_MOCK_FALLBACK=1: mock levels come back with meta.fallback = true. */
export const isMockFallback = (): boolean => truthy("GEMINI_MOCK_FALLBACK");
/** GEMINI_LIVE_ROAST=1: /api/roast may call Gemini. Default 0: canned escalating pool only. */
export const isLiveRoast = (): boolean => truthy("GEMINI_LIVE_ROAST");
/** GEMINI_RECORD=1: save each real Gemini response to server/fixtures/. */
export const isRecord = (): boolean => truthy("GEMINI_RECORD");
/** GEMINI_REPLAY=1: serve Gemini calls from server/fixtures/ and never call the API. */
export const isReplay = (): boolean => truthy("GEMINI_REPLAY");

export const DEFAULT_DAILY_CAP = 15;

/** GEMINI_DAILY_CAP: max real Gemini requests per local day. 0 = unlimited. */
export function dailyCap(): number {
  const raw = process.env.GEMINI_DAILY_CAP?.trim();
  if (!raw) return DEFAULT_DAILY_CAP;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_DAILY_CAP;
}

export type Mode = "mock" | "live";
export const mode = (): Mode => (isMock() ? "mock" : "live");

/** On-disk cache root (levels, usage). Override with SKETCHQUEST_CACHE_DIR (tests). */
export const cacheDir = (): string =>
  process.env.SKETCHQUEST_CACHE_DIR || path.resolve(import.meta.dirname, ".cache");

/** Committed record/replay fixtures. Override with SKETCHQUEST_FIXTURES_DIR (tests). */
export const fixturesDir = (): string =>
  process.env.SKETCHQUEST_FIXTURES_DIR || path.resolve(import.meta.dirname, "fixtures");
