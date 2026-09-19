import Phaser from "phaser";

const STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: "monospace",
  fontSize: "16px",
  color: "#0f0",
  backgroundColor: "#000000aa",
  padding: { x: 8, y: 4 },
};

/** Debug-only (?debug=1) text: attempt / deathsAtSpot / timeAlive, top-right. */
export class DebugOverlay {
  private readonly text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.text = scene.add
      .text(scene.scale.width - 16, 16, "", STYLE)
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1000);
  }

  update(attempt: number, deathsAtSpot: number, timeAlive: number) {
    this.text.setText(
      `attempt: ${attempt}\ndeathsAtSpot: ${deathsAtSpot}\ntimeAlive: ${timeAlive.toFixed(1)}s\n[1/2/3] test levels`
    );
  }
}
