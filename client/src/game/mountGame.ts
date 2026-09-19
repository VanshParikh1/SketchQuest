import Phaser from "phaser";
import { GRAVITY, WORLD_H, WORLD_W } from "@sketchquest/shared";
import { GameScene, GAME_SCENE_KEY } from "./GameScene";
import { prepareLevel } from "./prepareLevel";
import { DEBUG } from "./debug";
import { installAudioUnlock } from "./audio";
import { lockTouchBehavior } from "./touchLock";

export type GameHandle = {
  game: Phaser.Game;
  /**
   * Tear down and rebuild the scene from level JSON. No page refresh.
   * Accepts untrusted data (e.g. raw Gemini output): bad entities are
   * clamped or dropped by sanitizeLevel() instead of throwing, and
   * fixLevel() moves the spawn/goal/coins somewhere playable.
   */
  loadLevel(level: unknown): void;
  destroy(): void;
};

let current: GameHandle | null = null;

export function mountGame(el: HTMLElement): GameHandle {
  installAudioUnlock();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: el,
    width: WORLD_W,
    height: WORLD_H,
    backgroundColor: "#f4efe1",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: "arcade", arcade: { gravity: { x: 0, y: GRAVITY }, debug: DEBUG } },
    scene: [GameScene],
  });

  // The canvas exists once Phaser has booted (immediately, if the DOM was already ready).
  const lockCanvas = () => lockTouchBehavior(game.canvas);
  if (game.isBooted) lockCanvas();
  else game.events.once(Phaser.Core.Events.BOOT, lockCanvas);

  const handle: GameHandle = {
    game,
    loadLevel(level) {
      const parsed = prepareLevel(level);
      const start = () => game.scene.start(GAME_SCENE_KEY, { level: parsed });
      if (game.isBooted) start();
      else game.events.once(Phaser.Core.Events.READY, start);
    },
    destroy() {
      if (current === handle) current = null;
      game.destroy(true);
    },
  };

  current = handle;
  return handle;
}

/** Load a level into the currently mounted game. */
export function loadLevel(level: unknown): void {
  if (!current) throw new Error("loadLevel called before mountGame");
  current.loadLevel(level);
}
