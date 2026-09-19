import Phaser from "phaser";
import { PLAYER_H, WORLD_W } from "@sketchquest/shared";
import { HAND_FONT } from "../fonts";
import { INK, INK_CSS } from "../palette";
import { fillPoly, hashString, jitterPoints, rectCorners, seededFor, sketchLine, sketchPoly } from "../sketch";

const DEPTH = 2400;
const FONT_PX = 36;
const MAX_TEXT_W = 980;
const PAD_X = 30;
const PAD_Y = 20;
const SCREEN_MARGIN = 16;
const TAIL_H = 24;
const FADE_MS = 350;
const FOLLOW_LERP = 0.2;

export type Anchor = { x: number; y: number };

/**
 * A hand-drawn speech bubble: paper fill, wobbly marker outline, big dark
 * text that types itself out, then fades. Sits above the player when that
 * fits on screen, otherwise clamps to the top; `pinTop` forces the top.
 * Text is pre-wrapped and the bubble sized for the full line up front, so
 * typing never reflows or resizes it.
 */
export class SpeechBubble {
  private container?: Phaser.GameObjects.Container;
  private tail?: Phaser.GameObjects.Graphics;
  private w = 0;
  private h = 0;
  private pinTop = false;
  private tailKey = "";
  private placed = false;
  private seed = 0;
  private showing = false;

  constructor(private readonly scene: Phaser.Scene) {}

  get active() {
    return this.showing;
  }

  show(text: string, typeMs: number, holdMs: number, pinTop = false) {
    this.destroy();
    const { scene } = this;
    this.pinTop = pinTop;
    this.placed = false;
    this.seed = hashString(text);

    const label = scene.add
      .text(0, 0, text, {
        fontFamily: HAND_FONT,
        fontSize: `${FONT_PX}px`,
        color: INK_CSS.black,
        wordWrap: { width: MAX_TEXT_W, useAdvancedWrap: true },
      })
      .setOrigin(0, 0);
    const full = label.getWrappedText().join("\n");
    label.setText(full);
    this.w = Math.ceil(label.width) + PAD_X * 2;
    this.h = Math.ceil(label.height) + PAD_Y * 2;
    label.setPosition(-this.w / 2 + PAD_X, -this.h / 2 + PAD_Y).setText("");

    const body = scene.add.graphics();
    const rng = seededFor(`bubble:${this.seed}`);
    const corners = jitterPoints(rectCorners(-this.w / 2, -this.h / 2, this.w, this.h), 3, rng);
    fillPoly(body, corners, INK.paper, 0.98);
    sketchPoly(body, corners, { color: INK.black, width: 5, wobble: 2.5 }, rng);

    this.tail = scene.add.graphics();
    this.container = scene.add
      .container(WORLD_W / 2, this.h / 2 + SCREEN_MARGIN, [body, this.tail, label])
      .setDepth(DEPTH)
      .setScrollFactor(0)
      .setRotation(-0.02);
    this.showing = true;

    const chars = full.length;
    scene.tweens.addCounter({
      from: 0,
      to: chars,
      duration: Math.max(200, typeMs),
      onUpdate: (tw) => {
        const n = Math.floor(tw.getValue() ?? 0);
        if (label.active && label.text.length !== n) label.setText(full.slice(0, n));
      },
      onComplete: () => {
        if (label.active) label.setText(full);
        scene.time.delayedCall(holdMs, () => this.fadeOut());
      },
    });
  }

  /** Follows `anchor` (the player) each frame; undefined or pinTop keeps it at the top of the screen. */
  update(anchor?: Anchor) {
    const c = this.container;
    if (!c || !c.active) return;
    const halfW = this.w / 2;
    const halfH = this.h / 2;
    const minY = halfH + SCREEN_MARGIN;

    let tx = WORLD_W / 2;
    let ty = minY;
    let tailX: number | undefined;
    if (anchor && !this.pinTop) {
      tx = Phaser.Math.Clamp(anchor.x, halfW + SCREEN_MARGIN, WORLD_W - halfW - SCREEN_MARGIN);
      const above = anchor.y - PLAYER_H / 2 - TAIL_H - 12 - halfH;
      ty = Math.max(above, minY);
      // The tail only makes sense if the player is actually below the bubble.
      if (anchor.y - PLAYER_H / 2 > ty + halfH + 6) tailX = Phaser.Math.Clamp(anchor.x - tx, -halfW + 36, halfW - 36);
    }

    if (!this.placed) {
      c.setPosition(tx, ty);
      this.placed = true;
    } else {
      c.x += (tx - c.x) * FOLLOW_LERP;
      c.y += (ty - c.y) * FOLLOW_LERP;
    }
    this.drawTail(tailX);
  }

  destroy() {
    this.showing = false;
    this.scene.tweens.killTweensOf(this.container ?? []);
    this.container?.destroy();
    this.container = undefined;
    this.tail = undefined;
  }

  private fadeOut() {
    const c = this.container;
    if (!c || !c.active) return;
    this.scene.tweens.add({
      targets: c,
      alpha: 0,
      duration: FADE_MS,
      onComplete: () => {
        if (this.container === c) this.destroy();
      },
    });
  }

  /** Redrawn only when the (8px-quantized) tail position changes. */
  private drawTail(tailX?: number) {
    const g = this.tail;
    if (!g) return;
    const q = tailX === undefined ? undefined : Math.round(tailX / 8) * 8;
    const key = String(q);
    if (key === this.tailKey) return;
    this.tailKey = key;
    g.clear();
    if (q === undefined) return;
    const y0 = this.h / 2;
    const rng = seededFor(`tail:${this.seed}`);
    g.fillStyle(INK.paper, 0.98).fillTriangle(q - 16, y0 - 2, q + 16, y0 - 2, q + 4, y0 + TAIL_H);
    const ink = { color: INK.black, width: 4.5, wobble: 1.2 };
    sketchLine(g, { x: q - 16, y: y0 }, { x: q + 4, y: y0 + TAIL_H }, ink, rng, 1);
    sketchLine(g, { x: q + 16, y: y0 }, { x: q + 4, y: y0 + TAIL_H }, ink, rng, 1);
  }
}
