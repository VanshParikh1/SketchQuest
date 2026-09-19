import { z } from "zod";
import { DeathCauseSchema, type Level } from "./level";

export type HealthResponse = { ok: true };

/** POST /api/level request. `image` is a base64 JPEG (a `data:image/jpeg;base64,` prefix is tolerated). */
export const LevelRequestSchema = z.object({ image: z.string().min(1) });
export type LevelRequest = z.infer<typeof LevelRequestSchema>;

export type LevelMeta = {
  /** Repair rounds sent to the model (0 = first pass was already beatable). */
  repairs: number;
  /** True when the level is a cached/hand-made fallback, not the model's output. */
  fallback: boolean;
};
export type LevelResponse = { level: Level; meta: LevelMeta };

/** POST /api/roast request. Sent on every death. */
export const RoastRequestSchema = z.object({
  levelName: z.string(),
  cause: DeathCauseSchema,
  attempt: z.number(),
  deathsAtSpot: z.number(),
  coins: z.number(),
  timeAlive: z.number(),
  /** Last few roasts already shown, so the server can avoid repeating them. */
  recentRoasts: z.array(z.string()).optional(),
});
export type RoastRequest = z.infer<typeof RoastRequestSchema>;

export type RoastResponse = { line: string };
