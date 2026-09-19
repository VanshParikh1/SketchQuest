import Phaser from "phaser";
import { WORLD_H, WORLD_W } from "@sketchquest/shared";
import { HAND_FONT } from "./fonts";
import { INK, INK_CSS } from "./palette";
import { fillPoly, jitterPoints, rectCorners, seededFor, sketchCircle, sketchLine, sketchPoly } from "./sketch";

const UI_DEPTH = 1900;

/**
 * The "REPLAY" badge (with a pulsing red dot) at the top and the hand-drawn
 * "press R / tap to play again" prompt at the bottom. Drawn once; only the
 * dot and prompt are nudged per frame, from the scene clock (no tweens).
 */
export class ReplayUi {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly dot: Phaser.GameObjects.Graphics;
  private readonly prompt: Phaser.GameObjects.Container;
  private readonly promptY: number;

  constructor(scene: Phaser.Scene) {
    const cx = WORLD_W / 2;

    // Badge.
    const bw = 220;
    const bh = 64;
    const bx = cx - bw / 2;
    const by = 22;
    const rng = seededFor("replay-badge");
    const frame = scene.add.graphics().setDepth(UI_DEPTH).setScrollFactor(0);
    const corners = jitterPoints(rectCorners(bx, by, bw, bh), 2.5, rng);
    fillPoly(frame, corners, INK.paper, 0.85);
    sketchPoly(frame, corners, { color: INK.black, width: 4, alpha: 0.9, wobble: 2 }, rng);
    const label = scene.add
      .text(cx + 20, by + bh / 2, "REPLAY", { fontFamily: HAND_FONT, fontSize: "38px", color: INK_CSS.black })
      .setOrigin(0.5)
      .setRotation(-0.025)
      .setDepth(UI_DEPTH)
      .setScrollFactor(0);
    // Red recording dot: filled disc plus a marker outline, pulsed in update().
    this.dot = scene.add.graphics().setPosition(bx + 42, by + bh / 2).setDepth(UI_DEPTH).setScrollFactor(0);
    this.dot.fillStyle(INK.red, 1).fillCircle(0, 0, 12);
    sketchCircle(this.dot, 0, 0, 12.5, { color: 0x8f2a24, width: 2.6, wobble: 1 }, rng, 1);

    // Prompt: marker text over a wobbly underline and a little curly arrow, bobbing gently.
    this.promptY = WORLD_H - 62;
    const prng = seededFor("replay-prompt");
    const text = scene.add
      .text(0, 0, "press R / tap to play again", {
        fontFamily: HAND_FONT,
        fontSize: "34px",
        color: INK_CSS.blue,
        stroke: INK_CSS.paper,
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setRotation(-0.02);
    const half = text.width / 2 + 6;
    const doodle = scene.add.graphics();
    sketchLine(doodle, { x: -half, y: 26 }, { x: half, y: 24 }, { color: INK.blue, width: 3.4, wobble: 2 }, prng);
    sketchLine(doodle, { x: -half + 30, y: 33 }, { x: half - 50, y: 32 }, { color: INK.blue, width: 2.4, alpha: 0.7, wobble: 2 }, prng);
    this.prompt = scene.add.container(cx, this.promptY, [doodle, text]).setDepth(UI_DEPTH).setScrollFactor(0);

    this.objects.push(frame, label, this.dot, this.prompt);
  }

  update(now: number) {
    this.dot.setAlpha(0.55 + 0.45 * Math.sin(now / 260));
    this.prompt.y = this.promptY + Math.sin(now / 500) * 3;
  }

  destroy() {
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
  }
}
