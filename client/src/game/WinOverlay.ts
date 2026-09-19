import Phaser from "phaser";
import { WORLD_H, WORLD_W, type WinEvent } from "@sketchquest/shared";

const DEPTH = 2000;
/** Taps are ignored briefly so a jump-mash at the goal can't skip the overlay. */
const TAP_DELAY_MS = 500;

/** The "LEVEL CLEAR" overlay shown on reaching the goal. Tapping anywhere calls `onReplay`. */
export class WinOverlay {
  private readonly container: Phaser.GameObjects.Container;
  private readonly tapZone: Phaser.GameObjects.Zone;

  constructor(scene: Phaser.Scene, payload: WinEvent, onReplay: () => void) {
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
      .text(WORLD_W / 2, WORLD_H / 2 + 60, "press R or tap to replay", {
        fontFamily: "sans-serif",
        fontSize: "18px",
        color: "#f2c200",
      })
      .setOrigin(0.5);

    this.container = scene.add.container(0, 0, [bg, title, stats, hint]);
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
