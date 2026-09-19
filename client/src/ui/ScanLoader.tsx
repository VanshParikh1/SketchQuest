import { useEffect, useState } from "react";
import "./ScanLoader.css";

// The server sends no progress, so stages advance on a timer and the last one holds.
const STAGES = [
  "Reading your markers...",
  "Finding the platforms...",
  "Spotting spikes and enemies...",
  "Placing the goal...",
  "Checking it's beatable...",
];
const STAGE_MS = 5000;

const TIPS = [
  "Thick markers on white paper scan best",
  "Red means danger. Green means goal.",
  "Draw a blue circle where you start",
  "Yellow dots turn into coins",
  "Leave a little space between objects",
  "A flat, overhead photo works best",
];
const TIP_MS = 6000;

const SLOW_AFTER_S = 20;
const SLOWER_AFTER_S = 60;

type ScanLoaderProps = {
  /** The uploaded photo (blob, object or data URL). */
  imageUrl: string;
  /** When set, the scan failed and the error card replaces the progress UI. */
  error?: string | null;
  onRetry: () => void;
  /** Only pass when there is a sample level to play; hides the button otherwise. */
  onPlaySample?: () => void;
  /** Back to the capture screen to pick a different photo. */
  onChoosePhoto?: () => void;
};

function Doodle() {
  return (
    <svg className="scan-doodle" viewBox="0 0 320 90" aria-hidden="true" focusable="false">
      <path className="scan-doodle-ground" d="M6 74 C60 71 110 77 165 73 S270 76 314 72" />
      <path
        className="scan-doodle-squiggle"
        pathLength={1}
        d="M10 30 C24 8 32 8 40 30 S58 52 68 30 S86 8 96 30 S114 52 124 30 S142 8 152 30 S170 52 180 30 S198 8 208 30 S226 52 236 30"
      />
      <circle className="scan-doodle-coin" cx="262" cy="42" r="8" />
      <path className="scan-doodle-flag-pole" d="M296 72 L296 34" />
      <path className="scan-doodle-flag" d="M296 34 L314 40 L296 47 Z" />
      <g className="scan-doodle-runner">
        <circle className="scan-runner-head" cx="0" cy="45" r="6" />
        <path className="scan-runner-body" d="M0 51 L0 63" />
        <path className="scan-runner-arm" d="M-7 55 L0 57 L7 53" />
        <path className="scan-runner-leg scan-runner-leg-a" d="M0 63 L-7 73" />
        <path className="scan-runner-leg scan-runner-leg-b" d="M0 63 L7 73" />
      </g>
    </svg>
  );
}

export function ScanLoader({ imageUrl, error, onRetry, onPlaySample, onChoosePhoto }: ScanLoaderProps) {
  const failed = Boolean(error);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (failed) return;
    const startedAt = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [failed]);

  const stage = Math.min(STAGES.length - 1, Math.floor((elapsed * 1000) / STAGE_MS));
  const tip = Math.floor((elapsed * 1000) / TIP_MS) % TIPS.length;
  const patience =
    elapsed >= SLOWER_AFTER_S
      ? "Hang tight, almost there..."
      : elapsed >= SLOW_AFTER_S
        ? "Big drawings take a little longer, still working..."
        : null;

  return (
    <main className="scan-loader" aria-busy={!failed}>
      <div className={`scan-photo${failed ? " scan-photo-failed" : ""}`}>
        <img src={imageUrl} alt="Your sketch" />
        {!failed && (
          <>
            <span className="scan-grid" aria-hidden="true" />
            <span className="scan-line" aria-hidden="true" />
          </>
        )}
        <span className="scan-corner scan-corner-tl" aria-hidden="true" />
        <span className="scan-corner scan-corner-tr" aria-hidden="true" />
        <span className="scan-corner scan-corner-bl" aria-hidden="true" />
        <span className="scan-corner scan-corner-br" aria-hidden="true" />
      </div>

      {failed ? (
        <section className="scan-error" role="alert">
          <h1>That scan didn't work</h1>
          <p>{error}</p>
          <div className="scan-error-actions">
            <button className="button button-primary" type="button" onClick={onRetry}>
              Try again
            </button>
            {onPlaySample && (
              <button className="button button-secondary" type="button" onClick={onPlaySample}>
                Play a sample level
              </button>
            )}
          </div>
          {onChoosePhoto && (
            <button className="scan-link" type="button" onClick={onChoosePhoto}>
              Choose another photo
            </button>
          )}
        </section>
      ) : (
        <>
          <Doodle />
          <span className="scan-visually-hidden" role="status">
            {STAGES[stage]}
          </span>

          <section className="scan-progress">
            <ol className="scan-stages" aria-label="Scan progress">
              {STAGES.map((label, index) => {
                const state = index < stage ? "done" : index === stage ? "active" : "todo";
                return (
                  <li
                    key={label}
                    className={`scan-stage scan-stage-${state}`}
                    aria-current={state === "active" ? "step" : undefined}
                  >
                    <span className="scan-check" aria-hidden="true">
                      {state === "done" && (
                        <svg viewBox="0 0 16 16" focusable="false">
                          <path d="M2.5 8.5 L6.5 12.5 L13.5 3.5" />
                        </svg>
                      )}
                    </span>
                    <span>{label}</span>
                  </li>
                );
              })}
            </ol>

            <p className="scan-elapsed">
              <span className="scan-visually-hidden">Time elapsed: </span>
              {elapsed}s
            </p>
            <p className="scan-patience" role="status">
              {patience}
            </p>
          </section>

          <p className="scan-tip" key={tip}>
            <strong>Tip:</strong> {TIPS[tip]}
          </p>
        </>
      )}
    </main>
  );
}
