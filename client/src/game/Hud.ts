import Phaser from "phaser";

const STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: "sans-serif",
  fontSize: "20px",
  color: "#222222",
  backgroundColor: "#ffffffcc",
  padding: { x: 8, y: 4 },
};

/** Small top-left coin counter, fixed to the camera. */
export class Hud {
  private readonly coinText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.coinText = scene.add.text(16, 16, "Coins: 0", STYLE).setScrollFactor(0).setDepth(1000);
  }

  setCoins(coins: number) {
    this.coinText.setText(`Coins: ${coins}`);
  }
}
