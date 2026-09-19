import Phaser from "phaser";
import { WORLD_H, WORLD_W } from "@sketchquest/shared";
import { HAND_FONT } from "./fonts";

const DEPTH = 2500;
/** How long the title card holds input locked, including its fade-in. */
const FREEZE_MS = 1500;
const FADE_IN_MS = 500;
/** How long "GO!" stays on screen after input unlocks. */
const GO_MS = 400;
const GO_FADE_MS = 120;

/**
 * The level-start title card: fades in the level name, then after
 * FREEZE_MS calls `onGo` (the caller unlocks input there) and flashes "GO!".
 * Everything hangs off the scene's clock/tweens, so a scene restart cleans it up.
 */
export class LevelIntro {
  constructor(scene: Phaser.Scene, levelName: string, onGo: () => void) {
    const card = this.createCard(scene, levelName);
    scene.tweens.add({ targets: card, alpha: 1, duration: FADE_IN_MS, ease: "Quad.easeOut" });

    scene.time.delayedCall(FREEZE_MS, () => {
      card.destroy();
      onGo();
      this.showGo(scene);
    });
  }

  private createCard(scene: Phaser.Scene, levelName: string) {
    const title = scene.add
      .text(0, 0, levelName, {
        fontFamily: HAND_FONT,
        fontSize: "84px",
        color: "#222222",
        align: "center",
        wordWrap: { width: WORLD_W - 320 },
      })
      .setOrigin(0.5);

    const w = title.width + 100;
    const h = title.height + 70;
    const paper = scene.add.graphics();
    paper.fillStyle(0xfffaf0, 0.94).fillRoundedRect(-w / 2, -h / 2, w, h, 26);
    paper.lineStyle(5, 0x222222, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 26);

    return scene.add
      .container(WORLD_W / 2, WORLD_H / 2, [paper, title])
      .setRotation(Phaser.Math.DegToRad(-2))
      .setScrollFactor(0)
      .setDepth(DEPTH)
      .setAlpha(0);
  }

  private showGo(scene: Phaser.Scene) {
    const go = scene.add
      .text(WORLD_W / 2, WORLD_H / 2, "GO!", {
        fontFamily: HAND_FONT,
        fontSize: "150px",
        color: "#2fb457",
        stroke: "#ffffff",
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH)
      .setScale(0.6);

    scene.tweens.add({ targets: go, scale: 1, duration: 150, ease: "Back.easeOut" });
    scene.tweens.add({
      targets: go,
      alpha: 0,
      delay: GO_MS - GO_FADE_MS,
      duration: GO_FADE_MS,
      onComplete: () => go.destroy(),
    });
  }
}
