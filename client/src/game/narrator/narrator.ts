import Phaser from "phaser";
import { gameEvents, type DeathEvent, type Level, type WinEvent } from "@sketchquest/shared";
import { pickLine } from "./pick";
import { SpeechBubble, type Anchor } from "./bubble";
import { cancelSpeech, estimateSpeechMs, installSpeechUnlock, isSpeaking, speak, voiceActive } from "./speech";
import type { LineContext, NarratorContext } from "./types";

export { pickLine } from "./pick";
export type { LineContext, NarratorContext, Trigger } from "./types";

/** Where lines come from. Today: the local pool. Later: Gemini, falling back to the pool. */
export interface LineSource {
  getLine(ctx: LineContext): Promise<string>;
}

export class LocalLineSource implements LineSource {
  getLine(ctx: LineContext): Promise<string> {
    return Promise.resolve(pickLine(ctx.trigger, ctx));
  }
}

/**
 * Line source factory. VITE_LIVE_ROAST=1 is the (default off) flag for a live source.
 *
 * TODO(live-roast): when the flag is on, return a source that POSTs a RoastRequest
 * ({ levelName, cause, attempt, deathsAtSpot, coins, timeAlive, recentRoasts }) to
 * /api/roast with an AbortController timeout of ~3s (the server's own cutoff is
 * GEMINI_ROAST_TIMEOUT_MS + ~500ms) and, on any error, timeout or bad body, falls back
 * to LocalLineSource. Only death triggers map to /api/roast; every other trigger stays
 * local. Send the narrator's `recentLines` as `recentRoasts`. Not implemented on purpose.
 */
function createLineSource(): LineSource {
  const liveRoast = import.meta.env.VITE_LIVE_ROAST === "1";
  void liveRoast;
  return new LocalLineSource();
}

type Priority = "high" | "normal" | "low";

/** Breathing room between two non-urgent lines, on top of "skip if one is still up". */
const MIN_GAP_MS = 2500;
/** Bubble reading speed when there is no voice (muted or unsupported): captions only. */
const CAPTION_CPS = 30;
const HOLD_WITH_VOICE_MS = 1000;
const HOLD_CAPTION_BASE_MS = 1500;
const HOLD_CAPTION_PER_CHAR_MS = 25;
const FADE_MS = 350;
const MAX_INTRO_CHARS = 140;
const MILESTONES = new Set([5, 10]);
const RECENT_KEPT = 3;

const now = () => Date.now();

/**
 * Local snarky narrator. A session-wide singleton: GameScene calls `bind`
 * on every scene create and forwards the intro/coin/mute hooks; deaths and
 * wins arrive through `gameEvents`. Every line gets a captioned bubble and
 * is spoken unless muted.
 */
class Narrator {
  private readonly source: LineSource = createLineSource();
  private scene?: Phaser.Scene;
  private level?: Level;
  private bubble?: SpeechBubble;
  private getAnchor: () => Anchor | undefined = () => undefined;

  private levelDeaths = 0;
  private totalDeaths = 0;
  private firstCoinDone = false;
  private allCoinsDone = false;

  private busyUntil = 0;
  private lastStart = 0;
  private token = 0;
  /** Last few shown lines: the `recentRoasts` payload for the future live source. */
  private recentLines: string[] = [];

  constructor() {
    gameEvents.on("death", (e) => this.onDeath(e));
    gameEvents.on("win", (e) => this.onWin(e));
  }

  /** New scene/level: reset per-level counters (total deaths persist for the session). */
  bind(scene: Phaser.Scene, level: Level, getAnchor: () => Anchor | undefined) {
    installSpeechUnlock();
    this.unbind();
    this.scene = scene;
    this.level = level;
    this.getAnchor = getAnchor;
    this.bubble = new SpeechBubble(scene);
    this.levelDeaths = 0;
    this.firstCoinDone = false;
    this.allCoinsDone = false;
    this.busyUntil = 0;
    this.lastStart = 0;
    const off = () => this.unbind(scene);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
    scene.events.once(Phaser.Scenes.Events.DESTROY, off);
  }

  /** Stops speech and drops the bubble. Pass the scene to only unbind if it is still the current one. */
  unbind(scene?: Phaser.Scene) {
    if (scene && this.scene !== scene) return;
    this.token++;
    cancelSpeech();
    this.bubble?.destroy();
    this.bubble = undefined;
    this.scene = undefined;
  }

