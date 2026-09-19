import Phaser from "phaser";

export function ensureParticleTextures(scene: Phaser.Scene): void {
  // Sparkle star for coins
  if (!scene.textures.exists("particle_star")) {
    const starCanvas = scene.textures.createCanvas("particle_star", 16, 16);
    if (starCanvas) {
      const ctx = starCanvas.getContext();
      ctx.fillStyle = "#fef08a";
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(10, 6);
      ctx.lineTo(16, 8);
      ctx.lineTo(10, 10);
      ctx.lineTo(8, 16);
      ctx.lineTo(6, 10);
      ctx.lineTo(0, 8);
      ctx.lineTo(6, 6);
      ctx.closePath();
      ctx.fill();
      starCanvas.refresh();
    }
  }

  // Soft dust particle for jumping / landing
  if (!scene.textures.exists("particle_dust")) {
    const dustCanvas = scene.textures.createCanvas("particle_dust", 12, 12);
    if (dustCanvas) {
      const ctx = dustCanvas.getContext();
      ctx.fillStyle = "rgba(148, 163, 184, 0.7)";
      ctx.beginPath();
      ctx.arc(6, 6, 5, 0, Math.PI * 2);
      ctx.fill();
      dustCanvas.refresh();
    }
  }

  // Shatter particle for player death
  if (!scene.textures.exists("particle_shatter")) {
    const shatterCanvas = scene.textures.createCanvas("particle_shatter", 12, 12);
    if (shatterCanvas) {
      const ctx = shatterCanvas.getContext();
      ctx.fillStyle = "#2a6df4";
      ctx.beginPath();
      ctx.moveTo(2, 2);
      ctx.lineTo(10, 3);
      ctx.lineTo(8, 10);
      ctx.closePath();
      ctx.fill();
      shatterCanvas.refresh();
    }
  }
}
