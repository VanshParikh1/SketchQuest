import { PLAYER_H, PLAYER_W, type Level, type Platform } from "@sketchquest/shared";
import { COIN_SIZE, nx, ny } from "./units";

/** Top-left rectangle in normalized level coords (the platform/hazard/goal convention). */
type Box = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };

const EPS = 0.001;
/** Clearance left between a nudged goal/coin and the platform it was moved off. */
const NUDGE_GAP = 1;
/** Stacked platforms can need more than one nudge; this bounds the loop. */
const MAX_NUDGES = 8;

const PLAYER_BOX_W = nx(PLAYER_W);
const PLAYER_BOX_H = ny(PLAYER_H);
const COIN_BOX_W = nx(COIN_SIZE);
const COIN_BOX_H = ny(COIN_SIZE);

const AUTO_GROUND: Platform = { id: "auto-ground", x: 0, y: 920, w: 1000, h: 80 };

/**
 * Makes an already-sanitized level safe to spawn into: the player never
 * starts inside a wall/hazard or in mid-air over nothing, and the goal and
 * coins are never buried inside a platform. Run after sanitizeLevel().
 */
export function fixLevel(level: Level): Level {
  const platforms = level.platforms.length > 0 ? level.platforms : [AUTO_GROUND];

  return {
    ...level,
    platforms,
    start: fixStart(level.start, platforms, level.hazards),
    goal: fixGoal(level.goal, platforms),
    coins: level.coins.map((coin) => fixCoin(coin, platforms)),
  };
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS && a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS
  );
}

function contains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x - EPS &&
    inner.y >= outer.y - EPS &&
    inner.x + inner.w <= outer.x + outer.w + EPS &&
    inner.y + inner.h <= outer.y + outer.h + EPS
  );
}

/** Start/coin/enemy points are centers; this is the box they occupy. */
function centeredBox(c: Point, w: number, h: number): Box {
  return { x: c.x - w / 2, y: c.y - h / 2, w, h };
}

function fixStart(start: Point, platforms: Platform[], hazards: Box[]): Point {
  const box = centeredBox(start, PLAYER_BOX_W, PLAYER_BOX_H);
  const buried = [...platforms, ...hazards].some((solid) => overlaps(box, solid));
  const feet = box.y + box.h;
  const supported = platforms.some(
    (p) => p.y >= feet - EPS && p.x < box.x + box.w && p.x + p.w > box.x
  );
  if (!buried && supported) return start;

  // Top-center of the nearest platform whose top is on the map, preferring
  // one where the player isn't standing in another platform or a hazard.
  const candidates = platforms
    .map((p) => ({ x: (p.x + Math.min(1000, p.x + p.w)) / 2, y: p.y - PLAYER_BOX_H / 2 }))
    .filter((pt) => pt.y >= 0)
    .sort((a, b) => distance(a, start) - distance(b, start));
  const clear = candidates.find((pt) => {
    const spot = centeredBox(pt, PLAYER_BOX_W, PLAYER_BOX_H);
    return ![...platforms, ...hazards].some((solid) => overlaps(spot, solid));
  });
  return clear ?? candidates[0] ?? start;
}

function fixGoal<G extends Box>(goal: G, platforms: Platform[]): G {
  let fixed = goal;
  for (let i = 0; i < MAX_NUDGES; i++) {
    const host = platforms.find((p) => contains(p, fixed));
    if (!host) break;
    fixed = { ...fixed, y: Math.max(0, host.y - fixed.h - NUDGE_GAP) };
  }
  return fixed;
}

function fixCoin<C extends Point>(coin: C, platforms: Platform[]): C {
  let fixed = coin;
  for (let i = 0; i < MAX_NUDGES; i++) {
    const box = centeredBox(fixed, COIN_BOX_W, COIN_BOX_H);
    const host = platforms.find((p) => contains(p, box));
    if (!host) break;
    fixed = { ...fixed, y: Math.max(0, host.y - COIN_BOX_H / 2 - NUDGE_GAP) };
  }
  return fixed;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
