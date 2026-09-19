import type { DeathCause } from "@sketchquest/shared";

/** What the narrator is reacting to. */
export type Trigger =
  | { kind: "death"; cause: DeathCause }
  | { kind: "intro" }
  | { kind: "firstCoin" }
  | { kind: "allCoins" }
  | { kind: "win" }
  | { kind: "milestone"; count: number };

/** Facts a line can mention through {placeholders}. */
export type NarratorContext = {
  levelName: string;
  /** Attempt number (for a death: the attempt that just ended). */
  attempt: number;
  /** Deaths within ~100px of this one, including it. */
  deathsAtSpot: number;
  coins: number;
  timeAlive: number;
  /** Deaths on this level so far (used to grade a win). Defaults to attempt - 1. */
  levelDeaths?: number;
  /** Deaths this session, across levels. */
  totalDeaths?: number;
};

export type LineContext = NarratorContext & { trigger: Trigger };
