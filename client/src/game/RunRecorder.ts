import type { Enemy } from "./Enemy";
import type { Player } from "./Player";

/** Recording rate, driven by game time (not frames): one sample per 1/30 s. */
export const SAMPLE_HZ = 30;
const SAMPLE_MS = 1000 / SAMPLE_HZ;
/** Attempts longer than this are not recorded (no replay is offered for them). */
const MAX_RECORD_MS = 120_000;
const MAX_SAMPLES = Math.ceil((MAX_RECORD_MS / 1000) * SAMPLE_HZ) + 2;
/** Recordings shorter than this (an instant goal) aren't worth replaying. */
const MIN_REPLAY_MS = 300;
const MAX_JUMP_EVENTS = 2000;

/** Player pose bits, enough to redraw the doodle (legs, eyes, mouth) exactly as it was. */
export const PF_RUNNING = 1;
export const PF_AIRBORNE = 2;
export const PF_RISING = 4;
/** Grounded and still inside the landing squash. Informational: the squash itself is in scaleX/scaleY. */
export const PF_LANDING = 8;
export const PF_FACING_LEFT = 16;

/** Enemy bits. */
export const EF_ALIVE = 1;
export const EF_FACING_LEFT = 2;

export type PlayerFrame = { x: number; y: number; scaleX: number; scaleY: number; flags: number };

const P_STRIDE = 5;
const E_STRIDE = 3;

/**
 * Records the current attempt at a fixed 30 Hz into preallocated typed arrays
 * (~1 MB worst case), plus timestamped coin pickups, stomps and jumps.
 * Only the current attempt matters: `clear()` runs at every attempt start.
 */
export class RunRecorder {
  count = 0;
  /** Set when the attempt outran the cap; such a recording is unusable. */
  overflowed = false;

  /** Sample timestamps in ms since the attempt started. */
  readonly times = new Float32Array(MAX_SAMPLES);
  /** Per sample: x, y, scaleX, scaleY, flags. */
  readonly playerData = new Float32Array(MAX_SAMPLES * P_STRIDE);
  /** Per sample, per enemy: x, y, flags. */
  readonly enemyData: Float32Array;
  /** Flat [t, coinIndex, ...], [t, enemyIndex, ...] and [t, ...] lists, in time order. */
  readonly coinEvents: number[] = [];
  readonly stompEvents: number[] = [];
  readonly jumpTimes: number[] = [];

  private startMs = 0;
  private nextDue = 0;
  private finished = false;
  private readonly scratch: PlayerFrame = { x: 0, y: 0, scaleX: 1, scaleY: 1, flags: 0 };

  constructor(readonly enemyCount: number) {
    this.enemyData = new Float32Array(MAX_SAMPLES * enemyCount * E_STRIDE);
  }

  get duration() {
    return this.count > 0 ? this.times[this.count - 1] : 0;
  }

  /** A finished, complete recording long enough to replay. */
  get usable() {
    return this.finished && !this.overflowed && this.count >= 2 && this.duration >= MIN_REPLAY_MS;
  }

  /** Start a fresh attempt at game time `now`. */
  clear(now: number) {
    this.count = 0;
    this.overflowed = false;
    this.finished = false;
    this.coinEvents.length = 0;
    this.stompEvents.length = 0;
    this.jumpTimes.length = 0;
    this.startMs = now;
    this.nextDue = 0;
  }

  /** Call every unlocked frame; takes a sample whenever a 1/30 s slot comes due. */
  update(now: number, player: Player, enemies: readonly Enemy[]) {
    if (this.finished) return;
    const t = now - this.startMs;
    if (t < this.nextDue) return;
    this.nextDue = (Math.floor(t / SAMPLE_MS) + 1) * SAMPLE_MS;
    this.push(t, player, enemies);
  }

  /** Records the closing sample at the goal, so playback ends exactly where the run did. */
  finish(now: number, player: Player, enemies: readonly Enemy[]) {
    if (this.finished) return;
    const t = now - this.startMs;
    // Replace the last sample if it is (nearly) the same instant.
    if (this.count > 0 && t - this.times[this.count - 1] < 1) this.count -= 1;
    this.push(t, player, enemies);
    this.finished = true;
  }

  addCoin(now: number, coinIndex: number) {
    if (!this.finished && coinIndex >= 0) this.coinEvents.push(now - this.startMs, coinIndex);
  }

  addStomp(now: number, enemyIndex: number) {
    if (!this.finished && enemyIndex >= 0) this.stompEvents.push(now - this.startMs, enemyIndex);
  }

  addJump(now: number) {
    if (!this.finished && this.jumpTimes.length < MAX_JUMP_EVENTS) this.jumpTimes.push(now - this.startMs);
  }

  private push(t: number, player: Player, enemies: readonly Enemy[]) {
    if (this.count >= MAX_SAMPLES || t > MAX_RECORD_MS) {
      this.overflowed = true;
      return;
    }
    const i = this.count++;
    this.times[i] = t;

    const f = player.snapshot(this.scratch);
    const p = i * P_STRIDE;
    this.playerData[p] = f.x;
    this.playerData[p + 1] = f.y;
    this.playerData[p + 2] = f.scaleX;
    this.playerData[p + 3] = f.scaleY;
    this.playerData[p + 4] = f.flags;

    const base = i * this.enemyCount * E_STRIDE;
    for (let e = 0; e < this.enemyCount; e++) {
      const enemy = enemies[e];
      const o = base + e * E_STRIDE;
      this.enemyData[o] = enemy.x;
      this.enemyData[o + 1] = enemy.y;
      this.enemyData[o + 2] = (enemy.alive ? EF_ALIVE : 0) | (enemy.facingLeft ? EF_FACING_LEFT : 0);
    }
  }
}

export const RECORD_STRIDES = { player: P_STRIDE, enemy: E_STRIDE } as const;
