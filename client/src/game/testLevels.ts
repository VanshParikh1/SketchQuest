import type { Level } from "@sketchquest/shared";

/** 1: an easy warm-up level. */
export const easyLevel: Level = {
  name: "Easy Does It",
  intro: "A gentle warm-up. Nothing here bites.",
  quips: ["Nice and easy.", "You've got this."],
  start: { x: 40, y: 880 },
  goal: { id: "goal", x: 900, y: 800, w: 50, h: 80 },
  platforms: [
    { id: "ground", x: 0, y: 920, w: 1000, h: 80 },
    { id: "step-1", x: 400, y: 850, w: 120, h: 24 },
    { id: "step-2", x: 650, y: 800, w: 120, h: 24 },
  ],
  hazards: [],
  coins: [
    { id: "coin-1", x: 200, y: 860 },
    { id: "coin-2", x: 460, y: 800 },
    { id: "coin-3", x: 700, y: 750 },
  ],
  enemies: [{ id: "enemy-1", x: 550, y: 902, patrol: 150 }],
};

/** 2: a spike gauntlet requiring precise jumps over back-to-back hazards. */
export const spikeGauntletLevel: Level = {
  name: "Spike Gauntlet",
  intro: "Watch your step. Every one of these is real.",
  quips: ["That spike was not new.", "So close.", "Try jumping earlier."],
  start: { x: 30, y: 880 },
  goal: { id: "goal", x: 950, y: 800, w: 50, h: 80 },
  platforms: [
    { id: "ground-1", x: 0, y: 920, w: 200, h: 80 },
    { id: "ground-2", x: 260, y: 920, w: 160, h: 80 },
    { id: "ground-3", x: 480, y: 920, w: 160, h: 80 },
    { id: "ground-4", x: 700, y: 920, w: 300, h: 80 },
  ],
  hazards: [
    { id: "spike-1", type: "spike", x: 210, y: 890, w: 40, h: 30 },
    { id: "spike-2", type: "spike", x: 430, y: 890, w: 40, h: 30 },
    { id: "spike-3", type: "spike", x: 650, y: 890, w: 40, h: 30 },
    { id: "spike-4", type: "spike", x: 760, y: 890, w: 40, h: 30 },
    { id: "spike-5", type: "spike", x: 860, y: 890, w: 40, h: 30 },
  ],
  coins: [
    { id: "coin-1", x: 240, y: 840 },
    { id: "coin-2", x: 460, y: 840 },
  ],
  enemies: [{ id: "enemy-1", x: 900, y: 902, patrol: 100 }],
};

/**
 * 3: deliberately malformed, untyped like real untrusted Gemini output —
 * overlapping/duplicate platforms, out-of-range and negative coordinates,
 * an invalid hazard type, entities missing required fields, and zero
 * coins. Exercises sanitizeLevel()'s clamping/dropping instead of a crash.
 */
export const messyLevel: unknown = {
  name: "Messy Doodle",
  intro: "Whatever the sketch parser hallucinated this time.",
  quips: "not even an array",
  start: { x: 50, y: 880 },
  goal: { id: "goal", x: 900, y: 800, w: 50, h: 80 },
  platforms: [
    { id: "ground-1", x: 0, y: 920, w: 1000, h: 80 },
    { id: "ground-1-dup", x: 0, y: 920, w: 1000, h: 80 }, // exact duplicate/overlap
    { id: "floating", x: 400, y: 850, w: 5000, h: 24 }, // way out of range
    { x: 300, y: 800, w: 100, h: 20 }, // missing id, must be dropped
    { id: "negative", x: -400, y: -900, w: 100, h: 20 },
  ],
  hazards: [
    { id: "spike-1", type: "acid", x: 200, y: 890, w: 40, h: 30 }, // invalid type
    { id: "spike-2", type: "spike", x: 99999, y: -50, w: 40, h: 30 }, // out of range
  ],
  coins: [], // deliberately zero coins
  enemies: [
    { id: "enemy-1", x: 500, y: 902 }, // missing patrol
    { id: "enemy-2", x: 20000, y: -500, patrol: 100 }, // out of range
    { x: 100, y: 100, patrol: 50 }, // missing id, must be dropped
  ],
};

/** Keyed 1/2/3 for the debug hotkeys in GameScene. */
export const debugTestLevels: Record<1 | 2 | 3, unknown> = {
  1: easyLevel,
  2: spikeGauntletLevel,
  3: messyLevel,
};
