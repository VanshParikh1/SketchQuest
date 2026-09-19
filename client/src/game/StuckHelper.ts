import Phaser from "phaser";
import type { Platform } from "@sketchquest/shared";
import { HAND_FONT } from "./fonts";
import { INK, INK_CSS } from "./palette";
import { fillPoly, jitterPoints, rectCorners, seededFor, sketchCircle, sketchLine, sketchPoly } from "./sketch";

/** This many deaths within STUCK_RADIUS world px of the latest one means the player is stuck. */
export const STUCK_DEATHS = 6;
export const STUCK_RADIUS = 150;
/** Helper platforms allowed per level load (R restarts and respawns keep the count). */
export const MAX_HELPERS = 3;

const HINT_TEXT = "Stuck? Press H (or tap the bulb) for a helper platform";
const HINT_DEPTH = 1900;
const HINT_Y = 848;
const BULB_SIZE = 84;
const BULB_X = 1500;
const BULB_Y = 640;
const FADE_MS = 200;

/** Where the player keeps dying: death x and the world y of their feet at the time. */
export type StuckSpot = { x: number; feetY: number };

/**
 * The "stuck?" offer: state (spot, helpers used, helper platforms added so
 * far) plus the hand-drawn hint and, on touch devices, the light-bulb button.
 * GameScene decides when to arm it (after a death) and does the actual
 * spawning; this only owns what the player sees and how many were used.
 */
export class StuckHelper {
  /** Helper platforms spawned so far this level load. */
  readonly live: Platform[] = [];
  private spot?: StuckSpot;
  private suppressed = false;
  private shown = false;

  private readonly scene: Phaser.Scene;
  private readonly hint: Phaser.GameObjects.Container;
  private readonly bulb?: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, showBulb: boolean, onBulbTap: () => void) {
    this.scene = scene;
    this.hint = this.buildHint();
    if (showBulb) {
      this.bulb = this.buildBulb();
      const zone = scene.add
        .zone(BULB_X, BULB_Y, BULB_SIZE + 24, BULB_SIZE + 24)
        .setScrollFactor(0)
        .setDepth(HINT_DEPTH + 1)
        .setInteractive();
      zone.on("pointerdown", () => {
        if (this.shown) onBulbTap();
      });
    }
    this.hint.setVisible(false);
    this.bulb?.setVisible(false);
  }

  get used() {
    return this.live.length;
  }

  /** True while the hint is on offer: stuck at a spot and helpers remain. */
  get active() {
    return this.spot !== undefined && this.used < MAX_HELPERS;
  }

  get currentSpot(): StuckSpot | undefined {
    return this.active ? this.spot : undefined;
  }

  /** The player is stuck here: start offering a helper (no-op once all are used). */
  arm(spot: StuckSpot) {
    this.spot = spot;
    this.refresh();
  }

  /** A helper platform was placed: count it and take the offer down until the next stuck streak. */
  commit(platform: Platform) {
    this.live.push(platform);
    this.spot = undefined;
    this.refresh();
  }

  /** Hide the offer during the level intro and the win screen without forgetting it. */
  suppress(on: boolean) {
    if (on === this.suppressed) return;
    this.suppressed = on;
    this.refresh();
  }

  private refresh() {
    const show = this.active && !this.suppressed;
    if (show === this.shown) return;
    this.shown = show;
    for (const part of [this.hint, this.bulb]) {
      if (!part) continue;
      this.scene.tweens.killTweensOf(part);
      part.setVisible(show);
      if (show) {
        part.setAlpha(0);
        this.scene.tweens.add({ targets: part, alpha: 1, duration: FADE_MS });
      }
    }
    if (show && this.bulb) {
      this.scene.tweens.add({ targets: this.bulb, scale: 1.08, duration: 550, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    } else {
      this.bulb?.setScale(1);
    }
  }

  private buildHint(): Phaser.GameObjects.Container {
    const text = this.scene.add
      .text(0, 0, HINT_TEXT, {
        fontFamily: HAND_FONT,
        fontSize: "30px",
        color: INK_CSS.black,
      })
      .setOrigin(0.5);
    const rng = seededFor("stuck-hint");
    const w = text.width + 52;
    const h = text.height + 22;
    const card = this.scene.add.graphics();
    const corners = jitterPoints(rectCorners(-w / 2, -h / 2, w, h), 3, rng);
    fillPoly(card, corners, INK.paper, 0.92);
    sketchPoly(card, corners, { color: INK.black, width: 3.4, alpha: 0.75, wobble: 2 }, rng);
    sketchLine(card, { x: -w / 2 + 26, y: h / 2 - 7 }, { x: w / 2 - 26, y: h / 2 - 8 }, { color: INK.blue, width: 2.6, alpha: 0.6, wobble: 1.4 }, rng);

    return this.scene.add
      .container(this.scene.scale.width / 2, HINT_Y, [card, text])
      .setScrollFactor(0)
      .setDepth(HINT_DEPTH)
      .setRotation(-0.01);
  }

  /** Hand-drawn light bulb on a paper button, drawn once. */
  private buildBulb(): Phaser.GameObjects.Container {
    const rng = seededFor("stuck-bulb");
    const art = this.scene.add.graphics();
    const half = BULB_SIZE / 2;
    const corners = jitterPoints(rectCorners(-half, -half, BULB_SIZE, BULB_SIZE), 3, rng);
    fillPoly(art, corners, INK.paper, 0.8);
    sketchPoly(art, corners, { color: INK.black, width: 4, alpha: 0.7, wobble: 2.2 }, rng);

    art.fillStyle(0xffec80, 0.95).fillCircle(0, -8, 17);
    sketchCircle(art, 0, -8, 17.5, { color: INK.yellowDark, width: 3.4, wobble: 1.2 }, rng);
    const base = { color: INK.black, width: 3.4, alpha: 0.75, wobble: 0.8 };
    sketchLine(art, { x: -8, y: 14 }, { x: 8, y: 14 }, base, rng);
    sketchLine(art, { x: -6, y: 21 }, { x: 6, y: 21 }, base, rng);
    const ray = { color: INK.yellowDark, width: 3, alpha: 0.9, wobble: 0.8 };
    sketchLine(art, { x: 0, y: -34 }, { x: 0, y: -40 }, ray, rng);
    sketchLine(art, { x: -25, y: -22 }, { x: -31, y: -27 }, ray, rng);
    sketchLine(art, { x: 25, y: -22 }, { x: 31, y: -27 }, ray, rng);

    return this.scene.add.container(BULB_X, BULB_Y, [art]).setScrollFactor(0).setDepth(HINT_DEPTH);
  }
}
