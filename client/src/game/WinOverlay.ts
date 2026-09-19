import Phaser from "phaser";
import { WORLD_H, WORLD_W, type WinEvent } from "@sketchquest/shared";
import { HAND_FONT } from "./fonts";
import { INK, INK_CSS } from "./palette";
import { fillPoly, jitterPoints, rectCorners, seededFor, sketchLine, sketchPoly } from "./sketch";

const DEPTH = 2000;
/** Taps are ignored briefly so a jump-mash at the goal can't skip the overlay. */
const TAP_DELAY_MS = 500;

/** The "LEVEL CLEAR" overlay shown on reaching the goal. Tapping anywhere calls `onReplay`. */
export class WinOverlay {
  private readonly container: Phaser.GameObjects.Container;
  private readonly tapZone: Phaser.GameObjects.Zone;

  constructor(scene: Phaser.Scene, payload: WinEvent, onReplay: () => void) {
    const cx = WORLD_W / 2;
    const cy = WORLD_H / 2;
    const rng = seededFor("win-card");
    const card = scene.add.graphics();
    const corners = jitterPoints(rectCorners(cx - 290, cy - 140, 580, 280), 3, rng);
    fillPoly(card, corners, INK.paper, 0.97);
    sketchPoly(card, corners, { color: INK.black, width: 5, wobble: 2.5 }, rng);
    sketchLine(card, { x: cx - 200, y: cy - 38 }, { x: cx + 200, y: cy - 36 }, { color: INK.green, width: 4, wobble: 2 }, rng);

    const title = scene.add
      .text(cx, cy - 78, "LEVEL CLEAR", { fontFamily: HAND_FONT, fontSize: "62px", color: INK_CSS.green, stroke: INK_CSS.paper, strokeThickness: 8 })
      .setOrigin(0.5)
      .setRotation(-0.03);
    const stats = scene.add
      .text(cx, cy + 20, `Time: ${payload.timeAlive.toFixed(1)}s   Coins: ${payload.coins}`, {
        fontFamily: HAND_FONT,
        fontSize: "34px",
        color: INK_CSS.black,
      })
      .setOrigin(0.5)
      .setRotation(0.015);
    const hint = scene.add
      .text(cx, cy + 88, "press R or tap to replay", { fontFamily: HAND_FONT, fontSize: "26px", color: INK_CSS.blue })
      .setOrigin(0.5)
      .setRotation(-0.02);

    this.container = scene.add.container(0, 0, [card, title, stats, hint]);
    this.container.setScrollFactor(0);
    this.container.setDepth(DEPTH);

    this.tapZone = scene.add.zone(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H).setScrollFactor(0).setDepth(DEPTH);
    scene.time.delayedCall(TAP_DELAY_MS, () => {
      if (this.tapZone.scene) this.tapZone.setInteractive().once("pointerdown", onReplay);
    });
  }

  destroy() {
    this.tapZone.destroy();
    this.container.destroy();
  }
}
