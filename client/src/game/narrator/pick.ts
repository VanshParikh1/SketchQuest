import {
  ALL_COINS_LINES,
  DEATH_LINES,
  FIRST_COIN_LINES,
  INTRO_LINES,
  MILESTONE_LINES,
  SITUATIONAL,
  WIN_LINES,
  tierFor,
  type Tier,
} from "./lines";
import type { NarratorContext, Trigger } from "./types";

/** A template is never reused until this many other lines have been used. */
export const NO_REPEAT_WINDOW = 6;
/** Chance a situational line (coins held, super quick death...) replaces the normal one when one applies. */
const SITUATIONAL_CHANCE = 0.25;
const MAX_NAME_CHARS = 40;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Fills {placeholders}. Unknown ones are left as-is so tests can catch them. */
export function fillLine(template: string, ctx: NarratorContext): string {
  const levelDeaths = ctx.levelDeaths ?? Math.max(0, ctx.attempt - 1);
  const values: Record<string, string> = {
    attempt: String(ctx.attempt),
    deathsAtSpot: String(ctx.deathsAtSpot),
    coins: String(ctx.coins),
    coinsLabel: plural(ctx.coins, "coin"),
    timeAlive: ctx.timeAlive.toFixed(1),
    levelName: (ctx.levelName || "this level").slice(0, MAX_NAME_CHARS),
    totalDeaths: String(ctx.totalDeaths ?? levelDeaths),
    levelDeaths: String(levelDeaths),
  };
  return template.replace(/\{(\w+)\}/g, (m, key: string) => values[key] ?? m);
}

function poolsFor(trigger: Trigger, ctx: NarratorContext): string[][] {
  switch (trigger.kind) {
    case "death": {
      const cells = DEATH_LINES[trigger.cause];
      const tier = tierFor(ctx.deathsAtSpot);
      // Primary cell first, then neighbouring tiers if it is exhausted.
      const order: Tier[] = tier === 0 ? [0, 1, 2] : tier === 1 ? [1, 0, 2] : [2, 1, 0];
      return order.map((t) => cells[t]);
    }
    case "intro":
      return [INTRO_LINES];
    case "firstCoin":
      return [FIRST_COIN_LINES];
    case "allCoins":
      return [ALL_COINS_LINES];
    case "win": {
      const deaths = ctx.levelDeaths ?? Math.max(0, ctx.attempt - 1);
      return [deaths === 0 ? WIN_LINES.flawless : deaths <= 3 ? WIN_LINES.few : WIN_LINES.many];
    }
    case "milestone":
      return [MILESTONE_LINES[trigger.count] ?? MILESTONE_LINES[10]];
  }
}

/**
 * A stateful picker: remembers the last NO_REPEAT_WINDOW templates used and
 * how often each has been used, so lines rotate instead of clustering.
 * `rng` is injectable so scripts and tests can be deterministic.
 */
export function createPicker(rng: () => number = Math.random) {
  const recent: string[] = [];
  const uses = new Map<string, number>();

  const remember = (template: string) => {
    recent.push(template);
    if (recent.length > NO_REPEAT_WINDOW) recent.shift();
    uses.set(template, (uses.get(template) ?? 0) + 1);
  };

  /** Random pick among the least-used lines of `pool` that are not in the recent window. */
  const choose = (pool: string[]): string | undefined => {
    const fresh = pool.filter((t) => !recent.includes(t));
    if (!fresh.length) return undefined;
    const least = Math.min(...fresh.map((t) => uses.get(t) ?? 0));
    const candidates = fresh.filter((t) => (uses.get(t) ?? 0) === least);
    return candidates[Math.floor(rng() * candidates.length)];
  };

  function pickLine(trigger: Trigger, ctx: NarratorContext): string {
    const pools = poolsFor(trigger, ctx);

    let template: string | undefined;
    if (trigger.kind === "death" && rng() < SITUATIONAL_CHANCE) {
      const applicable = SITUATIONAL.filter((s) => s.when(ctx)).flatMap((s) => s.lines);
      template = choose(applicable);
    }
    for (const pool of pools) {
      if (template) break;
      template = choose(pool);
    }
    // Everything nearby is in the recent window: reuse the one used longest ago.
    template ??= recent.find((t) => pools[0].includes(t)) ?? pools[0][0];

    remember(template);
    return fillLine(template, ctx);
  }

  return { pickLine, recent: () => [...recent], reset: () => (recent.length = 0, uses.clear()) };
}

/** Session-wide picker used by the game. */
const defaultPicker = createPicker();
export const pickLine = (trigger: Trigger, ctx: NarratorContext): string => defaultPicker.pickLine(trigger, ctx);
