import Phaser from "phaser";
import { WORLD_H, WORLD_W } from "@sketchquest/shared";
import { makeRng } from "./sketch";
import { DEPTH } from "./palette";

const PAPER_KEY = "sq-paper";
const LINE_GAP = 48;
const FIRST_LINE_Y = 132;
const MARGIN_X = 158;
const GRAIN_TILE = 256;

/**
 * Draws the notebook page onto a canvas texture once per game: warm paper,
 * soft blotches, tiled grain, faint blue rules, a red margin line and a
 * vignette. Later calls reuse the texture.
 */
function ensurePaperTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(PAPER_KEY)) return;
  const tex = scene.textures.createCanvas(PAPER_KEY, WORLD_W, WORLD_H);
  if (!tex) return;
  const ctx = tex.getContext();
  const rng = makeRng(0x5ce7c4);

  ctx.fillStyle = "#f7f2e3";
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  // Big, very soft warm/grey blotches so the page isn't a flat colour.
  for (let i = 0; i < 26; i++) {
    const x = rng() * WORLD_W;
    const y = rng() * WORLD_H;
    const r = 120 + rng() * 260;
    const warm = rng() > 0.5;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, warm ? "rgba(214,190,130,0.07)" : "rgba(150,150,140,0.05)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Grain: one small noise tile, repeated (cheap, and invisible at this contrast).
  const tile = document.createElement("canvas");
  tile.width = tile.height = GRAIN_TILE;
  const tctx = tile.getContext("2d");
  if (tctx) {
    const img = tctx.createImageData(GRAIN_TILE, GRAIN_TILE);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = rng();
      const dark = n < 0.5;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = dark ? 90 : 255;
      img.data[i + 3] = Math.floor(rng() * (dark ? 16 : 22));
    }
    tctx.putImageData(img, 0, 0);
    const pattern = ctx.createPattern(tile, "repeat");
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }
  }

  // Faint blue rules, each drawn with a hint of wobble.
  ctx.lineCap = "round";
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = "rgba(78,133,214,0.34)";
  for (let y = FIRST_LINE_Y; y < WORLD_H; y += LINE_GAP) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 40; x <= WORLD_W + 40; x += 40) ctx.lineTo(x, y + (rng() - 0.5) * 1.2);
    ctx.stroke();
  }

  // Red margin line.
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(214,69,61,0.32)";
  ctx.beginPath();
  ctx.moveTo(MARGIN_X, 0);
  for (let y = 40; y <= WORLD_H + 40; y += 40) ctx.lineTo(MARGIN_X + (rng() - 0.5) * 1.2, y);
  ctx.stroke();

  // Slight vignette: transparent in the middle, warm-grey at the edges.
  const cx = WORLD_W / 2;
  const cy = WORLD_H / 2;
  const vignette = ctx.createRadialGradient(cx, cy, WORLD_H * 0.42, cx, cy, WORLD_W * 0.62);
  vignette.addColorStop(0, "rgba(120,100,60,0)");
  vignette.addColorStop(1, "rgba(120,100,60,0.24)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  tex.refresh();
}

/** Adds the notebook-paper backdrop behind everything in the scene. */
export function addPaper(scene: Phaser.Scene) {
  ensurePaperTexture(scene);
  if (!scene.textures.exists(PAPER_KEY)) return;
  scene.add.image(0, 0, PAPER_KEY).setOrigin(0, 0).setDepth(DEPTH.paper);
}
