/**
 * Tiny synthesized sound effects (no asset files). The AudioContext is
 * created lazily on the first user input to satisfy browser autoplay
 * policy; until then every play*() call is a silent no-op.
 */

const MASTER_VOLUME = 0.12;
const UNLOCK_EVENTS = ["keydown", "pointerdown", "pointerup", "touchend"] as const;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let listening = false;

type Tone = {
  freq: number;
  /** Frequency at the end of the tone, for sweeps. */
  endFreq?: number;
  type?: OscillatorType;
  /** Seconds from now. */
  delay?: number;
  duration: number;
  volume?: number;
};

/**
 * Call once at startup. The first key/pointer/touch input creates and
 * resumes the AudioContext (iOS only unlocks it on pointerup/touchend, so
 * the listeners stay until the context is actually running).
 */
export function installAudioUnlock() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, true);
}

function unlock() {
  const context = ensureContext();
  if (!context) return removeUnlockListeners();
  void context.resume().then(() => {
    if (context.state === "running") removeUnlockListeners();
  });
}

function removeUnlockListeners() {
  for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, true);
  listening = false;
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOLUME;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
    master = null;
  }
  return ctx;
}

export function isMuted() {
  return muted;
}

/** Toggles mute and returns the new state. Works before the context exists. */
export function toggleMute(): boolean {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : MASTER_VOLUME;
  return muted;
}

function tone({ freq, endFreq, type = "square", delay = 0, duration, volume = 0.6 }: Tone) {
  if (!ctx || !master || muted || ctx.state !== "running") return;
  const start = ctx.currentTime + delay;
  const end = start + duration;

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, end);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gain).connect(master);
  osc.start(start);
  osc.stop(end + 0.02);
}

export function playJump() {
  tone({ freq: 280, endFreq: 620, type: "square", duration: 0.13, volume: 0.35 });
}

export function playCoin() {
  tone({ freq: 988, type: "square", duration: 0.07, volume: 0.35 });
  tone({ freq: 1319, type: "square", delay: 0.07, duration: 0.14, volume: 0.35 });
}

export function playDeath() {
  tone({ freq: 420, endFreq: 70, type: "sawtooth", duration: 0.4, volume: 0.5 });
  tone({ freq: 210, endFreq: 40, type: "square", delay: 0.05, duration: 0.35, volume: 0.3 });
}

export function playWin() {
  [523, 659, 784, 1047].forEach((freq, i) => {
    tone({ freq, type: "triangle", delay: i * 0.11, duration: i === 3 ? 0.35 : 0.14, volume: 0.6 });
  });
}

export function playStomp() {
  tone({ freq: 240, endFreq: 90, type: "square", duration: 0.1, volume: 0.5 });
  tone({ freq: 520, endFreq: 760, type: "triangle", delay: 0.08, duration: 0.09, volume: 0.35 });
}
