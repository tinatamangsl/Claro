/**
 * Ambient sound, generated rather than played back.
 *
 * There is no audio file, no catalogue and no network request: the sound is
 * filtered noise synthesised in the browser, so there is nothing to license and
 * nothing to track. One engine exists for the whole app — a module-level
 * singleton — so moving between routes never starts a second sound.
 *
 * It is started only by an explicit user action. Browsers block autoplay
 * anyway, but the rule here is the product's, not the browser's.
 */

export type SoundState = { playing: boolean; volume: number; muted: boolean };

const FADE_SECONDS = 0.6;
/** Brown-ish noise: warmer and less hissy than white, which is the point. */
const NOISE_SECONDS = 4;

type Engine = {
  context: AudioContext;
  source: AudioBufferSourceNode;
  gain: GainNode;
};

let engine: Engine | null = null;
let playing = false;

function buildNoiseBuffer(context: AudioContext): AudioBuffer {
  const length = context.sampleRate * NOISE_SECONDS;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  // A running average of white noise — the cheap way to brown noise.
  let last = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.2;
  }

  // Match the ends so the loop point is inaudible.
  const blend = Math.floor(context.sampleRate * 0.05);
  for (let i = 0; i < blend; i += 1) {
    const t = i / blend;
    data[i] = data[i] * t + data[length - blend + i] * (1 - t);
  }

  return buffer;
}

function create(): Engine | null {
  if (typeof window === "undefined") return null;

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  const context = new Ctor();
  const gain = context.createGain();
  gain.gain.value = 0;

  // A gentle low-pass takes the edge off; the result is closer to rain than static.
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 780;
  filter.Q.value = 0.4;

  const source = context.createBufferSource();
  source.buffer = buildNoiseBuffer(context);
  source.loop = true;

  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start();

  return { context, source, gain };
}

/** Volume is stored 0–1 but sounds better applied with a curve. */
function level(volume: number, muted: boolean): number {
  if (muted) return 0;
  const clamped = Math.min(1, Math.max(0, volume));
  return clamped * clamped * 0.5;
}

function ramp(target: number) {
  if (!engine) return;
  const { context, gain } = engine;
  gain.gain.cancelScheduledValues(context.currentTime);
  gain.gain.setValueAtTime(gain.gain.value, context.currentTime);
  gain.gain.linearRampToValueAtTime(target, context.currentTime + FADE_SECONDS);
}

/**
 * Starts the sound. Must be called from a user gesture — that is a browser
 * requirement and a deliberate product one.
 */
export async function play(volume: number, muted: boolean): Promise<boolean> {
  if (!engine) engine = create();
  if (!engine) return false;

  try {
    if (engine.context.state === "suspended") await engine.context.resume();
  } catch {
    return false;
  }

  playing = true;
  ramp(level(volume, muted));
  return true;
}

export function pause(): void {
  playing = false;
  ramp(0);
}

/** Applies a volume or mute change to a sound that is already running. */
export function setLevel(volume: number, muted: boolean): void {
  if (!engine || !playing) return;
  ramp(level(volume, muted));
}

export function isPlaying(): boolean {
  return playing;
}

/** Tears the engine down completely. Used by tests and by a full reset. */
export function stop(): void {
  playing = false;
  if (!engine) return;
  try {
    engine.source.stop();
    void engine.context.close();
  } catch {
    /* already closed */
  }
  engine = null;
}

/** True when this browser can generate the sound at all. */
export function isSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.AudioContext ??
      (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext,
  );
}
