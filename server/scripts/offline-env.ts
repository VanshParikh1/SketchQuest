import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Import this FIRST in any offline test. It runs before gemini.ts/dotenv load, so:
// - the real GEMINI_API_KEY from .env is never used (dotenv doesn't override a set variable),
// - caches, usage and fixtures go to a throwaway temp dir instead of server/.cache or server/fixtures,
// - every spend-control flag starts from a known state.
process.env.GEMINI_API_KEY = "offline-test-key-not-real";
for (const name of [
  "GEMINI_MOCK",
  "GEMINI_MOCK_FALLBACK",
  "GEMINI_LIVE_ROAST",
  "GEMINI_RECORD",
  "GEMINI_REPLAY",
  "GEMINI_DAILY_CAP",
]) {
  delete process.env[name];
}
const root = fs.mkdtempSync(path.join(os.tmpdir(), "sketchquest-test-"));
process.env.SKETCHQUEST_CACHE_DIR = path.join(root, "cache");
process.env.SKETCHQUEST_FIXTURES_DIR = path.join(root, "fixtures");
