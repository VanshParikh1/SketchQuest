import Phaser from "phaser";
import { DEPTH, INK } from "./palette";
import { boilTick } from "./animatedArt";
import { redrawEnemy, type Enemy } from "./Enemy";
import type { Player } from "./Player";
import { EF_ALIVE, EF_FACING_LEFT, RECORD_STRIDES, SAMPLE_HZ, type PlayerFrame, type RunRecorder } from "./RunRecorder";
import { ReplayUi } from "./ReplayUi";
import { coinBurst, enemyDeathBurst } from "./particles";
import { playCoin, playJump, playStomp } from "./audio";

/** Pause on the finished run before the loop restarts. */
const HOLD_MS = 800;
/** The last stretch of the recording plays at SLOWMO_SPEED on the first pass only. */
const SLOWMO_WINDOW_MS = 500;
const SLOWMO_SPEED = 0.5;
/** A long frame (tab in the background) must not skip through the run. */
const MAX_DELTA_MS = 100;
const TRAIL_LENGTH = 10;
const TRAIL_STEP_MS = 1000 / SAMPLE_HZ;

type Ghost = { art: Phaser.GameObjects.Graphics; id: string; lastTick: number; visible: boolean };

/**
 * Plays a finished run back from a RunRecorder, forever: the player doodle,
 * enemy ghosts, coin pickups, stomps and jump sounds are all driven from the
 * recorded samples (interpolated), with no physics. The scene owns the live
 * objects; this hides/shows them and draws only through the same renderers.
 * Driven from the scene's update(), so there are no timers or tweens to leak.
 */
export class ReplayController {
  /** Coins picked up so far in the current pass, for the HUD counter. */
  coinsCollected = 0;

  private readonly ghosts: Ghost[];
  private readonly trail: Phaser.GameObjects.Graphics;
  private readonly trailPts: Array<{ x: number; y: number }> = [];
  private readonly ui: ReplayUi;
  private readonly frame: PlayerFrame = { x: 0, y: 0, scaleX: 1, scaleY: 1, flags: 0 };
  private readonly stompAt: number[];

