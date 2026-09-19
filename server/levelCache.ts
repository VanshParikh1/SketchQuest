import fs from "node:fs";
import path from "node:path";
import { LevelSchema, type LevelResponse } from "@sketchquest/shared";
import { cacheDir } from "./config";

/**
 * On-disk level cache (server/.cache/levels/<sha256>.json), so repeat scans of
 * the same photo cost zero Gemini calls even after a restart. Only non-fallback
 * results are ever written (the caller enforces that).
 */

const levelsDir = () => path.join(cacheDir(), "levels");
const fileFor = (hash: string) => path.join(levelsDir(), `${hash}.json`);

/** The cached response, or null on a miss or an unreadable/invalid file. */
export async function readDiskLevel(hash: string): Promise<LevelResponse | null> {
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  let raw: string;
  try {
    raw = await fs.promises.readFile(fileFor(hash), "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LevelResponse>;
    const level = LevelSchema.safeParse(parsed.level);
    if (!level.success || parsed.meta?.fallback === true) throw new Error("invalid cache entry");
    return {
      level: level.data,
      meta: { repairs: Number(parsed.meta?.repairs) || 0, fallback: false },
    };
  } catch {
    console.warn(`[cache] ignoring corrupt entry ${hash.slice(0, 8)}`);
    return null;
  }
}

/** Best-effort atomic write; a failure only costs a future cache miss. */
export async function writeDiskLevel(hash: string, response: LevelResponse): Promise<void> {
  if (response.meta.fallback || !/^[0-9a-f]{64}$/.test(hash)) return;
  try {
    await fs.promises.mkdir(levelsDir(), { recursive: true });
    const tmp = `${fileFor(hash)}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(response));
    await fs.promises.rename(tmp, fileFor(hash));
  } catch (error) {
    console.warn("[cache] could not write level cache:", error instanceof Error ? error.message : error);
  }
}
