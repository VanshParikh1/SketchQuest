/**
 * Prints sample narrator lines with fake contexts so the humor can be judged
 * by reading, and runs sanity checks on the whole pool. No Phaser, no network.
 *
 *   npm run narrator:samples -w client            (20 samples across causes/tiers + other triggers)
 *   npm run narrator:samples -w client -- --all   (every template in the pool)
 */
import { DEATH_LINES, INTRO_LINES, FIRST_COIN_LINES, ALL_COINS_LINES, MILESTONE_LINES, SITUATIONAL, WIN_LINES } from "../src/game/narrator/lines";
import { NO_REPEAT_WINDOW, createPicker, fillLine } from "../src/game/narrator/pick";
import type { NarratorContext } from "../src/game/narrator/types";
import type { DeathCause } from "@sketchquest/shared";

const causes: DeathCause[] = ["spike", "lava", "enemy", "fall"];
const base: NarratorContext = { levelName: "Doodle Dash", attempt: 4, deathsAtSpot: 1, coins: 0, timeAlive: 7.3 };

// Seeded rng so the printout is stable between runs.
let seed = 42;
const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const picker = createPicker(rng);

console.log("--- 20 sample lines: cause x tier (fake contexts) ---");
let n = 0;
for (const cause of causes) {
  for (const spot of [1, 2, 3, 4, 7]) {
    const ctx = { ...base, deathsAtSpot: spot, attempt: spot + 2 };
    const tier = spot >= 3 ? "3+" : String(spot);
    console.log(`${String(++n).padStart(2)}. [${cause.padEnd(5)} x${tier.padEnd(2)}] ${picker.pickLine({ kind: "death", cause }, ctx)}`);
  }
}

console.log("\n--- other triggers ---");
const other: Array<[string, Parameters<typeof picker.pickLine>[0], Partial<NarratorContext>]> = [
  ["intro", { kind: "intro" }, {}],
  ["first coin", { kind: "firstCoin" }, {}],
  ["all coins", { kind: "allCoins" }, { coins: 4 }],
  ["win flawless", { kind: "win" }, { attempt: 1, levelDeaths: 0 }],
  ["win few deaths", { kind: "win" }, { attempt: 3, levelDeaths: 2 }],
  ["win many deaths", { kind: "win" }, { attempt: 11, levelDeaths: 10 }],
  ["milestone 5", { kind: "milestone", count: 5 }, { totalDeaths: 5 }],
  ["milestone 10", { kind: "milestone", count: 10 }, { totalDeaths: 10 }],
];
for (const [label, trigger, extra] of other) console.log(`[${label.padEnd(15)}] ${picker.pickLine(trigger, { ...base, ...extra })}`);

console.log("\n--- situational (forced) ---");
const facts: Record<string, Partial<NarratorContext>> = {
  "carrying-coins": { coins: 3 },
  "too-quick": { timeAlive: 1.4 },
  "so-close": { timeAlive: 31.6 },
  grinding: { attempt: 12 },
};
for (const s of SITUATIONAL) console.log(`[${s.id.padEnd(14)}] ${fillLine(s.lines[Math.floor(rng() * s.lines.length)], { ...base, ...facts[s.id] })}`);

if (process.argv.includes("--all")) {
  console.log("\n--- entire pool ---");
  for (const cause of causes) DEATH_LINES[cause].forEach((cell, t) => cell.forEach((l) => console.log(`[${cause} tier${t}] ${fillLine(l, { ...base, deathsAtSpot: t + 1 })}`)));
}

// ---- checks ----
const problems: string[] = [];
const all: Array<[string, string]> = [];
for (const cause of causes) DEATH_LINES[cause].forEach((cell, t) => {
  if (cell.length < 4) problems.push(`${cause} tier${t} has only ${cell.length} lines`);
  cell.forEach((l) => all.push([`${cause} tier${t}`, l]));
});
INTRO_LINES.forEach((l) => all.push(["intro", l]));
FIRST_COIN_LINES.forEach((l) => all.push(["firstCoin", l]));
ALL_COINS_LINES.forEach((l) => all.push(["allCoins", l]));
for (const [k, v] of Object.entries(WIN_LINES)) v.forEach((l) => all.push([`win ${k}`, l]));
for (const [k, v] of Object.entries(MILESTONE_LINES)) v.forEach((l) => all.push([`milestone ${k}`, l]));
SITUATIONAL.forEach((s) => s.lines.forEach((l) => all.push([`situational ${s.id}`, l])));

const BANNED = /\b(stupid|idiot|dumb|moron|loser|trash|suck|hate you|ugly|fat|shit|fuck|damn|hell|ass|bitch|crap|kill yourself|retard)\b/i;
for (const [where, l] of all) {
  const filled = fillLine(l, { ...base, coins: 3, levelDeaths: 3, totalDeaths: 5 });
  if (/\{|\}/.test(filled)) problems.push(`unfilled placeholder in [${where}]: ${l}`);
  if (BANNED.test(l)) problems.push(`banned word in [${where}]: ${l}`);
  if (filled.split(/\s+/).length > 22) problems.push(`over 22 words in [${where}]: ${l}`);
  if (/\{deathsAtSpot\}/.test(l) && where.endsWith("tier0")) problems.push(`tier0 line uses deathsAtSpot: ${l}`);
}
const dup = all.map(([, l]) => l).filter((l, i, a) => a.indexOf(l) !== i);
if (dup.length) problems.push(`duplicate lines: ${dup.join(" | ")}`);

// The no-repeat rule, over many draws from a single small pool.
const p2 = createPicker(rng);
let repeats = 0;
const seen: string[] = [];
for (let i = 0; i < 400; i++) {
  const line = p2.pickLine({ kind: "death", cause: "spike" }, { ...base, deathsAtSpot: 1 + (i % 4) });
  if (seen.slice(-NO_REPEAT_WINDOW).includes(line)) repeats++;
  seen.push(line);
}
if (repeats) problems.push(`${repeats} repeats inside the last ${NO_REPEAT_WINDOW} lines`);

console.log(`\n${all.length} templates checked (${DEATH_LINES.spike.flat().length * 4} death lines + others).`);
if (problems.length) {
  console.log("PROBLEMS:\n- " + problems.join("\n- "));
  process.exitCode = 1;
} else console.log("All checks passed: >=4 lines per death cell, no unfilled placeholders, no banned words, <=22 words, no repeats inside the last 6.");