  private t = 0;
  private cursor = 0;
  private loop = -1;
  private holdLeft = 0;
  private coinCursor = 0;
  private stompCursor = 0;
  private jumpCursor = 0;
  private nextTrailAt = 0;
  private trailDrain = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly rec: RunRecorder,
    private readonly player: Player,
    private readonly enemies: readonly Enemy[],
    private readonly coins: readonly Phaser.GameObjects.Rectangle[]
  ) {
    player.enterReplay();
    for (const e of enemies) e.setReplayHidden(true);
    this.ghosts = enemies.map((e) => ({
      art: scene.add.graphics().setDepth(DEPTH.enemy).setVisible(false),
      id: e.id,
      lastTick: -1,
      visible: false,
    }));
    this.stompAt = enemies.map(() => Infinity);
    this.trail = scene.add.graphics().setDepth(DEPTH.player - 1);
    this.ui = new ReplayUi(scene);
    this.startLoop();
  }

  update(delta: number) {
    const dt = Math.min(delta, MAX_DELTA_MS);
    const dur = this.rec.duration;

    if (this.holdLeft > 0) {
      this.holdLeft -= dt;
      this.fadeTrail(dt);
      if (this.holdLeft <= 0) this.startLoop();
    } else {
      const slow = this.loop === 0 && this.t >= dur - SLOWMO_WINDOW_MS;
      this.t += dt * (slow ? SLOWMO_SPEED : 1);
      if (this.t >= dur) {
        this.t = dur;
        this.holdLeft = HOLD_MS;
      }
      this.apply(this.t);
    }

    this.drawTrail();
    this.ui.update(this.scene.time.now);
  }

  destroy() {
    for (const g of this.ghosts) g.art.destroy();
    this.ghosts.length = 0;
    this.trail.destroy();
    this.ui.destroy();
    for (const e of this.enemies) e.setReplayHidden(false);
    this.player.exitReplay();
  }

  private startLoop() {
    this.loop += 1;
    this.t = 0;
    this.cursor = 0;
    this.holdLeft = 0;
    this.coinCursor = 0;
    this.stompCursor = 0;
    this.jumpCursor = 0;
    this.coinsCollected = 0;
    this.nextTrailAt = 0;
    this.trailDrain = 0;
    this.trailPts.length = 0;
    for (const c of this.coins) c.setVisible(true);

    // Stomp times per enemy, so a stomped enemy vanishes at the exact recorded instant.
    this.stompAt.fill(Infinity);
    const s = this.rec.stompEvents;
    for (let i = 0; i < s.length; i += 2) this.stompAt[s[i + 1]] = Math.min(this.stompAt[s[i + 1]], s[i]);

    this.apply(0);
  }

  /** Poses everything at recording time `t` (ms) and fires events that have come due. */
  private apply(t: number) {
    const { rec, frame } = this;
    const { times, playerData, enemyData, count } = rec;
    const tick = boilTick(this.scene);

    while (this.cursor < count - 2 && times[this.cursor + 1] <= t) this.cursor += 1;
    const i = this.cursor;
    const j = Math.min(i + 1, count - 1);
    const span = times[j] - times[i];
    const a = span > 0 ? Phaser.Math.Clamp((t - times[i]) / span, 0, 1) : 0;

    const { player: PS, enemy: ES } = RECORD_STRIDES;
    const p = i * PS;
    const q = j * PS;
    frame.x = playerData[p] + (playerData[q] - playerData[p]) * a;
    frame.y = playerData[p + 1] + (playerData[q + 1] - playerData[p + 1]) * a;
    frame.scaleX = playerData[p + 2] + (playerData[q + 2] - playerData[p + 2]) * a;
    frame.scaleY = playerData[p + 3] + (playerData[q + 3] - playerData[p + 3]) * a;
    frame.flags = playerData[p + 4];
    this.player.drawReplay(tick, frame);

    if (t >= this.nextTrailAt) {
      this.nextTrailAt = t + TRAIL_STEP_MS;
      this.trailPts.push({ x: frame.x, y: frame.y });
      if (this.trailPts.length > TRAIL_LENGTH) this.trailPts.shift();
    }

    const n = rec.enemyCount;
    for (let e = 0; e < n; e++) {
      const o = (i * n + e) * ES;
      const r = (j * n + e) * ES;
      const flags = enemyData[o + 2];
      const ghost = this.ghosts[e];
      const alive = (flags & EF_ALIVE) !== 0 && t < this.stompAt[e];
      if (alive !== ghost.visible) {
        ghost.visible = alive;
        ghost.art.setVisible(alive);
      }
      if (!alive) continue;
      const x = enemyData[o] + (enemyData[r] - enemyData[o]) * a;
      const y = enemyData[o + 1] + (enemyData[r + 1] - enemyData[o + 1]) * a;
      ghost.art.setPosition(x, y).setScale(flags & EF_FACING_LEFT ? -1 : 1, 1);
      if (tick !== ghost.lastTick) {
        ghost.lastTick = tick;
        redrawEnemy(ghost.art, ghost.id, tick);
      }
    }

    this.fireEvents(t);
  }

  private fireEvents(t: number) {
    const { coinEvents, stompEvents, jumpTimes } = this.rec;

    while (this.coinCursor < coinEvents.length && coinEvents[this.coinCursor] <= t) {
      const coin = this.coins[coinEvents[this.coinCursor + 1]];
      this.coinCursor += 2;
      if (!coin) continue;
      coin.setVisible(false);
      this.coinsCollected += 1;
      playCoin();
      coinBurst(this.scene, coin.x, coin.y);
    }

    while (this.stompCursor < stompEvents.length && stompEvents[this.stompCursor] <= t) {
      const ghost = this.ghosts[stompEvents[this.stompCursor + 1]];
      this.stompCursor += 2;
      if (!ghost) continue;
      playStomp();
      enemyDeathBurst(this.scene, ghost.art.x, ghost.art.y);
    }

    while (this.jumpCursor < jumpTimes.length && jumpTimes[this.jumpCursor] <= t) {
      this.jumpCursor += 1;
      playJump();
    }
  }

  /** While holding at the goal, the trail drains away one point per sample slot. */
  private fadeTrail(dt: number) {
    this.trailDrain += dt;
    while (this.trailDrain >= TRAIL_STEP_MS) {
      this.trailDrain -= TRAIL_STEP_MS;
      this.trailPts.shift();
    }
  }

  /** Fading blue silhouettes of the last few positions, oldest faintest. */
  private drawTrail() {
    const g = this.trail;
    g.clear();
    const n = this.trailPts.length;
    for (let k = 0; k < n - 1; k++) {
      const { x, y } = this.trailPts[k];
      const f = (k + 1) / n;
      g.fillStyle(INK.blue, 0.05 + 0.2 * f).fillEllipse(x, y - 3, 29 * (0.55 + 0.4 * f), 38 * (0.55 + 0.4 * f));
    }
  }
}
