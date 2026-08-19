import { SOUNDSCAPES, type SoundscapeId } from "./types";

/**
 * Ambient sound, generated rather than played back.
 *
 * Every soundscape is synthesised here from noise and oscillators: there is no
 * audio file, no stream, no network request, nothing to license and nothing to
 * track. One engine exists for the whole app (a module-level singleton), so
 * moving between routes, opening a second set of controls or refreshing can
 * never produce two sounds at once.
 *
 * It starts only from an explicit user action. Browsers block autoplay anyway,
 * but the rule here is the product's rather than the browser's.
 *
 * These are sounds, not treatments. Nothing in this module or its copy claims
 * an effect on brainwaves, cognition, stress, productivity or hormones.
 */

const FADE_SECONDS = 0.6;
/** Long enough that a loop point is not audible as a rhythm. */
const NOISE_SECONDS = 6;

type Voice = {
  output: GainNode;
  /** Everything that has to be torn down when the soundscape changes. */
  stop: () => void;
};

type Engine = {
  context: AudioContext;
  master: GainNode;
  voice: Voice | null;
  soundscape: SoundscapeId | null;
  /** Set while the user's own file is the source, instead of a soundscape. */
  localName: string | null;
};

let engine: Engine | null = null;
let playing = false;

// ------------------------------------------------------------ noise buffers

/** Shared by every noise-based soundscape, generated once per context. */
const buffers = new Map<string, AudioBuffer>();

function noiseBuffer(context: AudioContext, kind: "white" | "pink" | "brown"): AudioBuffer {
  const cached = buffers.get(kind);
  if (cached) return cached;

  const length = Math.floor(context.sampleRate * NOISE_SECONDS);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  if (kind === "white") {
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * 0.55;
  } else if (kind === "brown") {
    // A running average of white noise: the cheap way to brown.
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
  } else {
    // Paul Kellet's pink filter: white noise with a 1/f slope.
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  }

  // Blend the ends together so the loop point is inaudible.
  const blend = Math.floor(context.sampleRate * 0.05);
  for (let i = 0; i < blend; i += 1) {
    const t = i / blend;
    data[i] = data[i] * t + data[length - blend + i] * (1 - t);
  }

  buffers.set(kind, buffer);
  return buffer;
}

function loopingNoise(context: AudioContext, kind: "white" | "pink" | "brown") {
  const source = context.createBufferSource();
  source.buffer = noiseBuffer(context, kind);
  source.loop = true;
  return source;
}

// ---------------------------------------------------------------- the voices

function buildNoiseVoice(
  context: AudioContext,
  kind: "white" | "pink" | "brown",
  cutoff: number,
): Voice {
  const output = context.createGain();
  const source = loopingNoise(context, kind);

  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  filter.Q.value = 0.4;

  source.connect(filter);
  filter.connect(output);
  source.start();

  return {
    output,
    stop: () => {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      source.disconnect();
      filter.disconnect();
      output.disconnect();
    },
  };
}

/** Steady rain: band-passed noise with a slow drift, so it never sits still. */
function buildRainVoice(context: AudioContext): Voice {
  const output = context.createGain();
  const source = loopingNoise(context, "pink");

  const body = context.createBiquadFilter();
  body.type = "bandpass";
  body.frequency.value = 1100;
  body.Q.value = 0.7;

  const top = context.createBiquadFilter();
  top.type = "highshelf";
  top.frequency.value = 3800;
  top.gain.value = 5;

  // A very slow wander in the filter, which reads as weather rather than static.
  const drift = context.createOscillator();
  drift.frequency.value = 0.07;
  const driftAmount = context.createGain();
  driftAmount.gain.value = 320;
  drift.connect(driftAmount);
  driftAmount.connect(body.frequency);
  drift.start();

  source.connect(body);
  body.connect(top);
  top.connect(output);
  source.start();

  return {
    output,
    stop: () => {
      try {
        source.stop();
        drift.stop();
      } catch {
        /* already stopped */
      }
      [source, body, top, drift, driftAmount, output].forEach((n) => n.disconnect());
    },
  };
}

