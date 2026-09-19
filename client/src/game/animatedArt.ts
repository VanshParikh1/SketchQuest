import Phaser from "phaser";
import type { Hazard, Level } from "@sketchquest/shared";
import { BOIL_MS, BOIL_VARIANTS, DEPTH, INK, INK_CSS } from "./palette";
import { HAND_FONT } from "./fonts";
import {
  fillPoly,
  hashString,
  seededFor,
  sketchCircle,
  sketchLine,
  sketchPoly,
  starPoints,
  strokePolyline,
} from "./sketch";
import { COIN_SIZE, sx, sy } from "./units";

/** Current flip-book frame number (~8 per second). Animated art redraws only when this changes. */
export const boilTick = (scene: Phaser.Scene) => Math.floor(scene.time.now / BOIL_MS);
const variantOf = (tick: number) => tick % BOIL_VARIANTS;

/** Above this many coins the wobble stops boiling (they still bob), to keep phones smooth. */
const MAX_BOILING_COINS = 40;
const MAX_BUBBLES = 6;
const WAVE_STEP_PX = 14;

/** Wavy top line and rising bubbles for one lava hazard. Its filled body is baked into the static layer. */
class LavaSurface {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly x: number;
  private readonly y: number;
  private readonly w: number;
  private readonly h: number;
  private readonly id: string;
  private readonly bubbles: Array<{ fx: number; size: number; phase: number; speed: number }> = [];
  private lastTick = -1;

  constructor(scene: Phaser.Scene, hazard: Hazard) {
    this.id = hazard.id;
    this.x = sx(hazard.x);
    this.y = sy(hazard.y);
    this.w = sx(hazard.w);
    this.h = sy(hazard.h);
    this.g = scene.add.graphics().setDepth(DEPTH.lava);

    const rng = seededFor(`${hazard.id}:bubbles`);
    const count = this.h < 14 ? 0 : Math.min(MAX_BUBBLES, Math.max(1, Math.round(this.w / 70)));
    for (let i = 0; i < count; i++) {
      this.bubbles.push({ fx: 0.08 + rng() * 0.84, size: 3 + rng() * 3, phase: rng(), speed: 0.35 + rng() * 0.4 });
    }
  }

  update(tick: number) {
    if (tick === this.lastTick) return;
    this.lastTick = tick;
    const { g, x, y, w, h } = this;
    const rng = seededFor(this.id, variantOf(tick));
    const t = (tick * BOIL_MS) / 1000;
    g.clear();

    const steps = Math.min(120, Math.max(2, Math.ceil(w / WAVE_STEP_PX)));
    const wave = (i: number, lift: number) => ({
      x: x + (w * i) / steps,
      y: y + lift + Math.sin(i * 0.85 + t * 4) * 2.6 + (rng() - 0.5) * 2,
    });
    const top = Array.from({ length: steps + 1 }, (_, i) => wave(i, 1));
    const under = Array.from({ length: steps + 1 }, (_, i) => wave(i, 5));
    strokePolyline(g, under, { color: INK.lavaFill, width: 3, alpha: 0.9 }, rng);
    strokePolyline(g, top, { color: INK.red, width: 4 }, rng);

    for (const b of this.bubbles) {
      const p = (b.phase + t * b.speed) % 1;
      const r = b.size * (1 - p * 0.45);
      const by = y + h - 4 - p * Math.max(0, h - 10);
      const bx = x + w * b.fx + Math.sin(p * Math.PI * 3 + b.phase * 6) * 3;
      if (by - r < y + 2) continue;
      sketchCircle(g, bx, by, r, { color: INK.orange, width: 2, wobble: 0.8 }, rng, 1);
    }
  }
}

/** A yellow marker coin with a gentle bob, a scribble highlight and an occasional twinkle. */
class CoinArt {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly baseY: number;
  private readonly phase: number;
  private readonly id: string;
  private lastTick = -1;
  private lastVisible = true;

  constructor(scene: Phaser.Scene, id: string, x: number, y: number) {
    this.id = id;
    this.baseY = y;
    this.phase = (hashString(id) % 628) / 100;
    this.g = scene.add.graphics().setPosition(x, y).setDepth(DEPTH.coin);
  }

