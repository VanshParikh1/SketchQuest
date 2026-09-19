import type { LevelResponse, RoastRequest, RoastResponse } from "@sketchquest/shared";
import { isLiveRoast, isMock } from "./config";
import { levelFromSketch, type SketchImage } from "./levelFromSketch";
import { mockLevel, mockRoast, type MockDeps } from "./mock";
import { cannedRoast, roastLine } from "./roast";

/**
 * What the HTTP endpoints actually serve, given the spend-control switches:
 *   GEMINI_MOCK=1        -> canned data after fake latency, never Gemini
 *   GEMINI_LIVE_ROAST=0  -> roasts come from the canned pool even with a key (default)
 *   otherwise            -> the real pipelines (cache, replay/record and daily cap apply inside)
 */

export async function serveLevel(image: SketchImage, deps: MockDeps = {}): Promise<LevelResponse> {
  if (isMock()) return mockLevel(deps);
  return levelFromSketch(image);
}

export async function serveRoast(req: RoastRequest, deps: MockDeps = {}): Promise<RoastResponse> {
  if (isMock()) return { line: await mockRoast(req, deps) };
  if (!isLiveRoast()) return { line: cannedRoast(req.cause, req.deathsAtSpot, req.recentRoasts) };
  return { line: (await roastLine(req)).line };
}
