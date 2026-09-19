import Phaser from "phaser";
import type { MoveInput } from "./Player";

const DEPTH = 1800;
/** Button edge length in world px. */
const BUTTON_SIZE = 120;
const EDGE_MARGIN = 40;
const BUTTON_GAP = 30;
/** Extra reach around a button so a thumb slightly off-target still counts. */
const HIT_PADDING = 20;
/** Two thumbs (run + jump) need at least this many touch pointers. */
const MIN_TOUCH_POINTERS = 3;

type Kind = keyof MoveInput;
type Button = { kind: Kind; x: number; y: number; art: Phaser.GameObjects.Graphics; pressed: boolean };

/** True on touch devices, or anywhere with ?touch=1 (for testing on desktop). */
export function touchControlsEnabled(scene: Phaser.Scene): boolean {
  return (
    scene.sys.game.device.input.touch || new URLSearchParams(window.location.search).get("touch") === "1"
  );
}

/**
 * On-screen left/right/jump buttons, drawn in the scene and pinned to the
 * camera. Pointers are polled each frame rather than using per-button
 * events, so multi-touch works and a thumb can slide between buttons.
 */
export class TouchControls {
  private readonly scene: Phaser.Scene;
  private readonly buttons: Button[];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Pointers live on the input manager and survive scene restarts, so only top up.
    const missing = MIN_TOUCH_POINTERS - (scene.input.manager.pointers.length - 1);
    if (missing > 0) scene.input.addPointer(missing);

    const { width, height } = scene.scale;
    const y = height - EDGE_MARGIN - BUTTON_SIZE / 2;
    const leftX = EDGE_MARGIN + BUTTON_SIZE / 2;
    this.buttons = [
      this.createButton("left", leftX, y),
      this.createButton("right", leftX + BUTTON_SIZE + BUTTON_GAP, y),
      this.createButton("jump", width - EDGE_MARGIN - BUTTON_SIZE / 2, y),
    ];
  }

  /** Which buttons are held right now. Call every frame. */
  read(): MoveInput {
    const held: MoveInput = { left: false, right: false, jump: false };
    for (const pointer of this.scene.input.manager.pointers) {
      if (!pointer.isDown) continue;
      for (const b of this.buttons) {
        if (Math.abs(pointer.x - b.x) <= BUTTON_SIZE / 2 + HIT_PADDING && Math.abs(pointer.y - b.y) <= BUTTON_SIZE / 2 + HIT_PADDING) {
          held[b.kind] = true;
        }
      }
    }

    for (const b of this.buttons) {
      if (b.pressed !== held[b.kind]) {
        b.pressed = held[b.kind];
        this.draw(b);
      }
    }
    return held;
  }

  private createButton(kind: Kind, x: number, y: number): Button {
    const art = this.scene.add.graphics().setPosition(x, y).setScrollFactor(0).setDepth(DEPTH);
    const button: Button = { kind, x, y, art, pressed: false };
    this.draw(button);
    return button;
  }

  private draw({ kind, art, pressed }: Button) {
    const half = BUTTON_SIZE / 2;
    art.clear();
    art.fillStyle(0x222222, pressed ? 0.6 : 0.3).fillRoundedRect(-half, -half, BUTTON_SIZE, BUTTON_SIZE, 28);
    art.lineStyle(4, 0xffffff, pressed ? 0.9 : 0.55).strokeRoundedRect(-half, -half, BUTTON_SIZE, BUTTON_SIZE, 28);

    // Chunky arrow: a triangle head plus a stem, in white.
    art.fillStyle(0xffffff, pressed ? 0.95 : 0.7);
    if (kind === "left") {
      art.fillTriangle(-36, 0, -6, -30, -6, 30).fillRect(-6, -11, 38, 22);
    } else if (kind === "right") {
      art.fillTriangle(36, 0, 6, -30, 6, 30).fillRect(-32, -11, 38, 22);
    } else {
      art.fillTriangle(0, -36, -30, -6, 30, -6).fillRect(-11, -6, 22, 38);
    }
  }
}
