import "../env";
import { dailyCap, isReplay } from "../config";
import { hasBudget, usageSnapshot } from "../budget";

/**
 * Guard for scripts that make real Gemini calls. They refuse to run unless
 * `--live` is passed (npm needs the extra `--`: `npm run test:roast -w server -- --live`),
 * and once running they stop as soon as GEMINI_DAILY_CAP is reached.
 */

const usageLine = (): string => {
  const { count, cap, remaining } = usageSnapshot();
  return `Today's usage: ${count}/${cap || "unlimited"}${remaining === null ? "" : ` (${remaining} left)`}`;
};

/** Exits with a message unless --live was passed. Otherwise prints the estimate and returns. */
export function requireLive(estimatedCalls: number, detail: string): void {
  const live = process.argv.includes("--live");
  if (!live) {
    console.error(`\nThis spends real Gemini quota (${estimatedCalls} calls est.). Re-run with --live to proceed.`);
    console.error(`  Estimate: ${detail}`);
    console.error(`  ${usageLine()}`);
    if (isReplay()) console.error("  (GEMINI_REPLAY is on, so a --live run would read fixtures and make no real calls.)");
    process.exit(1);
  }

  console.log(`\nLive run: ${estimatedCalls} calls est. (${detail}). ${usageLine()}`);
  const { remaining } = usageSnapshot();
  if (!isReplay() && remaining !== null && remaining < estimatedCalls) {
    console.warn(
      `Only ${remaining} calls are left under GEMINI_DAILY_CAP=${dailyCap()}; the run will stop when the cap is reached.`
    );
  }
}

/** True once the daily cap is spent (never in replay mode, which makes no real calls). */
export function capReached(): boolean {
  return !isReplay() && !hasBudget();
}

/** Prints the abort notice for a run stopped by the cap. */
export function announceCapAbort(done: number, total: number, unit: string): void {
  const { count, cap } = usageSnapshot();
  console.error(
    `\nABORTED: GEMINI_DAILY_CAP reached (${count}/${cap}) after ${done}/${total} ${unit}. ` +
      `Raise GEMINI_DAILY_CAP (0 = unlimited) or wait for local midnight.`
  );
}
