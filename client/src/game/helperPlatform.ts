import { PLAYER_H, WORLD_H, WORLD_W } from "@sketchquest/shared";
import { nx, ny, sx, sy } from "./units";

/** Top-left rectangle. Level rects are normalized 0-1000; "px" rects are world pixels. */
type Rect = { x: number; y: number; w: number; h: number };

/** Live helper platform size, in normalized level units (about 176 x 20 world px). */
export const HELPER_W = 110;
export const HELPER_H = 22;

/** Vertical offsets above the death spot's feet to try, best first (60 leaves too little headroom to walk under). */
const RISE_TRIES_PX = [80, 100, 60, 120];
/** Horizontal offsets, in the direction of the goal (positive = ahead), best first. */
const AHEAD_TRIES_PX = [40, 100, 0, 160, -40, -100, 220];
const WORLD_MARGIN_PX = 8;
const PLATFORM_PAD_PX = 6;
const HAZARD_PAD_PX = 12;
const HEADROOM_PX = PLAYER_H + 4;

export type HelperRequest = {
  /** Existing platforms, including earlier live helpers (level units). */
  platforms: readonly Rect[];
  hazards: readonly Rect[];
  goal: Rect;
  /** World px: where the player was when they died (feetY = bottom of the player's box). */
  deathX: number;
  feetY: number;
  /** The player's current box in world px, so the helper is never dropped onto them. */
  player?: Rect;
};

const toPx = (r: Rect): Rect => ({ x: sx(r.x), y: sy(r.y), w: sx(r.w), h: sy(r.h) });

function overlaps(a: Rect, b: Rect, pad = 0): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;
}

/**
 * Where a stuck player's helper platform goes: just above and slightly ahead
 * (toward the goal) of where they keep dying, on a spot that touches no
 * platform, hazard or the goal and leaves standing room above it. Returns a
 * platform rect in level units, or null when nothing fits.
 */
export function findHelperRect(req: HelperRequest): Rect | null {
  const w = sx(HELPER_W);
  const h = sy(HELPER_H);
  const solids = req.platforms.map(toPx);
  const hazards = req.hazards.map(toPx);
  const goal = toPx(req.goal);
  const dir = goal.x + goal.w / 2 >= req.deathX ? 1 : -1;

  for (const rise of RISE_TRIES_PX) {
    for (const ahead of AHEAD_TRIES_PX) {
      const left = clamp(req.deathX + dir * ahead - w / 2, WORLD_MARGIN_PX, WORLD_W - w - WORLD_MARGIN_PX);
      const top = clamp(req.feetY - rise, HEADROOM_PX + WORLD_MARGIN_PX, WORLD_H - 60);
      const box: Rect = { x: left, y: top, w, h };
      // The column above the helper must be free, or standing on it means a head bump.
      const headroom: Rect = { x: left, y: top - HEADROOM_PX, w, h: HEADROOM_PX };

      const blocked =
        solids.some((s) => overlaps(box, s, PLATFORM_PAD_PX) || overlaps(headroom, s)) ||
        hazards.some((z) => overlaps(box, z, HAZARD_PAD_PX) || overlaps(headroom, z)) ||
        overlaps(box, goal, PLATFORM_PAD_PX) ||
        (req.player !== undefined && overlaps(box, req.player, PLATFORM_PAD_PX));
      if (!blocked) {
        return { x: round1(nx(left)), y: round1(ny(top)), w: HELPER_W, h: HELPER_H };
      }
    }
  }
  return null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
