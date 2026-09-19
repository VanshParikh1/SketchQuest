import Phaser from "phaser";
import { WORLD_H, WORLD_W, type DeathCause } from "@sketchquest/shared";
import { burstParticles } from "./particles";
import { floatText } from "./floatingText";

const SHAKE_DURATION_MS = 600;
const SHAKE_INTENSITY = 0.012;
const FLASH_DURATION_MS = 600;
const FLASH_COLOR = { r: 214, g: 69, b: 61 }; // matches the spike/hazard red
const PARTICLE_COLOR = 0x2a6df4; // matches the player color
const SPIKE_COLOR = 0xd6453d;
const LAVA_ORANGE = 0xff8a1f;
const LAVA_YELLOW = 0xf2c200;
/** Falls die below the canvas; effects are pinned this far above its bottom edge. */
const BOTTOM_MARGIN = 20;
/** How far above the death point the floating word starts. */
const TEXT_OFFSET_Y = 60;
const STREAK_DEPTH = 1400;

const CAUSE_TEXT: Record<DeathCause, { message: string; color: string }> = {
  spike: { message: "SPIKED", color: "#d6453d" },
  lava: { message: "TOASTED", color: "#e8590c" },
  enemy: { message: "SQUISHED", color: "#8a3ffc" },
  fall: { message: "GRAVITY WINS", color: "#2a6df4" },
};

/**
 * Screen shake, a red flash and a burst of player-colored particles for
 * every death, plus a per-cause extra and a floating word.
 */
export function playDeathEffect(scene: Phaser.Scene, x: number, y: number, cause: DeathCause) {
  const ex = Phaser.Math.Clamp(x, 0, WORLD_W);
  const ey = Math.min(y, WORLD_H - BOTTOM_MARGIN);

  scene.cameras.main.shake(SHAKE_DURATION_MS, SHAKE_INTENSITY);
  scene.cameras.main.flash(FLASH_DURATION_MS, FLASH_COLOR.r, FLASH_COLOR.g, FLASH_COLOR.b);
  burstParticles(scene, ex, ey, { color: PARTICLE_COLOR, count: 14, speed: [60, 140], duration: 500 });

  switch (cause) {
    case "spike":
      burstParticles(scene, ex, ey, { color: SPIKE_COLOR, count: 12, speed: [90, 200], duration: 450 });
      break;
    case "lava": {
      const upward: [number, number] = [-Math.PI * 0.85, -Math.PI * 0.15];
      burstParticles(scene, ex, ey, { color: LAVA_ORANGE, count: 18, speed: [160, 340], size: 9, duration: 750, arc: upward });
      burstParticles(scene, ex, ey, { color: LAVA_YELLOW, count: 12, speed: [120, 280], size: 7, duration: 650, arc: upward });
      break;
    }
    case "fall":
      playFallStreak(scene, ex);
      break;
    case "enemy":
      break;
  }

  const { message, color } = CAUSE_TEXT[cause];
  floatText(scene, message, ex, ey - TEXT_OFFSET_Y, color);
}

/** A few thin vertical streaks racing down the bottom of the screen at x. */
function playFallStreak(scene: Phaser.Scene, x: number) {
  for (let i = 0; i < 3; i++) {
    const streak = scene.add
      .rectangle(x + (i - 1) * 12, WORLD_H - 400, 4, 280 - i * 50, PARTICLE_COLOR, 0.7)
      .setOrigin(0.5, 0)
      .setDepth(STREAK_DEPTH);
    scene.tweens.add({
      targets: streak,
      y: WORLD_H + 40,
      alpha: 0,
      duration: 450 + i * 60,
      ease: "Cubic.easeIn",
      onComplete: () => streak.destroy(),
    });
  }
}
