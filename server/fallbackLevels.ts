import type { Level } from "@sketchquest/shared";

/**
 * Hand-made levels used whenever the Gemini pipeline can't produce a
 * beatable one (no key, error, timeout, unreachable after repairs). Each is
 * checked with validateLevel in scripts/test-validate.ts.
 */

const sundayStroll: Level = {
  name: "Sunday Stroll",
  intro: "A gentle hop up some wobbly steps. What could possibly go wrong?",
  quips: [
    "That was the easy level.",
    "The stairs were right there.",
    "Even the enemy is embarrassed for you.",
    "Bold strategy. It did not work.",
    "The floor is not the goal.",
    "Have you considered jumping?",
  ],
  start: { x: 60, y: 893 },
  goal: { id: "goal", x: 880, y: 550, w: 40, h: 70 },
  platforms: [
    { id: "p1", x: 0, y: 920, w: 1000, h: 80 },
    { id: "p2", x: 300, y: 820, w: 160, h: 24 },
    { id: "p3", x: 520, y: 720, w: 160, h: 24 },
    { id: "p4", x: 740, y: 620, w: 200, h: 24 },
  ],
  hazards: [],
  coins: [
    { id: "c1", x: 160, y: 880 },
    { id: "c2", x: 380, y: 780 },
    { id: "c3", x: 600, y: 680 },
    { id: "c4", x: 840, y: 580 },
  ],
  enemies: [{ id: "e1", x: 650, y: 902, patrol: 150 }],
};

const spikeAlley: Level = {
  name: "Spike Alley",
  intro: "Mind the gap, mind the spikes, mind your manners.",
  quips: [
    "Spikes: 1. You: 0.",
    "The lava was not a hot tub.",
    "That jump had ambition. Not accuracy.",
    "The spikes were not subtle.",
    "Try landing on the parts that don't hurt.",
    "Somewhere a pit is laughing.",
  ],
  start: { x: 60, y: 893 },
  goal: { id: "goal", x: 890, y: 650, w: 40, h: 70 },
  platforms: [
    { id: "p1", x: 0, y: 920, w: 380, h: 80 },
    { id: "p2", x: 470, y: 920, w: 530, h: 80 },
    { id: "p3", x: 640, y: 820, w: 120, h: 24 },
    { id: "p4", x: 800, y: 720, w: 160, h: 24 },
  ],
  hazards: [
    { id: "h1", type: "lava", x: 380, y: 960, w: 90, h: 40 },
    { id: "h2", type: "spike", x: 560, y: 890, w: 40, h: 30 },
    { id: "h3", type: "spike", x: 800, y: 890, w: 40, h: 30 },
  ],
  coins: [
    { id: "c1", x: 200, y: 860 },
    { id: "c2", x: 700, y: 780 },
    { id: "c3", x: 880, y: 680 },
  ],
  enemies: [],
};

const skyStairs: Level = {
  name: "Sky Stairs",
  intro: "The floor is lava. The stairs are optional. Falling is not.",
  quips: [
    "Gravity wins again.",
    "The lava says hello.",
    "Stairs are hard. Apparently.",
    "That was a leap of faith. It was answered.",
    "The platform was right there.",
    "Up is the direction you want.",
  ],
  start: { x: 60, y: 893 },
  goal: { id: "goal", x: 840, y: 450, w: 40, h: 70 },
  platforms: [
    { id: "p1", x: 0, y: 920, w: 200, h: 80 },
    { id: "p2", x: 290, y: 850, w: 120, h: 24 },
    { id: "p3", x: 500, y: 780, w: 120, h: 24 },
    { id: "p4", x: 300, y: 680, w: 120, h: 24 },
    { id: "p5", x: 520, y: 590, w: 120, h: 24 },
    { id: "p6", x: 720, y: 520, w: 200, h: 24 },
  ],
  hazards: [{ id: "h1", type: "lava", x: 200, y: 960, w: 800, h: 40 }],
  coins: [
    { id: "c1", x: 350, y: 810 },
    { id: "c2", x: 560, y: 740 },
    { id: "c3", x: 360, y: 640 },
    { id: "c4", x: 580, y: 550 },
  ],
  enemies: [{ id: "e1", x: 360, y: 662, patrol: 60 }],
};

export const fallbackLevels: readonly Level[] = [sundayStroll, spikeAlley, skyStairs];

/** Deterministic pick from the image hash so a given photo always falls back to the same level. */
export function pickFallback(imageHash: string): Level {
  const index = parseInt(imageHash.slice(0, 8), 16) % fallbackLevels.length;
  return structuredClone(fallbackLevels[Number.isNaN(index) ? 0 : index]!);
}
