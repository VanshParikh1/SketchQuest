import { sampleLevel, type Coin, type Enemy, type Hazard, type Level, type Platform } from "./level";

/**
 * Coerces untrusted, possibly-malformed level data (e.g. bad Gemini output)
 * into something that satisfies LevelSchema: numeric fields are clamped
 * into the 0-1000 range instead of rejected, and individual entities that
 * are missing required fields are dropped (and duplicate ids renamed)
 * instead of throwing. Call this
 * before LevelSchema.parse so a broken level degrades instead of crashing.
 */
export function sanitizeLevel(input: unknown): Level {
  const raw = isRecord(input) ? input : {};

  const level: Level = {
    name: str(raw.name, "Untitled level"),
    intro: str(raw.intro, ""),
    quips: Array.isArray(raw.quips) ? raw.quips.filter((q): q is string => typeof q === "string") : [],
    start: sanitizePoint(raw.start, sampleLevel.start),
    goal: sanitizeRect<Level["goal"]>(raw.goal) ?? sampleLevel.goal,
    platforms: sanitizeList(raw.platforms, sanitizeRect<Platform>),
    hazards: sanitizeList(raw.hazards, sanitizeHazard),
    coins: sanitizeList(raw.coins, sanitizeCoin),
    enemies: sanitizeList(raw.enemies, sanitizeEnemy),
  };

  return dedupeIds(level);
}

/**
 * Makes every id unique across the level by suffixing repeats ("p1" ->
 * "p1-2") rather than dropping the entity, so a model that reuses an id
 * doesn't silently lose platforms.
 */
function dedupeIds(level: Level): Level {
  const used = new Set<string>([level.goal.id]);
  const unique = <T extends { id: string }>(items: T[]): T[] =>
    items.map((item) => {
      let id = item.id;
      for (let n = 2; used.has(id); n++) id = `${item.id}-${n}`;
      used.add(id);
      return id === item.id ? item : { ...item, id };
    });

  return {
    ...level,
    platforms: unique(level.platforms),
    hazards: unique(level.hazards),
    coins: unique(level.coins),
    enemies: unique(level.enemies),
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

/** Clamps to a finite number in [0, 1000], defaulting to 0 for anything else. */
function clampCoord(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1000, Math.max(0, n));
}

function sanitizeList<T>(list: unknown, sanitize: (raw: unknown) => T | null): T[] {
  if (!Array.isArray(list)) return [];
  return list.map(sanitize).filter((v): v is T => v !== null);
}

function sanitizePoint(raw: unknown, fallback: { x: number; y: number }): { x: number; y: number } {
  if (!isRecord(raw)) return fallback;
  return {
    x: typeof raw.x === "number" ? clampCoord(raw.x) : fallback.x,
    y: typeof raw.y === "number" ? clampCoord(raw.y) : fallback.y,
  };
}

/** id + x/y/w/h rectangle shape shared by platforms, hazards and the goal. */
function sanitizeRect<T extends { id: string; x: number; y: number; w: number; h: number }>(
  raw: unknown
): T | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  return {
    ...raw,
    id: raw.id,
    x: clampCoord(raw.x),
    y: clampCoord(raw.y),
    w: clampCoord(raw.w) || 1,
    h: clampCoord(raw.h) || 1,
  } as T;
}

function sanitizeHazard(raw: unknown): Hazard | null {
  const rect = sanitizeRect<Hazard>(raw);
  if (!rect) return null;
  const type = isRecord(raw) ? raw.type : undefined;
  return { ...rect, type: type === "lava" ? "lava" : "spike" };
}

function sanitizeCoin(raw: unknown): Coin | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  return { id: raw.id, x: clampCoord(raw.x), y: clampCoord(raw.y) };
}

function sanitizeEnemy(raw: unknown): Enemy | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  return { id: raw.id, x: clampCoord(raw.x), y: clampCoord(raw.y), patrol: clampCoord(raw.patrol) };
}
