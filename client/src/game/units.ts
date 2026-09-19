import { WORLD_H, WORLD_W } from "@sketchquest/shared";

/** Coin sprite edge length, in world px. */
export const COIN_SIZE = 20;

/** Normalized 0-1000 level coords -> world pixels. */
export const sx = (v: number) => (v / 1000) * WORLD_W;
export const sy = (v: number) => (v / 1000) * WORLD_H;

/** World pixels -> normalized 0-1000 level coords. */
export const nx = (px: number) => (px / WORLD_W) * 1000;
export const ny = (px: number) => (px / WORLD_H) * 1000;
