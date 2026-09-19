import Phaser from "phaser";
import { WORLD_H, WORLD_W, type WinEvent } from "@sketchquest/shared";

const DEPTH = 2000;

/** The "LEVEL CLEAR" overlay shown on reaching the goal. */
export class WinOverlay {
  private readonly container: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, payload: WinEvent) {
    const bg = scene.add.rectangle(WORLD_W / 2, WORLD_H / 2, 440, 220, 0x000000, 0.72);
    const title = scene.add
      .text(WORLD_W / 2, WORLD_H / 2 - 60, "LEVEL CLEAR", {
        fontFamily: "sans-serif",
        fontSize: "40px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
    const stats = scene.add
      .text(
        WORLD_W / 2,
        WORLD_H / 2,
        `Time: ${payload.timeAlive.toFixed(1)}s   Coins: ${payload.coins}`,
        { fontFamily: "sans-serif", fontSize: "22px", color: "#ffffff" }
      )
      .setOrigin(0.5);
    const hint = scene.add
      .text(WORLD_W / 2, WORLD_H / 2 + 60, "press R to replay", {
        fontFamily: "sans-serif",
        fontSize: "18px",
        color: "#f2c200",
      })
      .setOrigin(0.5);

    this.container = scene.add.container(0, 0, [bg, title, stats, hint]);
    this.container.setScrollFactor(0);
    this.container.setDepth(DEPTH);
  }

  destroy() {
    this.container.destroy();
  }
}