  update(tick: number, now: number, visible: boolean, boil: boolean) {
    if (visible !== this.lastVisible) {
      this.lastVisible = visible;
      this.g.setVisible(visible);
    }
    if (!visible) return;

    this.g.y = this.baseY + Math.sin(now / 420 + this.phase) * 3;
    if (tick === this.lastTick) return;
    if (!boil && this.lastTick !== -1) return;
    this.lastTick = tick;

    const { g } = this;
    const r = COIN_SIZE / 2;
    const rng = seededFor(this.id, variantOf(tick));
    g.clear();
    g.fillStyle(0xffec80, 0.95).fillCircle(0, 0, r - 1);
    sketchCircle(g, 0, 0, r - 0.5, { color: INK.yellowDark, width: 3, wobble: 1.1 }, rng);
    // Scribble highlight, up-left.
    sketchLine(g, { x: -r * 0.55, y: -r * 0.05 }, { x: -r * 0.15, y: -r * 0.55 }, { color: 0xffffff, width: 2, wobble: 0.6 }, rng, 1);
    sketchLine(g, { x: -r * 0.2, y: r * 0.35 }, { x: r * 0.3, y: -r * 0.2 }, { color: INK.yellowDark, width: 1.6, alpha: 0.7, wobble: 0.6 }, rng, 1);

    // Twinkle: a little cross that grows and shrinks over a few frames.
    const sparkle = [0, 0, 0, 2, 4, 2, 0, 0][(tick + Math.floor(this.phase * 3)) % 8];
    if (sparkle > 0) {
      const sxp = r * 0.75;
      const syp = -r * 0.9;
      const ink = { color: INK.yellowDark, width: 2, wobble: 0.3 };
      sketchLine(g, { x: sxp - sparkle, y: syp }, { x: sxp + sparkle, y: syp }, ink, rng, 1);
      sketchLine(g, { x: sxp, y: syp - sparkle }, { x: sxp, y: syp + sparkle }, ink, rng, 1);
    }
  }
}

/** "GOAL" lettering with a twinkling star above the door (the door itself is in the static layer). */
class GoalDoodle {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly starX: number;
  private readonly starY: number;
  private lastTick = -1;

  constructor(scene: Phaser.Scene, goal: Level["goal"]) {
    const cx = sx(goal.x + goal.w / 2);
    const y = Math.max(22, sy(goal.y) - 28);
    this.label = scene.add
      .text(cx, y, "GOAL", { fontFamily: HAND_FONT, fontSize: "26px", color: INK_CSS.green, stroke: INK_CSS.paper, strokeThickness: 5 })
      .setOrigin(0.5)
      .setRotation(-0.07)
      .setDepth(DEPTH.goal);
    this.starX = cx + this.label.width / 2 + 16;
    this.starY = y;
    this.g = scene.add.graphics().setDepth(DEPTH.goal);
  }

  update(tick: number) {
    if (tick === this.lastTick) return;
    this.lastTick = tick;
    const rng = seededFor("goal-star", variantOf(tick));
    const pulse = [9, 10.5, 12, 10.5][tick % 4];
    const pts = starPoints(this.starX, this.starY, pulse, pulse * 0.45, -Math.PI / 2 + (rng() - 0.5) * 0.3);
    this.g.clear();
    fillPoly(this.g, pts, 0xffe259, 0.9);
    sketchPoly(this.g, pts, { color: INK.yellowDark, width: 2.4, wobble: 1 }, rng);
  }
}

/** All animated, non-character level art. Static geometry lives in staticArt.ts; this only redraws on boil ticks. */
export class LevelDoodles {
  private readonly lava: LavaSurface[];
  private readonly coinArts: CoinArt[];
  private readonly goal: GoalDoodle;
  private readonly boilCoins: boolean;

  constructor(
    scene: Phaser.Scene,
    level: Level,
    private readonly coinRects: Phaser.GameObjects.Rectangle[]
  ) {
    this.lava = level.hazards.filter((h) => h.type === "lava").map((h) => new LavaSurface(scene, h));
    this.coinArts = level.coins.map((c) => new CoinArt(scene, c.id, sx(c.x), sy(c.y)));
    this.goal = new GoalDoodle(scene, level.goal);
    this.boilCoins = level.coins.length <= MAX_BOILING_COINS;
  }

  update(scene: Phaser.Scene) {
    const tick = boilTick(scene);
    const now = scene.time.now;
    for (const l of this.lava) l.update(tick);
    this.goal.update(tick);
    this.coinArts.forEach((art, i) => art.update(tick, now, this.coinRects[i]?.visible ?? false, this.boilCoins));
  }
}
