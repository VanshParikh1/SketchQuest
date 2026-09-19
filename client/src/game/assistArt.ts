import Phaser from "phaser";
import type { Platform } from "@sketchquest/shared";
import { HAND_FONT } from "./fonts";
import { INK } from "./palette";
import { fillPoly, jitterPoints, rectCorners, seededFor, sketchLine, type Ink, type Pt, type Rng } from "./sketch";
import { sx, sy } from "./units";

/**
 * Helper ("assist") platforms are ordinary platforms whose id starts with
 * "assist-": the server's repair step adds "assist-N", the in-game stuck
 * helper adds "assist-live-N". Physics treat them like any other platform;
 * only the art differs (dashed pencil outline, no scribble fill, a small tag).
 */
export const ASSIST_PREFIX = "assist-";
export const isAssist = (id: string) => id.startsWith(ASSIST_PREFIX);
export const countAssists = (platforms: readonly { id: string }[]) => platforms.filter((p) => isAssist(p.id)).length;

/** Light pencil, thinner and paler than the black marker used for real platforms. */
const PENCIL: Ink = { color: INK.grey, width: 2.4, alpha: 0.5, wobble: 1 };
const DASH_PX = 16;
const GAP_PX = 10;
const MAX_DASHES_PER_EDGE = 60;

const TAG_MS = { fadeIn: 250, hold: 3200, fadeOut: 600 };
const TAG_ALPHA = 0.8;

function dashedEdge(g: Phaser.GameObjects.Graphics, a: Pt, b: Pt, rng: Rng) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(len > 1)) return;
  const period = Math.max(DASH_PX + GAP_PX, len / MAX_DASHES_PER_EDGE);
  const dash = (period * DASH_PX) / (DASH_PX + GAP_PX);
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  for (let d = 0; d < len; d += period) {
    const end = Math.min(len, d + dash);
    if (end - d < 3) continue;
    sketchLine(g, { x: a.x + ux * d, y: a.y + uy * d }, { x: a.x + ux * end, y: a.y + uy * end }, PENCIL, rng, 1);
  }
}

/** Draws one assist platform: a faint paper wash and a dashed pencil outline, no hatching. */
export function drawAssistPlatform(g: Phaser.GameObjects.Graphics, p: Platform) {
  const x = sx(p.x);
  const y = sy(p.y);
  const w = sx(p.w);
  const h = sy(p.h);
  const rng = seededFor(p.id);
  const corners = jitterPoints(rectCorners(x, y, w, h), Math.min(1.5, Math.min(w, h) * 0.15), rng);
  fillPoly(g, corners, INK.paper, 0.6);
  for (let i = 0; i < corners.length; i++) dashedEdge(g, corners[i], corners[(i + 1) % corners.length], rng);
}

/**
 * A tiny handwritten "assist" tag above the platform: fades in, stays a few
 * seconds so it reads as intentional, then fades away. Call once per platform
 * (when the level is first shown, or when a live helper appears).
 */
export function showAssistTag(scene: Phaser.Scene, p: Platform) {
  const rng = seededFor(`${p.id}:tag`);
  const above = sy(p.y) >= 34;
  const tag = scene.add
    .text(sx(p.x + p.w / 2), above ? sy(p.y) - 4 : sy(p.y + p.h) + 4, "assist", {
      fontFamily: HAND_FONT,
      fontSize: "20px",
      color: "#4a4a55",
    })
    .setOrigin(0.5, above ? 1 : 0)
    .setDepth(6)
    .setRotation((rng() - 0.5) * 0.09)
    .setAlpha(0);

  scene.tweens.add({ targets: tag, alpha: TAG_ALPHA, duration: TAG_MS.fadeIn });
  scene.tweens.add({
    targets: tag,
    alpha: { from: TAG_ALPHA, to: 0 },
    delay: TAG_MS.fadeIn + TAG_MS.hold,
    duration: TAG_MS.fadeOut,
    onComplete: () => tag.destroy(),
  });
}
