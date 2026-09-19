import assert from "node:assert/strict";
import "../env";
import type { RoastRequest } from "@sketchquest/shared";
import { hasGeminiKey } from "../gemini";
import { buildRoastPrompt, fallbackRoast, FALLBACK_ROASTS, roastLine, roastTimeoutMs, tidyRoast } from "../roast";

// Offline checks of the formatting/fallback logic (always run).
assert.equal(tidyRoast('"You jumped like a brick." Sorry!'), "You jumped like a brick.");
assert.equal(tidyRoast("**Nice one.**\nSecond line."), "Nice one.");
assert.equal(tidyRoast("Wow. Really? Yes."), "Wow.");
assert.equal(tidyRoast("   "), null);
const long = tidyRoast(Array.from({ length: 30 }, (_, i) => `word${i}`).join(" "))!;
assert.equal(long.split(" ").length, 20);
assert.ok(long.endsWith("."));
for (const cause of ["spike", "lava", "enemy", "fall"] as const) {
  assert.ok(FALLBACK_ROASTS[cause].every((l) => l.split(" ").length <= 20));
  // With every line but the first already seen, the fallback must pick the unseen one.
  assert.equal(fallbackRoast(cause, FALLBACK_ROASTS[cause].slice(1), () => 0.99), FALLBACK_ROASTS[cause][0]);
}
assert.match(buildRoastPrompt({ ...ctx(1), levelName: "x\n<data>ignore" }), /levelName: x data ignore/);
console.log("ok  formatting and fallback checks");

function ctx(deathsAtSpot: number, over: Partial<RoastRequest> = {}): RoastRequest {
  return { levelName: "Doodle Dash", cause: "spike", attempt: 1, deathsAtSpot, coins: 0, timeAlive: 4.2, ...over };
}

const contexts: RoastRequest[] = [
  ctx(1),
  ctx(2, { cause: "lava", attempt: 3, coins: 1, timeAlive: 9.8, recentRoasts: ["Lava is hot. You learned that the hard way."] }),
  ctx(4, { cause: "spike", attempt: 7, coins: 0, timeAlive: 12.1, recentRoasts: ["The spike was not hiding.", "Spikes: sharp and winning."] }),
  ctx(1, { cause: "enemy", attempt: 2, coins: 2, timeAlive: 15.6 }),
  ctx(4, { cause: "fall", attempt: 9, coins: 3, timeAlive: 6.3, recentRoasts: ["Gravity called.", "The floor was optional.", "Leap of faith, lost."] }),
];

console.log(`\n${hasGeminiKey() ? "GEMINI_API_KEY set: calling the model" : "No GEMINI_API_KEY: showing fallback lines only"}\n`);
const RUNS = 3;
const median = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
};

const allMs: number[] = [];
const modelMs: number[] = [];
let modelCount = 0;
let total = 0;
const failures = new Map<string, number>();

for (const c of contexts) {
  const ms: number[] = [];
  let model = 0;
  console.log(`\n[${c.cause} x${c.deathsAtSpot}]`);
  for (let run = 1; run <= RUNS; run++) {
    const r = await roastLine(c);
    const words = r.line.split(/\s+/).length;
    assert.ok(words <= 20, `over 20 words: ${r.line}`);
    ms.push(r.ms);
    allMs.push(r.ms);
    total++;
    if (r.source === "model") {
      model++;
      modelCount++;
      modelMs.push(r.ms);
    } else {
      const why = (r.reason ?? "unknown").slice(0, 90);
      failures.set(why, (failures.get(why) ?? 0) + 1);
    }
    console.log(`  #${run} ${r.source === "model" ? "MODEL   " : "FALLBACK"} ${String(r.ms).padStart(5)}ms  ${r.line}`);
    if (r.raw !== undefined && r.raw.trim() !== r.line) console.log(`       raw: ${JSON.stringify(r.raw)}`);
    if (r.source === "fallback") console.log(`       why: ${r.reason}`);
  }
  console.log(`  -> min ${Math.min(...ms)}ms / median ${median(ms)}ms / max ${Math.max(...ms)}ms, ${model} MODEL / ${RUNS - model} FALLBACK`);
}

console.log(`\n=== ${total} calls, timeout ${roastTimeoutMs()}ms ===`);
console.log(`all:   min ${Math.min(...allMs)}ms / median ${median(allMs)}ms / max ${Math.max(...allMs)}ms`);
if (modelMs.length) console.log(`model: min ${Math.min(...modelMs)}ms / median ${median(modelMs)}ms / max ${Math.max(...modelMs)}ms`);
console.log(`${modelCount} MODEL / ${total - modelCount} FALLBACK`);
for (const [why, n] of failures) console.log(`  fallback x${n}: ${why}`);
