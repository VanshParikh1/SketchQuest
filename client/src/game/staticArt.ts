import Phaser from "phaser";
import { WORLD_W, WORLD_H, type Level } from "@sketchquest/shared";
import { DEPTH, INK } from "./palette";
import {
  fillPoly,
  hatchPoly,
  jitterPoints,
  rectCorners,
  seededFor,
  sketchLine,
  sketchPoly,
  sketchRect,
} from "./sketch";
import { sx, sy } from "./units";
import { drawAssistPlatform, isAssist } from "./assistArt";

type Box = { id: string; x: number; y: number; w: number; h: number };
const px = (r: Box) => ({ x: sx(r.x), y: sy(r.y), w: sx(r.w), h: sy(r.h) });

const TOOTH_PX = 30;
const MAX_TEETH = 60;

/**
 * Everything in the level that never animates (platforms, spike rows, the lava
 * body, the goal door) is drawn once into a single RenderTexture on level
 * load, so per-frame cost is one textured quad no matter how many scribbles.
 */
export function renderStaticLevel(scene: Phaser.Scene, level: Level): Phaser.GameObjects.RenderTexture {
  const g = scene.make.graphics({}, false);

  for (const p of level.platforms) {
    if (isAssist(p.id)) drawAssistPlatform(g, p);
    else drawPlatform(g, p);
  }
  for (const h of level.hazards) {
    if (h.type === "lava") drawLavaBody(g, h);
    else drawSpikes(g, h);
  }
  drawGoalDoor(g, level.goal);

  const rt = scene.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0, 0).setDepth(DEPTH.staticLevel);
  rt.draw(g);
  g.destroy();
  return rt;
}

function drawPlatform(g: Phaser.GameObjects.Graphics, p: Box) {
  const { x, y, w, h } = px(p);
  const rng = seededFor(p.id);
  const corners = jitterPoints(rectCorners(x, y, w, h), Math.min(2, Math.min(w, h) * 0.2), rng);
  fillPoly(g, corners, INK.paper, 0.94);
  hatchPoly(g, corners, { color: INK.grey, width: 1.8, alpha: 0.32 }, rng, 13, -Math.PI / 4, 4);
  sketchPoly(g, corners, { color: INK.black, width: 4, wobble: 2.2 }, rng);
}

function drawSpikes(g: Phaser.GameObjects.Graphics, h: Box) {
  const { x, y, w, h: height } = px(h);
  const rng = seededFor(h.id);
  const teeth = Math.min(MAX_TEETH, Math.max(1, Math.round(w / TOOTH_PX)));
  const tw = w / teeth;
  const bottom = y + height;
  for (let i = 0; i < teeth; i++) {
    const x0 = x + i * tw;
    const tri = jitterPoints(
      [
        { x: x0, y: bottom },
        { x: x0 + tw / 2, y },
        { x: x0 + tw, y: bottom },
      ],
      Math.min(2, tw * 0.1, height * 0.1),
      rng
    );
    fillPoly(g, tri, 0xffd9d4, 0.55);
    hatchPoly(g, tri, { color: INK.red, width: 1.8, alpha: 0.65 }, rng, 6, Math.PI / 3.2, 2);
    sketchPoly(g, tri, { color: INK.red, width: 3.6, wobble: 1.6 }, rng);
  }
}

function drawLavaBody(g: Phaser.GameObjects.Graphics, h: Box) {
  const { x, y, w, h: height } = px(h);
  const rng = seededFor(h.id);
  const body = rectCorners(x, y + 3, w, Math.max(1, height - 3));
  fillPoly(g, body, INK.lavaFill, 0.55);
  hatchPoly(g, body, { color: INK.orange, width: 2.2, alpha: 0.6 }, rng, 9, Math.PI / 4, 3);
  // Sides and bottom only: the top edge is the animated wave.
  const ink = { color: INK.orange, width: 3, wobble: 1.6 };
  sketchLine(g, { x, y: y + 2 }, { x, y: y + height }, ink, rng);
  sketchLine(g, { x: x + w, y: y + 2 }, { x: x + w, y: y + height }, ink, rng);
  sketchLine(g, { x, y: y + height }, { x: x + w, y: y + height }, ink, rng);
}

function drawGoalDoor(g: Phaser.GameObjects.Graphics, goal: Box) {
  const { x, y, w, h } = px(goal);
  const rng = seededFor(goal.id || "goal");
  const corners = jitterPoints(rectCorners(x, y, w, h), Math.min(1.8, Math.min(w, h) * 0.2), rng);
  fillPoly(g, corners, 0xd6f5dc, 0.85);
  hatchPoly(g, corners, { color: INK.green, width: 1.8, alpha: 0.5 }, rng, 9, -Math.PI / 4, 3);
  sketchPoly(g, corners, { color: INK.green, width: 4, wobble: 2 }, rng);
  if (w > 14 && h > 24) {
    // Inner panel and doorknob.
    sketchRect(g, x + w * 0.2, y + h * 0.14, w * 0.6, h * 0.36, { color: INK.greenDark, width: 2.2, wobble: 1.2 }, rng);
    g.fillStyle(INK.greenDark, 1).fillCircle(x + w * 0.76, y + h * 0.62, Math.max(1.5, Math.min(w, h) * 0.07));
  }
}
