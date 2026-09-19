import Phaser from "phaser";
import type { MoveInput } from "./Player";
import { INK } from "./palette";
import { fillPoly, jitterPoints, rectCorners, seededFor, sketchLine, sketchPoly } from "./sketch";

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

  /** Hand-drawn button: seeded per kind, so redrawing on press/release doesn't change the wobble. */
  private draw({ kind, art, pressed }: Button) {
    const half = BUTTON_SIZE / 2;
    const rng = seededFor(`touch:${kind}`);
    art.clear();
    const corners = jitterPoints(rectCorners(-half, -half, BUTTON_SIZE, BUTTON_SIZE), 3, rng);
    fillPoly(art, corners, pressed ? 0xbcd3ff : INK.paper, pressed ? 0.85 : 0.5);
    sketchPoly(art, corners, { color: INK.black, width: 4, alpha: pressed ? 0.9 : 0.55, wobble: 2.2 }, rng);

    // Chunky marker arrow.
    const ink = { color: pressed ? INK.blueDark : INK.black, width: 6, alpha: pressed ? 0.95 : 0.6, wobble: 1.4 };
    const dir = kind === "left" ? [-1, 0] : kind === "right" ? [1, 0] : [0, -1];
    const [dx, dy] = dir;
    const px = -dy; // perpendicular
    const py = dx;
    const at = (along: number, across: number) => ({ x: dx * along + px * across, y: dy * along + py * across });
    sketchLine(art, at(-30, 0), at(30, 0), ink, rng);
    sketchLine(art, at(30, 0), at(6, -24), ink, rng);
    sketchLine(art, at(30, 0), at(6, 24), ink, rng);
  }
}