/** Slow, warm tones. Deliberately not called ambient music, jazz or lo-fi. */
function buildPadVoice(context: AudioContext): Voice {
  const output = context.createGain();

  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.Q.value = 0.5;
  filter.connect(output);

  // An open fifth plus an octave: no third, so it stays neutral rather than
  // reading as happy or sad.
  const partials = [110, 164.81, 220, 329.63];
  const oscillators: OscillatorNode[] = [];
  const gains: GainNode[] = [];
  const lfos: OscillatorNode[] = [];

  partials.forEach((frequency, i) => {
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.value = frequency;
    // A little detune so the tones beat gently against each other.
    osc.detune.value = (i % 2 === 0 ? 1 : -1) * (3 + i * 2);

    const gain = context.createGain();
    gain.gain.value = 0.16 / (i + 1);

    // Each partial breathes at its own slow rate.
    const lfo = context.createOscillator();
    lfo.frequency.value = 0.03 + i * 0.017;
    const depth = context.createGain();
    depth.gain.value = 0.07 / (i + 1);
    lfo.connect(depth);
    depth.connect(gain.gain);
    lfo.start();

    osc.connect(gain);
    gain.connect(filter);
    osc.start();

    oscillators.push(osc);
    gains.push(gain);
    lfos.push(lfo);
  });

  return {
    output,
    stop: () => {
      [...oscillators, ...lfos].forEach((node) => {
        try {
          node.stop();
        } catch {
          /* already stopped */
        }
      });
      [...oscillators, ...gains, ...lfos, filter, output].forEach((n) => n.disconnect());
    },
  };
}

function buildVoice(context: AudioContext, id: SoundscapeId): Voice {
  switch (id) {
    case "white":
      return buildNoiseVoice(context, "white", 7000);
    case "pink":
      return buildNoiseVoice(context, "pink", 3200);
    case "brown":
      return buildNoiseVoice(context, "brown", 780);
    case "rain":
      return buildRainVoice(context);
    case "pad":
      return buildPadVoice(context);
  }
}

/** Each soundscape needs its own trim to sit at a comparable loudness. */
const TRIM: Record<SoundscapeId, number> = {
  white: 0.35,
  pink: 0.6,
  brown: 1,
  rain: 0.85,
  pad: 0.9,
};

// ---------------------------------------------------------------- the engine

function audioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  );
}

function ensureEngine(): Engine | null {
  if (engine) return engine;

  const Ctor = audioContextCtor();
  if (!Ctor) return null;

  const context = new Ctor();
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(context.destination);

  engine = { context, master, voice: null, soundscape: null, localName: null };
  return engine;
}

/** Volume is stored 0 to 1 but sounds more even applied on a curve. */
function level(volume: number, muted: boolean, id: SoundscapeId | null): number {
  if (muted) return 0;
  const clamped = Math.min(1, Math.max(0, volume));
  // A file the user supplied is already mastered, so it takes no trim.
  return clamped * clamped * 0.5 * (id ? TRIM[id] : 1);
}

function ramp(target: number, seconds = FADE_SECONDS) {
  if (!engine) return;
  const { context, master } = engine;
  master.gain.cancelScheduledValues(context.currentTime);
  master.gain.setValueAtTime(master.gain.value, context.currentTime);
  master.gain.linearRampToValueAtTime(target, context.currentTime + seconds);
}

function mountVoice(id: SoundscapeId) {
  if (!engine) return;
  engine.voice?.stop();
  const voice = buildVoice(engine.context, id);
  voice.output.connect(engine.master);
  engine.voice = voice;
  engine.soundscape = id;
  engine.localName = null;
}

/**
 * The user's own audio file, played through the same engine.
 *
 * The file never leaves the device: it is read as an object URL, decoded by the
 * browser, and routed into the one master gain, so every existing control and
 * the stop-on-session-end behaviour apply to it unchanged. The URL is revoked
 * when the voice is torn down, and nothing about it is persisted.
 */
function mountLocalFile(file: File, loop: boolean): Voice | null {
  if (!engine) return null;

  engine.voice?.stop();

  const { context } = engine;
  const url = URL.createObjectURL(file);
  const element = new Audio(url);
  element.loop = loop;
  element.crossOrigin = "anonymous";

  const output = context.createGain();
  const source = context.createMediaElementSource(element);
  source.connect(output);
  output.connect(engine.master);

  void element.play().catch(() => {
    /* a browser may refuse until a further gesture; the controls still work */
  });

  const voice: Voice = {
    output,
    stop: () => {
      element.pause();
      try {
        source.disconnect();
        output.disconnect();
      } catch {
        /* already disconnected */
      }
      // Releases the file handle. Nothing was ever uploaded or copied.
      URL.revokeObjectURL(url);
    },
  };

  engine.voice = voice;
  engine.soundscape = null;
  engine.localName = file.name;
  localElement = element;
  return voice;
}

