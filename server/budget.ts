import fs from "node:fs";
import path from "node:path";
import { cacheDir, dailyCap } from "./config";

/**
 * Daily budget for REAL Gemini requests, persisted so it survives restarts and
 * resets at local midnight. Every request counts, including repair rounds and
 * the temperature retry. (Requests the SDK retries internally after a 429 are
 * not visible to us and are not counted.)
 */

type Usage = { date: string; count: number };

export class BudgetExceededError extends Error {
  constructor(count: number, cap: number) {
    super(`Daily Gemini cap reached (${count}/${cap}); using fallbacks until local midnight`);
    this.name = "BudgetExceededError";
  }
}

const usageFile = () => path.join(cacheDir(), "usage.json");

/** Local calendar date, e.g. 2026-09-19. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function read(): Usage {
  const fresh: Usage = { date: today(), count: 0 };
  try {
    const parsed = JSON.parse(fs.readFileSync(usageFile(), "utf8")) as Partial<Usage>;
    if (parsed.date === fresh.date && Number.isInteger(parsed.count) && parsed.count! >= 0) {
      return { date: fresh.date, count: parsed.count! };
    }
  } catch {
    // Missing or corrupt: start the day at 0.
  }
  return fresh;
}

function write(usage: Usage): void {
  try {
    fs.mkdirSync(cacheDir(), { recursive: true });
    const tmp = `${usageFile()}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(usage));
    fs.renameSync(tmp, usageFile());
  } catch (error) {
    console.warn("[budget] could not persist usage.json:", error instanceof Error ? error.message : error);
  }
}

export type UsageSnapshot = {
  date: string;
  count: number;
  /** 0 means unlimited. */
  cap: number;
  /** null when unlimited. */
  remaining: number | null;
};

export function usageSnapshot(): UsageSnapshot {
  const { date, count } = read();
  const cap = dailyCap();
  return { date, count, cap, remaining: cap === 0 ? null : Math.max(0, cap - count) };
}

let capLoggedOn: string | null = null;

/**
 * Call right before each real Gemini request. Counts it and logs the running
 * total, or throws BudgetExceededError (logging once per day) when the cap is hit.
 */
export function reserveCall(label: string): number {
  const cap = dailyCap();
  const usage = read();

  if (cap > 0 && usage.count >= cap) {
    if (capLoggedOn !== usage.date) {
      capLoggedOn = usage.date;
      console.warn(
        `[budget] daily cap reached (${usage.count}/${cap}): live calls are skipped and fallbacks are used until local midnight. ` +
          `Raise GEMINI_DAILY_CAP, or set it to 0 for unlimited.`
      );
    }
    throw new BudgetExceededError(usage.count, cap);
  }

  usage.count++;
  write(usage);
  console.log(`[gemini] real call ${usage.count}/${cap > 0 ? cap : "unlimited"} (${label})`);
  return usage.count;
}

/** Whether another real call is currently allowed (does not count it). */
export function hasBudget(): boolean {
  const cap = dailyCap();
  return cap === 0 || read().count < cap;
}
