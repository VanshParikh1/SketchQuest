import { GRAVITY, JUMP_VELOCITY, PLAYER_H, PLAYER_W, RUN_SPEED, WORLD_H, WORLD_W } from "./constants";
import type { Level } from "./level";

/**
 * Reachability validator. Answers "can a player plausibly get from start to
 * goal?" with a BFS over platform tops, using the same physics constants the
 * game runs on. It is deliberately a little pessimistic (SAFETY times the real
 * limit) so a level it calls beatable isn't beatable by a frame-perfect jump.
 *
 * Level coords are normalized 0-1000 and converted to world px here.
 * Platforms/hazards/goal are x,y = top-left; start is x,y = center.
 */

/** Fraction of the true jump height / air time we allow ourselves to use. */
export const SAFETY = 0.9;

/** Raw physics ceilings, straight from the constants. */
export const RAW_MAX_JUMP_HEIGHT = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);
export const RAW_MAX_FLAT_GAP = ((2 * JUMP_VELOCITY) / GRAVITY) * RUN_SPEED;

/** Limits the validator actually enforces (raw * SAFETY). */
export const MAX_JUMP_HEIGHT = RAW_MAX_JUMP_HEIGHT * SAFETY;
export const MAX_FLAT_GAP = RAW_MAX_FLAT_GAP * SAFETY;

export type ValidationResult = {
  reachable: boolean;
  /** Plain-English problems; empty when the level is beatable. */
  report: string[];
};

type Span = { id: string; x0: number; x1: number; top: number; bottom: number };

const EPS = 0.5;
/** A start drawn slightly inside a platform still counts as standing on it (the client nudges it out). */
const START_EMBED_TOLERANCE = PLAYER_H;
const MAX_NEAR_MISS_LINES = 4;

const px = (v: number) => Math.round(v);
const toX = (v: number) => (v / 1000) * WORLD_W;
const toY = (v: number) => (v / 1000) * WORLD_H;

function rectSpan(r: { id: string; x: number; y: number; w: number; h: number }): Span {
  return {
    id: r.id,
    x0: toX(r.x),
    x1: toX(Math.min(1000, r.x + r.w)),
    top: toY(r.y),
    bottom: toY(Math.min(1000, r.y + r.h)),
  };
}

/** Time for a jump launched at JUMP_VELOCITY to come back down to `rise` px above (or -rise below) the launch height. */
function airTime(rise: number): number {
  const disc = JUMP_VELOCITY * JUMP_VELOCITY - 2 * GRAVITY * rise;
  return disc < 0 ? 0 : (JUMP_VELOCITY + Math.sqrt(disc)) / GRAVITY;
}

/** Horizontal distance coverable while landing `rise` px above (negative = below) the launch height. */
function maxReach(rise: number): number {
  return RUN_SPEED * airTime(rise) * SAFETY;
}

function xGap(a: { x0: number; x1: number }, b: { x0: number; x1: number }): number {
  return Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1));
}

/** Longest stretch of `p`'s top that no hazard occupies, in px. */
function longestSafeStretch(p: Span, hazards: Span[]): number {
  const standingTop = p.top - PLAYER_H;
  const blocked = hazards
    .filter((h) => h.bottom > standingTop + EPS && h.top < p.top - EPS && h.x1 > p.x0 && h.x0 < p.x1)
    .map((h) => [Math.max(p.x0, h.x0), Math.min(p.x1, h.x1)] as const)
    .sort((a, b) => a[0] - b[0]);

  let best = 0;
  let cursor = p.x0;
  for (const [from, to] of blocked) {
    best = Math.max(best, from - cursor);
    cursor = Math.max(cursor, to);
  }
  return Math.max(best, p.x1 - cursor);
}

type Miss = { line: string; overshoot: number };

