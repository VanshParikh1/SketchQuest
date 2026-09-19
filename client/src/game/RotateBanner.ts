import Phaser from "phaser";
import { WORLD_W } from "@sketchquest/shared";
import { HAND_FONT } from "./fonts";

const DEPTH = 1900;
const TOP_MARGIN = 16;
/** Roughly how tall the banner text should look on the actual screen, in CSS px. */
const TARGET_SCREEN_PX = 16;
const BASE_FONT_PX = 28;
const MAX_SCALE = 3.5;

/**
 * A small "Rotate your phone" pill at the top of the scene, shown while the
 * window is portrait. It is only drawn, never interactive, so play continues
 * underneath. In portrait the 1600px world is shrunk to phone width, so the
 * banner scales itself up to stay readable.
 */
export class RotateBanner {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const label = scene.add
      .text(0, 0, "Rotate your phone", { fontFamily: HAND_FONT, fontSize: `${BASE_FONT_PX}px`, color: "#ffffff" })
      .setOrigin(0.5, 0);
    const w = label.width + 36;
    const h = label.height + 16;
    label.setY(8);
    const pill = scene.add.graphics();
    pill.fillStyle(0x000000, 0.65).fillRoundedRect(-w / 2, 0, w, h, h / 2);

    this.container = scene.add
      .container(WORLD_W / 2, TOP_MARGIN, [pill, label])
      .setScrollFactor(0)
      .setDepth(DEPTH)
      .setVisible(false);
  }

  /** Call every frame. */
  update() {
    const portrait = window.innerHeight > window.innerWidth;
    this.container.setVisible(portrait);
    if (!portrait) return;

    const { displaySize, gameSize } = this.scene.scale;
    const zoom = displaySize.width / gameSize.width;
    const scale = Phaser.Math.Clamp(TARGET_SCREEN_PX / BASE_FONT_PX / zoom, 1, MAX_SCALE);
    this.container.setScale(scale);
  }
}
