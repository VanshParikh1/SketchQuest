import Phaser from "phaser";
import { WORLD_H, WORLD_W } from "@sketchquest/shared";
import { HAND_FONT } from "./fonts";
import { INK_CSS } from "./palette";

const DEPTH = 1500;
const RISE_PX = 100;
const DURATION_MS = 700;
/** Keeps the text (and its rise) inside the visible world. */
const EDGE_MARGIN_X = 160;
const EDGE_MARGIN_Y = 90;

/** A hand-lettered word that pops in at (x, y), rises and fades out in ~700ms. */
export function floatText(scene: Phaser.Scene, message: string, x: number, y: number, color: string) {
  const text = scene.add
    .text(
      Phaser.Math.Clamp(x, EDGE_MARGIN_X, WORLD_W - EDGE_MARGIN_X),
      Phaser.Math.Clamp(y, EDGE_MARGIN_Y + RISE_PX, WORLD_H - EDGE_MARGIN_Y),
      message,
      {
        fontFamily: HAND_FONT,
        fontSize: "60px",
        color,
        stroke: INK_CSS.paper,
        strokeThickness: 9,
      }
    )
    .setOrigin(0.5)
    .setDepth(DEPTH)
    .setRotation(Phaser.Math.FloatBetween(-0.1, 0.1))
    .setScale(0.6);

  scene.tweens.add({ targets: text, scale: 1, duration: 120, ease: "Back.easeOut" });
  scene.tweens.add({
    targets: text,
    y: text.y - RISE_PX,
    alpha: 0,
    duration: DURATION_MS,
    ease: "Quad.easeIn",
    onComplete: () => text.destroy(),
  });
}
