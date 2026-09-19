import { z } from "zod";

/** Level coordinates are normalized 0-1000, origin top-left. */
const coord = z.number().min(0).max(1000);

const point = { x: coord, y: coord };
const rect = { id: z.string(), x: coord, y: coord, w: coord, h: coord };

export const LevelSchema = z.object({
  name: z.string(),
  intro: z.string(),
  quips: z.array(z.string()),
  start: z.object(point),
  goal: z.object(rect),
  platforms: z.array(z.object(rect)),
  hazards: z.array(z.object({ ...rect, type: z.enum(["spike", "lava"]) })),
  coins: z.array(z.object({ id: z.string(), ...point })),
  enemies: z.array(z.object({ id: z.string(), ...point, patrol: coord })),
});

export type Level = z.infer<typeof LevelSchema>;
export type Platform = Level["platforms"][number];
export type Hazard = Level["hazards"][number];
export type Coin = Level["coins"][number];
export type Enemy = Level["enemies"][number];

export const DeathCauseSchema = z.enum(["spike", "lava", "enemy", "fall"]);
export type DeathCause = z.infer<typeof DeathCauseSchema>;

export type DeathEvent = {
  cause: DeathCause;
  x: number;
  y: number;
  attempt: number;
  deathsAtSpot: number;
  coins: number;
  timeAlive: number;
};

export type WinEvent = {
  coins: number;
  timeAlive: number;
};

export const sampleLevel: Level = {
  name: "Doodle Dash",
  intro: "A wobbly little world drawn in a hurry. Try not to fall in the scribbles.",
  quips: ["Nice jump. Wrong direction.", "The spike was there the whole time.", "Bold strategy."],
  start: { x: 60, y: 880 },
  goal: { id: "goal", x: 930, y: 580, w: 40, h: 70 },
  platforms: [
    { id: "ground-1", x: 0, y: 920, w: 340, h: 80 },
    { id: "ground-2", x: 420, y: 920, w: 580, h: 80 },
    { id: "plat-1", x: 500, y: 830, w: 120, h: 24 },
    { id: "plat-2", x: 660, y: 740, w: 120, h: 24 },
    { id: "plat-3", x: 820, y: 650, w: 160, h: 24 },
  ],
  hazards: [
    { id: "spike-1", type: "spike", x: 230, y: 890, w: 40, h: 30 },
    { id: "lava-1", type: "lava", x: 340, y: 960, w: 80, h: 40 },
  ],
  coins: [
    { id: "coin-1", x: 150, y: 870 },
    { id: "coin-2", x: 250, y: 820 },
    { id: "coin-3", x: 560, y: 790 },
    { id: "coin-4", x: 720, y: 700 },
  ],
  enemies: [{ id: "enemy-1", x: 850, y: 902, patrol: 100 }],
};
