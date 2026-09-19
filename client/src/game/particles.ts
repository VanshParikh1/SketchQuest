import Phaser from "phaser";
import { DEPTH, INK } from "./palette";

export type BurstOptions = {
  color?: number;
  count?: number;
  speed?: [number, number];
  size?: number;
  duration?: number;
  /** Radians (0 = right, -PI/2 = up); when set, particles spread across this arc instead of a full circle. */
  arc?: [number, number];
};

const DEFAULTS: Required<Omit<BurstOptions, "arc">> = {
  color: 0xffffff,
  count: 12,
  speed: [60, 140],
  size: 6,
  duration: 500,
};

/** Hard cap on live particles per scene, so stacked effects can't bog down a phone. */
const MAX_LIVE_PARTICLES = 60;
const live = new WeakMap<Phaser.Scene, number>();

/** Call when a scene (re)starts: its tweens were killed without completing, so the count is stale. */
export function resetParticleBudget(scene: Phaser.Scene) {
  live.set(scene, 0);
}

/** A quick burst of small colored squares flying out from (x, y) and fading. */
export function burstParticles(scene: Phaser.Scene, x: number, y: number, opts: BurstOptions = {}) {
  const { color, count, speed, size, duration } = { ...DEFAULTS, ...opts };
  const { arc } = opts;
  const room = MAX_LIVE_PARTICLES - (live.get(scene) ?? 0);
  const n = Math.max(0, Math.min(count, room));
  live.set(scene, (live.get(scene) ?? 0) + n);
  for (let i = 0; i < n; i++) {
    const angle = arc
      ? arc[0] + Math.random() * (arc[1] - arc[0])
      : (Math.PI * 2 * i) / n + Math.random() * 0.3;
    const s = speed[0] + Math.random() * (speed[1] - speed[0]);
    const particle = scene.add
      .rectangle(x, y, size, size, color)
      .setDepth(DEPTH.particles)
      .setAngle(Math.random() * 90);
    scene.tweens.add({
      targets: particle,
      x: x + Math.cos(angle) * s,
      y: y + Math.sin(angle) * s,
      alpha: 0,
      duration,
      ease: "Cubic.easeOut",
      onComplete: () => {
        particle.destroy();
        live.set(scene, Math.max(0, (live.get(scene) ?? 1) - 1));
      },
    });
  }
}

/** Yellow burst when a coin is picked up (live or replayed). */
export function coinBurst(scene: Phaser.Scene, x: number, y: number) {
  burstParticles(scene, x, y, { color: INK.yellow, count: 10, speed: [40, 100], size: 5, duration: 350 });
}

/** Ink-black burst when an enemy is stomped (live or replayed). */
export function enemyDeathBurst(scene: Phaser.Scene, x: number, y: number) {
  burstParticles(scene, x, y, { color: INK.black, count: 8, speed: [40, 110], size: 4, duration: 350 });
}