/** Why `from` can't reach `to`, or null when it can. */
function linkProblem(from: Span, to: Span): Miss | null {
  const rise = from.top - to.top; // positive = `to` is higher
  if (rise > MAX_JUMP_HEIGHT) {
    return {
      overshoot: rise - MAX_JUMP_HEIGHT,
      line: `${to.id} is ${px(rise)}px above ${from.id}, more than the max jump height ${px(MAX_JUMP_HEIGHT)}px`,
    };
  }
  const gap = xGap(from, to);
  const reach = maxReach(rise);
  if (gap > reach) {
    const limit =
      Math.abs(rise) < 1
        ? `max flat gap ${px(reach)}px`
        : `max gap ${px(reach)}px for a ${px(Math.abs(rise))}px ${rise > 0 ? "climb" : "drop"}`;
    return {
      overshoot: gap - reach,
      line: `gap of ${px(gap)}px between ${from.id} and ${to.id} exceeds ${limit}`,
    };
  }
  return null;
}

/** Why a player standing on `from` can't touch the goal, or null when they can. */
function goalProblem(from: Span, goal: Span): Miss | null {
  // Feet must rise to at least (goal top .. goal bottom + player height) to overlap the goal box.
  const lowestTouchRise = from.top - (goal.bottom + PLAYER_H);
  if (lowestTouchRise > MAX_JUMP_HEIGHT) {
    return {
      overshoot: lowestTouchRise - MAX_JUMP_HEIGHT,
      line: `goal ${goal.id} is ${px(lowestTouchRise)}px above ${from.id}, more than the max jump height ${px(MAX_JUMP_HEIGHT)}px`,
    };
  }
  const gap = xGap(from, goal);
  const reach = maxReach(Math.min(lowestTouchRise, MAX_JUMP_HEIGHT));
  if (gap > reach) {
    return {
      overshoot: gap - reach,
      line: `goal ${goal.id} is ${px(gap)}px away from ${from.id}, more than the max reach ${px(reach)}px`,
    };
  }
  return null;
}

export function validateLevel(level: Level): ValidationResult {
  const report: string[] = [];
  const hazards = level.hazards.map(rectSpan);
  const all = level.platforms.map(rectSpan);
  const goal = rectSpan(level.goal);

  const usable = all.filter((p) => longestSafeStretch(p, hazards) >= PLAYER_W);
  for (const p of all) {
    if (!usable.includes(p)) {
      report.push(`platform ${p.id} is covered by hazards, so there is nowhere safe to stand on it`);
    }
  }

  const startX = toX(level.start.x);
  const startFeet = toY(level.start.y) + PLAYER_H / 2;
  const under = all
    .filter((p) => p.x0 < startX + PLAYER_W / 2 && p.x1 > startX - PLAYER_W / 2 && p.top >= startFeet - START_EMBED_TOLERANCE)
    .sort((a, b) => a.top - b.top)[0];

  if (!under) {
    report.push("start is not above any platform, so the player would fall out of the world");
    return { reachable: false, report };
  }
  if (!usable.includes(under)) {
    return { reachable: false, report };
  }

  // BFS over platform tops.
  const reached = new Set<Span>([under]);
  const queue: Span[] = [under];
  while (queue.length > 0) {
    const from = queue.shift()!;
    for (const to of usable) {
      if (!reached.has(to) && linkProblem(from, to) === null) {
        reached.add(to);
        queue.push(to);
      }
    }
  }

  const goalMisses = [...reached].map((p) => goalProblem(p, goal));
  if (goalMisses.some((m) => m === null)) {
    return { reachable: true, report: [] };
  }

  // Not beatable: explain the nearest misses at the edge of what IS reachable.
  const frontier: Miss[] = [];
  for (const to of usable) {
    if (reached.has(to)) continue;
    const misses = [...reached].map((from) => linkProblem(from, to)).filter((m): m is Miss => m !== null);
    misses.sort((a, b) => a.overshoot - b.overshoot);
    if (misses[0]) frontier.push(misses[0]);
  }
  frontier.sort((a, b) => a.overshoot - b.overshoot);
  report.push(...frontier.slice(0, MAX_NEAR_MISS_LINES).map((m) => m.line));

  const bestGoalMiss = (goalMisses as Miss[]).sort((a, b) => a.overshoot - b.overshoot)[0]!;
  report.push(bestGoalMiss.line);
  return { reachable: false, report };
}
