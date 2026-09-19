import type Phaser from "phaser";
import { INK } from "./palette";
import { fillPoly, sketchCircle, sketchEllipse, sketchLine, hatchPoly, type Pt, type Rng } from "./sketch";

/**
 * Character doodles, drawn in local coordinates centered on the hitbox and
 * facing right. The owner flips them with a negative scaleX and follows the
 * physics body each frame; these functions only run on boil ticks.
 */

export type PlayerPose = { tick: number; running: boolean; airborne: boolean; rising: boolean };
export type EnemyPose = { tick: number };

/** Ticks between blinks (a blink lasts 2 ticks, ~0.25s at 8 fps). */
const BLINK_EVERY = 26;

const ellipsePoly = (cx: number, cy: number, rx: number, ry: number, n = 14): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 * i) / n;
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
  });

export function drawPlayer(g: Phaser.GameObjects.Graphics, pose: PlayerPose, rng: Rng) {
  const { tick, running, airborne, rising } = pose;
  g.clear();

  // Feet swing while running, tuck and spread in the air.
  const swing = running ? Math.sin(tick * 1.6) : 0;
  const lift = (phase: number) => (running ? Math.max(0, Math.cos(tick * 1.6 + phase)) * 3.5 : 0);
  const footY = airborne ? 18 : 21;
  const feet: Array<[number, number]> = airborne
    ? [
        [-9, footY],
        [9, footY - 1],
      ]
    : [
        [-7 + swing * 6, footY - lift(0)],
        [7 - swing * 6, footY - lift(Math.PI)],
      ];
  for (const [fx, fy] of feet) {
    sketchLine(g, { x: fx - 4, y: fy }, { x: fx + 3.5, y: fy }, { color: INK.blueDark, width: 5, wobble: 0.6 }, rng, 1);
  }

  // Round body: pale fill, blue scribble, doubled blue outline.
  const body = ellipsePoly(0, -3, 14.5, 19);
  g.fillStyle(0xc4d8ff, 0.95).fillEllipse(0, -3, 29, 38);
  hatchPoly(g, body, { color: INK.blue, width: 1.6, alpha: 0.4 }, rng, 6.5, -Math.PI / 4, 3);
  sketchEllipse(g, 0, -3, 15, 19.5, { color: INK.blue, width: 3.4, wobble: 1.3 }, rng);

  // Hair tufts.
  const tuft = { color: INK.blueDark, width: 2.4, wobble: 0.5 };
  sketchLine(g, { x: -1, y: -21.5 }, { x: -4, y: -27 }, tuft, rng, 1);
  sketchLine(g, { x: 3, y: -22 }, { x: 6, y: -27 }, tuft, rng, 1);

  // Eyes: blink to a dash every few seconds; pupils look up while rising.
  const blink = tick % BLINK_EVERY < 2;
  const pupilY = rising ? -1.2 : 0.6;
  for (const ex of [0.5, 9.5]) {
    if (blink) {
      sketchLine(g, { x: ex - 3.5, y: -9 }, { x: ex + 3.5, y: -9 }, { color: INK.black, width: 2, wobble: 0.4 }, rng, 1);
    } else {
      g.fillStyle(0xffffff, 1).fillCircle(ex, -9, 4.4);
      sketchCircle(g, ex, -9, 4.4, { color: INK.black, width: 1.8, wobble: 0.5 }, rng, 1);
      g.fillStyle(INK.black, 1).fillCircle(ex + 1.4, -9 + pupilY, 1.9);
    }
  }

  // Mouth: a smile on the ground, a little "o" in the air.
  if (airborne) sketchCircle(g, 7, 1.5, 2, { color: INK.black, width: 1.8, wobble: 0.3 }, rng, 1);
  else sketchLine(g, { x: 3.5, y: 1 }, { x: 10.5, y: 0.5 }, { color: INK.black, width: 2, wobble: 0.5 }, rng, 1);
}

export function drawEnemy(g: Phaser.GameObjects.Graphics, pose: EnemyPose, rng: Rng) {
  const { tick } = pose;
  g.clear();
  const swing = Math.sin(tick * 1.4);
  const limb = { color: INK.black, width: 3.4, wobble: 0.9 };

  // Legs and arms swing in opposition.
  sketchLine(g, { x: 0, y: 8 }, { x: swing * 8, y: 16 }, limb, rng, 1);
  sketchLine(g, { x: 0, y: 8 }, { x: -swing * 8, y: 16 }, limb, rng, 1);
  sketchLine(g, { x: 0, y: 0 }, { x: -swing * 8, y: 6.5 }, limb, rng, 1);
  sketchLine(g, { x: 0, y: 0 }, { x: swing * 8, y: 6.5 }, limb, rng, 1);
  // Body.
  sketchLine(g, { x: 0, y: -2.5 }, { x: 0, y: 8.5 }, limb, rng);

  // Head, leaning into the walk.
  const hx = 2;
  const hy = -9;
  fillPoly(g, ellipsePoly(hx, hy, 6.3, 6.3, 10), 0xfffaf0, 1);
  sketchCircle(g, hx, hy, 6.5, { color: INK.black, width: 3, wobble: 0.9 }, rng);
  g.fillStyle(INK.black, 1).fillCircle(hx - 1.6, hy - 0.5, 1.2).fillCircle(hx + 3, hy - 0.5, 1.2);
  const brow = { color: INK.red, width: 2, wobble: 0.3 };
  sketchLine(g, { x: hx - 3.2, y: hy - 4.2 }, { x: hx - 0.2, y: hy - 2.6 }, brow, rng, 1);
  sketchLine(g, { x: hx + 5.2, y: hy - 4.2 }, { x: hx + 2.2, y: hy - 2.6 }, brow, rng, 1);
}
