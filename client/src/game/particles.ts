import Phaser from "phaser";

export type BurstOptions = {
  color?: number;
  count?: number;
  speed?: [number, number];
  size?: number;
  duration?: number;
};

const DEFAULTS: Required<BurstOptions> = {
  color: 0xffffff,
  count: 12,
  speed: [60, 140],
  size: 6,
  duration: 500,
};

/** A quick burst of small colored squares flying out from (x, y) and fading. */
export function burstParticles(scene: Phaser.Scene, x: number, y: number, opts: BurstOptions = {}) {
  const { color, count, speed, size, duration } = { ...DEFAULTS, ...opts };
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
    const s = speed[0] + Math.random() * (speed[1] - speed[0]);
    const particle = scene.add.rectangle(x, y, size, size, color);
    scene.tweens.add({
      targets: particle,
      x: x + Math.cos(angle) * s,
      y: y + Math.sin(angle) * s,
      alpha: 0,
      duration,
      ease: "Cubic.easeOut",
      onComplete: () => particle.destroy(),
    });
  }
}