  /** Per frame: keeps the bubble above the player. */
  update() {
    if (this.bubble?.active) this.bubble.update(this.getAnchor());
  }

  /** Whether the narrator's voice is on (speech supported and not muted). Captions show regardless. */
  voiceActive() {
    return voiceActive();
  }

  /** M was toggled: muting cuts off the line being spoken; the caption stays. */
  onMuteChanged() {
    if (!voiceActive()) cancelSpeech();
  }

  /** New level shown: the level's own intro string first, then a local intro quip. */
  onLevelIntro() {
    if (!this.level) return;
    const intro = this.level.intro.replace(/\p{Cc}+/gu, " ").trim().slice(0, MAX_INTRO_CHARS);
    void this.say({ trigger: { kind: "intro" }, ...this.base(1, 0) }, "high", { prefix: intro });
  }

  /** Called after each coin pickup with this attempt's running count and the level's total. */
  onCoin(collected: number, total: number) {
    if (!this.level) return;
    if (collected >= total && total >= 2 && !this.allCoinsDone) {
      this.allCoinsDone = true;
      this.firstCoinDone = true;
      void this.say({ trigger: { kind: "allCoins" }, ...this.base(this.levelDeaths + 1, 0, collected) }, "normal");
    } else if (!this.firstCoinDone) {
      this.firstCoinDone = true;
      void this.say({ trigger: { kind: "firstCoin" }, ...this.base(this.levelDeaths + 1, 0, collected) }, "low");
    }
  }

  private onDeath(e: DeathEvent) {
    if (!this.level) return;
    this.levelDeaths++;
    this.totalDeaths++;
    const ctx: NarratorContext = { ...this.base(e.attempt, e.deathsAtSpot, e.coins), timeAlive: e.timeAlive };
    if (MILESTONES.has(this.totalDeaths)) {
      void this.say({ trigger: { kind: "milestone", count: this.totalDeaths }, ...ctx }, "high");
    } else {
      void this.say({ trigger: { kind: "death", cause: e.cause }, ...ctx }, "normal");
    }
  }

  private onWin(e: WinEvent) {
    if (!this.level) return;
    const ctx: NarratorContext = { ...this.base(this.levelDeaths + 1, 0, e.coins), timeAlive: e.timeAlive };
    void this.say({ trigger: { kind: "win" }, ...ctx }, "high", { pinTop: true });
  }

  private base(attempt: number, deathsAtSpot: number, coins = 0): NarratorContext {
    return {
      levelName: this.level?.name ?? "",
      attempt,
      deathsAtSpot,
      coins,
      timeAlive: 0,
      levelDeaths: this.levelDeaths,
      totalDeaths: this.totalDeaths,
    };
  }

  private busy() {
    return now() < this.busyUntil || isSpeaking() || !!this.bubble?.active;
  }

  /**
   * High priority (intro, win, milestones) interrupts whatever is up.
   * Normal and low are skipped while a line is still showing/speaking or
   * within MIN_GAP_MS of the last one.
   */
  private async say(ctx: LineContext, priority: Priority, opts: { prefix?: string; pinTop?: boolean } = {}) {
    if (!this.scene) return;
    if (priority !== "high" && (this.busy() || now() - this.lastStart < MIN_GAP_MS)) return;

    const mine = ++this.token;
    let line: string;
    try {
      line = await this.source.getLine(ctx);
    } catch {
      line = pickLine(ctx.trigger, ctx);
    }
    // Superseded by a newer line, or the scene went away while we waited.
    if (mine !== this.token || !this.scene) return;

    this.present(opts.prefix ? `${opts.prefix} ${line}` : line, !!opts.pinTop);
  }

  private present(text: string, pinTop: boolean) {
    const bubble = this.bubble;
    if (!bubble) return;
    const voice = voiceActive();
    const typeMs = voice ? estimateSpeechMs(text) : (text.length / CAPTION_CPS) * 1000;
    const holdMs = voice ? HOLD_WITH_VOICE_MS : HOLD_CAPTION_BASE_MS + text.length * HOLD_CAPTION_PER_CHAR_MS;

    bubble.show(text, typeMs, holdMs, pinTop);
    bubble.update(this.getAnchor());
    if (voice) speak(text);
    else cancelSpeech();

    this.lastStart = now();
    this.busyUntil = this.lastStart + typeMs + holdMs + FADE_MS;
    this.recentLines = [...this.recentLines, text].slice(-RECENT_KEPT);
  }
}

export const narrator = new Narrator();