/** The playing element, so loop and transport can reach it. */
let localElement: HTMLAudioElement | null = null;

/**
 * Starts the sound. Must be called from a user gesture: that is both a browser
 * requirement and a deliberate product one.
 */
export async function play(
  soundscape: SoundscapeId,
  volume: number,
  muted: boolean,
): Promise<boolean> {
  const active = ensureEngine();
  if (!active) return false;

  try {
    if (active.context.state === "suspended") await active.context.resume();
  } catch {
    return false;
  }

  if (active.soundscape !== soundscape || !active.voice) mountVoice(soundscape);
  playing = true;
  ramp(level(volume, muted, soundscape));
  return true;
}

/**
 * Changes soundscape without restarting playback, and without ever leaving two
 * voices connected: the old one is torn down as the new one is mounted.
 */
export function select(soundscape: SoundscapeId, volume: number, muted: boolean): void {
  if (!engine || !playing) return;
  if (engine.soundscape === soundscape) return;

  mountVoice(soundscape);
  ramp(level(volume, muted, soundscape), 0.25);
}

/**
 * Plays a file the user chose from their own device.
 *
 * Session only: the file reference lives in memory and is dropped when playback
 * stops or the tab closes. Nothing is uploaded, copied into the app, or shared.
 */
export async function playLocalFile(
  file: File,
  volume: number,
  muted: boolean,
  loop = true,
): Promise<boolean> {
  const active = ensureEngine();
  if (!active) return false;

  try {
    if (active.context.state === "suspended") await active.context.resume();
  } catch {
    return false;
  }

  if (!mountLocalFile(file, loop)) return false;
  playing = true;
  ramp(level(volume, muted, null));
  return true;
}

export function setLoop(loop: boolean): void {
  if (localElement) localElement.loop = loop;
}

export function localFileName(): string | null {
  return engine?.localName ?? null;
}

export function pause(): void {
  playing = false;
  ramp(0);
  // A media element keeps running behind a silent gain, so stop it properly.
  localElement?.pause();
}

/** Applies a volume or mute change to a sound that is already running. */
export function setLevel(volume: number, muted: boolean): void {
  if (!engine || !playing) return;
  ramp(level(volume, muted, engine.soundscape));
}

/**
 * A short, soft chime. Used only for the optional end-of-session marker, and
 * only when the user has turned it on.
 */
export async function chime(volume: number, muted: boolean): Promise<void> {
  if (muted) return;
  const active = ensureEngine();
  if (!active) return;

  try {
    if (active.context.state === "suspended") await active.context.resume();
  } catch {
    return;
  }

  const { context } = active;
  const now = context.currentTime;
  const gain = context.createGain();
  gain.connect(context.destination);

  const peak = Math.min(1, Math.max(0, volume)) * 0.16;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);

  // A fifth, struck once. Short enough to mark a moment, not to interrupt.
  [587.33, 880].forEach((frequency, i) => {
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.value = frequency;
    const voiceGain = context.createGain();
    voiceGain.gain.value = i === 0 ? 1 : 0.5;
    osc.connect(voiceGain);
    voiceGain.connect(gain);
    osc.start(now);
    osc.stop(now + 2.4);
  });
}

export function isPlaying(): boolean {
  return playing;
}

export function currentSoundscape(): SoundscapeId | null {
  return engine?.soundscape ?? null;
}

/** Tears the engine down completely. Used on reset and by tests. */
export function stop(): void {
  playing = false;
  if (!engine) return;

  engine.voice?.stop();
  try {
    void engine.context.close();
  } catch {
    /* already closed */
  }
  buffers.clear();
  localElement = null;
  engine = null;
}

/** True when this browser can generate the sound at all. */
export function isSupported(): boolean {
  return audioContextCtor() !== null;
}

/** Exported for the picker, so the catalogue has one source of truth. */
export const soundscapes = SOUNDSCAPES;
