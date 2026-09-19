import Phaser from "phaser";
import { burstParticles } from "./particles";

const SHAKE_DURATION_MS = 600;
const SHAKE_INTENSITY = 0.012;
const FLASH_DURATION_MS = 600;
const FLASH_COLOR = { r: 214, g: 69, b: 61 }; // matches the spike/hazard red
const PARTICLE_COLOR = 0x2a6df4; // matches the player color

/** Screen shake, a red flash, and a burst of player-colored particles. */
export function playDeathEffect(scene: Phaser.Scene, x: number, y: number) {
  scene.cameras.main.shake(SHAKE_DURATION_MS, SHAKE_INTENSITY);
  scene.cameras.main.flash(FLASH_DURATION_MS, FLASH_COLOR.r, FLASH_COLOR.g, FLASH_COLOR.b);
  burstParticles(scene, x, y, { color: PARTICLE_COLOR, count: 14, speed: [60, 140], duration: 500 });
}
