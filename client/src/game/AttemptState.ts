import type Phaser from "phaser";

/** Deaths within this many world px of each other count as "the same spot". */
const DEATH_SPOT_RADIUS = 100;

/**
 * Tracks per-level attempt count and per-attempt coins/time, plus the
 * running history of death positions used to compute deathsAtSpot.
 */
export class AttemptState {
  attempt = 1;
  coins = 0;
  /** deathsAtSpot from the most recent death, for the debug overlay. */
  lastDeathsAtSpot = 0;

  private deathPositions: { x: number; y: number }[] = [];
  private attemptStartMs = 0;

  /** Call from Scene.create() when a (new) level loads. */
  reset(scene: Phaser.Scene) {
    this.attempt = 1;
    this.coins = 0;
    this.lastDeathsAtSpot = 0;
    this.deathPositions = [];
    this.attemptStartMs = scene.time.now;
  }

  /** A death-triggered respawn: counts toward attempt, resets coins/time. */
  nextAttempt(scene: Phaser.Scene) {
    this.attempt += 1;
    this.coins = 0;
    this.attemptStartMs = scene.time.now;
  }

  /** A manual (R key) restart: resets coins/time, not a new attempt. */
  restartAttempt(scene: Phaser.Scene) {
    this.coins = 0;
    this.attemptStartMs = scene.time.now;
  }

  /** Seconds since the current attempt started, to one decimal. */
  timeAlive(scene: Phaser.Scene): number {
    const seconds = (scene.time.now - this.attemptStartMs) / 1000;
    return Math.round(seconds * 10) / 10;
  }

  collectCoin() {
    this.coins += 1;
  }

  /** Records a death at (x, y) and returns deathsAtSpot (including this one). */
  recordDeath(x: number, y: number): number {
    const deathsAtSpot =
      this.deathPositions.filter((p) => Math.hypot(p.x - x, p.y - y) <= DEATH_SPOT_RADIUS).length +
      1;
    this.deathPositions.push({ x, y });
    this.lastDeathsAtSpot = deathsAtSpot;
    return deathsAtSpot;
  }
}
