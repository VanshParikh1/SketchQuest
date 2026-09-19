import Phaser from "phaser";
import { HAND_FONT } from "./fonts";
import { INK, INK_CSS } from "./palette";
import { seededFor, sketchCircle, sketchLine } from "./sketch";

const STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: HAND_FONT,
  fontSize: "32px",
  color: INK_CSS.black,
  stroke: INK_CSS.paper,
  strokeThickness: 6,
};
const HUD_DEPTH = 1000;

/** Top-left marker-written coin counter (with a doodled coin and underline), fixed to the camera. */
export class Hud {
  private readonly coinText: Phaser.GameObjects.Text;
  private readonly mutedText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    // Static doodles: drawn once, never redrawn.
    const rng = seededFor("hud");
    const doodle = scene.add.graphics().setScrollFactor(0).setDepth(HUD_DEPTH);
    doodle.fillStyle(0xffec80, 0.95).fillCircle(38, 40, 13);
    sketchCircle(doodle, 38, 40, 13.5, { color: INK.yellowDark, width: 3.4, wobble: 1.2 }, rng);
    sketchLine(doodle, { x: 20, y: 66 }, { x: 170, y: 65 }, { color: INK.blue, width: 3, alpha: 0.7, wobble: 1.6 }, rng);

    this.coinText = scene.add.text(62, 22, "Coins: 0", STYLE).setScrollFactor(0).setDepth(HUD_DEPTH).setRotation(-0.035);
    this.mutedText = scene.add
      .text(20, 78, "Muted (M)", { ...STYLE, fontSize: "24px", color: INK_CSS.red })
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH)
      .setRotation(0.03)
      .setVisible(false);
  }

  setMuted(muted: boolean) {
    this.mutedText.setVisible(muted);
  }

  setCoins(coins: number) {
    const label = `Coins: ${coins}`;
    if (this.coinText.text !== label) this.coinText.setText(label);
  }
}
