import { isMuted } from "../audio";

/**
 * Browser SpeechSynthesis, tuned smug (a touch lower pitch, a touch faster).
 * Everything fails silently: no API, no voices, autoplay-blocked, muted.
 */

const PITCH = 0.9;
const RATE = 1.05;
/** Rough speaking speed at RATE 1.05, for syncing the typewriter. */
const CHARS_PER_SECOND = 14.5;
const UNLOCK_EVENTS = ["keydown", "pointerdown", "pointerup", "touchend"] as const;
/** Chrome drops a speak() issued in the same tick as cancel(), so wait a moment. */
const SPEAK_DELAY_MS = 40;
/** If an utterance never reports its end (some browsers), stop trusting isSpeaking() after this. */
const SPEAKING_WATCHDOG_MS = 12000;

/** Preferred voices, best first (matched against the voice name). */
const PREFERRED_VOICES = [/daniel/i, /samantha/i, /google uk english/i, /google us english/i, /alex/i, /karen/i, /microsoft (guy|aria|david)/i];

type Hooks = { onStart?: () => void; onEnd?: () => void };

let voice: SpeechSynthesisVoice | null = null;
let voiceChosen = false;
let unlockInstalled = false;
let token = 0;
/** Held so the utterance isn't garbage-collected mid-speech (which drops its end event in Chrome). */
let current: SpeechSynthesisUtterance | null = null;
let speaking = false;
let speakingSince = 0;

function synth(): SpeechSynthesis | null {
  try {
    return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined"
      ? window.speechSynthesis
      : null;
  } catch {
    return null;
  }
}

/** Whether this browser has speech at all (ignores mute). */
export const speechSupported = () => synth() !== null;

/** Speech will actually be spoken right now: supported and not muted. */
export const voiceActive = () => speechSupported() && !isMuted();

/** Estimated speaking time for a line, to time the typewriter against. */
export const estimateSpeechMs = (text: string) => Math.min(9000, Math.max(900, (text.length / CHARS_PER_SECOND) * 1000));

function scoreVoice(v: SpeechSynthesisVoice): number {
  if (!/^en\b|^en[-_]/i.test(v.lang)) return -1;
  const preferred = PREFERRED_VOICES.findIndex((re) => re.test(v.name));
  let score = 1 + (preferred >= 0 ? 20 - preferred : 0);
  if (/^en[-_]gb/i.test(v.lang)) score += 1;
  if (v.localService) score += 0.5;
  return score;
}

/** Picks an English voice once (voices load lazily, so retry until the list is non-empty), then caches it. */
function ensureVoice() {
  if (voiceChosen) return;
  const s = synth();
  if (!s) return;
  const voices = s.getVoices();
  if (!voices.length) return;
  voiceChosen = true;
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = 0;
  for (const v of voices) {
    const score = scoreVoice(v);
    if (score > bestScore) [best, bestScore] = [v, score];
  }
  voice = best;
}

/**
 * Call once. Speech needs a user gesture on some browsers (iOS Safari in
 * particular), so the first key/pointer/touch primes the engine with a
 * silent utterance and preloads the voice list.
 */
export function installSpeechUnlock() {
  const s = synth();
  if (!s || unlockInstalled) return;
  unlockInstalled = true;
  s.addEventListener?.("voiceschanged", ensureVoice);
  ensureVoice();

  const unlock = () => {
    try {
      const primer = new SpeechSynthesisUtterance(" ");
      primer.volume = 0;
      s.speak(primer);
    } catch {
      /* speech unavailable: stay silent */
    }
    for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, true);
  };
  for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, true);
}

/** Cancels whatever is being spoken (and any speak still waiting to start). */
export function cancelSpeech() {
  token++;
  speaking = false;
  current = null;
  try {
    synth()?.cancel();
  } catch {
    /* ignore */
  }
}

/** True while a line is being spoken (with a watchdog for browsers that never fire `end`). */
export const isSpeaking = () => speaking && Date.now() - speakingSince < SPEAKING_WATCHDOG_MS;

/**
 * Speaks `text`, cancelling any line already in progress. Returns whether
 * speech was attempted (false when muted or unsupported).
 */
export function speak(text: string, hooks: Hooks = {}): boolean {
  const s = synth();
  cancelSpeech();
  if (!s || isMuted()) return false;
  ensureVoice();

  const mine = token;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = PITCH;
    u.rate = RATE;
    u.volume = 1;
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = "en-US";
    }
    u.onstart = () => {
      if (mine !== token) return;
      speaking = true;
      speakingSince = Date.now();
      hooks.onStart?.();
    };
    const done = () => {
      if (mine !== token) return;
      speaking = false;
      hooks.onEnd?.();
    };
    u.onend = done;
    u.onerror = done;
    current = u;
    window.setTimeout(() => {
      if (mine !== token) return;
      try {
        s.speak(u);
      } catch {
        /* ignore */
      }
    }, SPEAK_DELAY_MS);
    return true;
  } catch {
    return false;
  }
}
