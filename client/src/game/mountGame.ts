import Phaser from "phaser";
import { GRAVITY, LevelSchema, WORLD_H, WORLD_W, type Level } from "@sketchquest/shared";
import { GameScene, GAME_SCENE_KEY } from "./GameScene";

export type GameHandle = {
  game: Phaser.Game;
  /** Tear down and rebuild the scene from level JSON. No page refresh. */
  loadLevel(level: Level): void;
  destroy(): void;
};

let current: GameHandle | null = null;

export function mountGame(el: HTMLElement): GameHandle {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: el,
    width: WORLD_W,
    height: WORLD_H,
    backgroundColor: "#f4efe1",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: "arcade", arcade: { gravity: { x: 0, y: GRAVITY }, debug: false } },
    scene: [GameScene],
  });

  const handle: GameHandle = {
    game,
    loadLevel(level) {
      const parsed = LevelSchema.parse(level);
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
export function loadLevel(level: Level): void {
  if (!current) throw new Error("loadLevel called before mountGame");
  current.loadLevel(level);
}
