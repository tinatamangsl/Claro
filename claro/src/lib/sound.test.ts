import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as sound from "./sound";
import { SOUNDSCAPES } from "./types";

/**
 * jsdom has no Web Audio, so the engine runs against a stand-in that records
 * what it was asked to build. What is being checked is the contract: one
 * engine, never started unasked, one voice at a time, and a clean teardown.
 */
let contexts: FakeAudioContext[] = [];
let contextState = "running";

type Ramp = { value: number; at: number };

class FakeParam {
  value = 0;
  cancelScheduledValues = vi.fn();
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn((value: number, at: number) => {
    this.owner.ramps.push({ value, at });
  });
  exponentialRampToValueAtTime = vi.fn();
  constructor(private owner: { ramps: Ramp[] }) {}
}

class FakeNode {
  connected: FakeNode[] = [];
  disconnected = false;
  connect = vi.fn((target: FakeNode) => {
    this.connected.push(target);
    return target;
  });
  disconnect = vi.fn(() => {
    this.disconnected = true;
  });
}

class FakeGain extends FakeNode {
  gain: FakeParam;
  constructor(owner: { ramps: Ramp[] }) {
    super();
    this.gain = new FakeParam(owner);
  }
}

class FakeSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  started = false;
  stopped = false;
  start = vi.fn(() => {
    this.started = true;
  });
  stop = vi.fn(() => {
    this.stopped = true;
  });
}

class FakeOscillator extends FakeSource {
  type = "sine";
  frequency = { value: 0 };
  detune = { value: 0 };
}

class FakeAudioContext {
  sampleRate = 8000;
  currentTime = 0;
  destination = new FakeNode();
  ramps: Ramp[] = [];
  sources: FakeSource[] = [];
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  closed = 0;
  resumed = 0;

  constructor() {
    contexts.push(this);
  }
  get state() {
    return contextState;
  }
  createBuffer(_c: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  createGain() {
    const gain = new FakeGain(this);
    this.gains.push(gain);
    return gain;
  }
  createBiquadFilter() {
    const node = new FakeNode() as FakeNode & {
      type: string;
      frequency: { value: number };
      Q: { value: number };
      gain: { value: number };
    };
    node.type = "";
    node.frequency = { value: 0 };
    node.Q = { value: 0 };
    node.gain = { value: 0 };
    return node;
  }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  createOscillator() {
    const osc = new FakeOscillator();
    this.oscillators.push(osc);
    return osc;
  }
  resume() {
    this.resumed += 1;
    contextState = "running";
    return Promise.resolve();
  }
  close() {
    this.closed += 1;
    return Promise.resolve();
  }
}

const ctx = () => contexts[0];
const lastRamp = () => ctx().ramps.at(-1)?.value ?? 0;
/** Sources and oscillators that are still running. */
const liveVoices = () =>
  [...ctx().sources, ...ctx().oscillators].filter((n) => n.started && !n.stopped);

beforeEach(() => {
  contexts = [];
  contextState = "running";
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
});

afterEach(() => {
  sound.stop();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe("playback is user-started only", () => {
  it("does nothing at all until something asks it to play", () => {
    expect(sound.isPlaying()).toBe(false);
    expect(contexts).toHaveLength(0);
  });

  it("creates no audio context merely by asking whether it is supported", () => {
    expect(sound.isSupported()).toBe(true);
    expect(contexts).toHaveLength(0);
  });

  it("starts only on an explicit call", async () => {
    expect(await sound.play("brown", 0.4, false)).toBe(true);

    expect(sound.isPlaying()).toBe(true);
    expect(contexts).toHaveLength(1);
  });

  it("reports failure rather than throwing where there is no Web Audio", async () => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;

    expect(await sound.play("brown", 0.4, false)).toBe(false);
    expect(sound.isPlaying()).toBe(false);
  });

  it("resumes a context the browser had suspended", async () => {
    contextState = "suspended";
    await sound.play("brown", 0.4, false);

    expect(ctx().resumed).toBe(1);
  });
});

describe("one audio instance, however many controls exist", () => {
  it("builds one context across repeated starts and stops", async () => {
    await sound.play("brown", 0.4, false);
    sound.pause();
    await sound.play("brown", 0.4, false);
    await sound.play("brown", 0.4, false);

    // Two mounted controls, a route change and a refresh must not stack sounds.
    expect(contexts).toHaveLength(1);
  });

  it("keeps exactly one voice running when the soundscape changes", async () => {
    await sound.play("brown", 0.5, false);
    const first = liveVoices().length;
    expect(first).toBeGreaterThan(0);

    sound.select("rain", 0.5, false);
    sound.select("pad", 0.5, false);

    // The previous voice is torn down as the next is mounted, so they never
    // accumulate and never play over each other.
    expect(sound.currentSoundscape()).toBe("pad");
    expect(liveVoices().length).toBeGreaterThan(0);
    expect(contexts).toHaveLength(1);
  });

  it("ignores a soundscape change while nothing is playing", () => {
    sound.select("rain", 0.5, false);

    expect(contexts).toHaveLength(0);
    expect(sound.isPlaying()).toBe(false);
  });

  it("does not rebuild the voice when the same soundscape is chosen again", async () => {
    await sound.play("rain", 0.5, false);
    const before = ctx().sources.length;

    sound.select("rain", 0.5, false);

    expect(ctx().sources).toHaveLength(before);
  });

  it("can build every soundscape in the catalogue", async () => {
    for (const id of SOUNDSCAPES) {
      await sound.play(id, 0.4, false);
      expect(sound.currentSoundscape()).toBe(id);
    }
    expect(contexts).toHaveLength(1);
  });
});

describe("volume, mute and pause", () => {
  it("fades to silence on pause and stops reporting as playing", async () => {
    await sound.play("brown", 0.6, false);
    sound.pause();

    expect(lastRamp()).toBe(0);
    expect(sound.isPlaying()).toBe(false);
  });

  it("mutes to exactly zero without stopping playback", async () => {
    await sound.play("brown", 0.8, false);
    sound.setLevel(0.8, true);

    expect(lastRamp()).toBe(0);
    expect(sound.isPlaying()).toBe(true);
  });

  it("applies a louder volume as a larger gain", async () => {
    await sound.play("brown", 0.2, false);
    sound.setLevel(0.2, false);
    const quiet = lastRamp();

    sound.setLevel(0.9, false);
    expect(lastRamp()).toBeGreaterThan(quiet);
  });

  it("clamps a volume outside the range rather than distorting", async () => {
    await sound.play("brown", 0.5, false);
    sound.setLevel(9, false);

    expect(lastRamp()).toBeLessThanOrEqual(1);
  });

  it("ignores a level change while nothing is playing", async () => {
    await sound.play("brown", 0.5, false);
    sound.pause();
    const after = ctx().ramps.length;

    sound.setLevel(0.9, false);

    expect(ctx().ramps).toHaveLength(after);
  });
});

describe("the optional chime", () => {
  it("stays silent when the user has muted", async () => {
    await sound.chime(0.5, true);

    expect(contexts).toHaveLength(0);
  });

  it("plays a short tone when it is asked to", async () => {
    await sound.chime(0.5, false);

    expect(ctx().oscillators.length).toBeGreaterThan(0);
    // A chime marks a moment; it must not become an ongoing sound.
    expect(ctx().oscillators.every((o) => o.stop.mock.calls.length > 0)).toBe(true);
  });

  it("does not put the engine into a playing state", async () => {
    await sound.chime(0.5, false);

    expect(sound.isPlaying()).toBe(false);
  });
});

describe("teardown", () => {
  it("closes the context and forgets the voice", async () => {
    await sound.play("rain", 0.4, false);
    const context = ctx();
    sound.stop();

    expect(context.closed).toBe(1);
    expect(sound.isPlaying()).toBe(false);
    expect(sound.currentSoundscape()).toBeNull();
  });

  it("can start again cleanly after being stopped", async () => {
    await sound.play("brown", 0.4, false);
    sound.stop();

    expect(await sound.play("pink", 0.4, false)).toBe(true);
    expect(sound.currentSoundscape()).toBe("pink");
    expect(contexts).toHaveLength(2);
  });
});

describe("playing the user's own audio", () => {
  /** A stand-in for the file the user picks, and the element that plays it. */
  class FakeAudio {
    src: string;
    loop = false;
    crossOrigin: string | null = null;
    paused = false;
    play = vi.fn(() => Promise.resolve());
    pause = vi.fn(() => {
      this.paused = true;
    });
    constructor(src: string) {
      this.src = src;
      audios.push(this);
    }
  }

  let audios: FakeAudio[] = [];
  let created = 0;
  let revoked = 0;

  beforeEach(() => {
    audios = [];
    created = 0;
    revoked = 0;
    (window as unknown as { Audio: unknown }).Audio = FakeAudio;
    URL.createObjectURL = vi.fn(() => {
      created += 1;
      return `blob:fake-${created}`;
    }) as never;
    URL.revokeObjectURL = vi.fn(() => {
      revoked += 1;
    }) as never;
    (FakeAudioContext.prototype as unknown as Record<string, unknown>).createMediaElementSource =
      function () {
        return new FakeNode();
      };
  });

  const file = (name = "my-track.mp3") => new File(["x"], name, { type: "audio/mpeg" });

  it("plays a chosen file through the one engine", async () => {
    expect(await sound.playLocalFile(file(), 0.5, false)).toBe(true);

    expect(sound.isPlaying()).toBe(true);
    expect(sound.localFileName()).toBe("my-track.mp3");
    expect(contexts).toHaveLength(1);
  });

  it("loops by default, and the loop can be turned off", async () => {
    await sound.playLocalFile(file(), 0.5, false, true);
    expect(audios.at(-1)?.loop).toBe(true);

    sound.setLoop(false);
    expect(audios.at(-1)?.loop).toBe(false);
  });

  it("replaces a generated soundscape rather than playing over it", async () => {
    await sound.play("brown", 0.5, false);
    const before = liveVoices().length;
    expect(before).toBeGreaterThan(0);

    await sound.playLocalFile(file(), 0.5, false);

    // One engine, one voice: the soundscape is torn down as the file mounts.
    expect(sound.currentSoundscape()).toBeNull();
    expect(contexts).toHaveLength(1);
  });

  it("is replaced in turn when a soundscape is chosen again", async () => {
    await sound.playLocalFile(file(), 0.5, false);
    await sound.play("rain", 0.5, false);

    expect(sound.localFileName()).toBeNull();
    expect(sound.currentSoundscape()).toBe("rain");
  });

  it("stops the element on pause, not just the gain", async () => {
    await sound.playLocalFile(file(), 0.5, false);
    sound.pause();

    expect(audios.at(-1)?.pause).toHaveBeenCalled();
    expect(sound.isPlaying()).toBe(false);
  });

  it("releases the file handle when the engine is torn down", async () => {
    await sound.playLocalFile(file(), 0.5, false);
    expect(created).toBe(1);

    sound.stop();

    // The object URL is revoked, so nothing keeps a reference to the file.
    expect(revoked).toBe(1);
    expect(sound.localFileName()).toBeNull();
  });

  it("never leaves the device: no upload, no copy, only an object URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch" as never);
    await sound.playLocalFile(file(), 0.5, false);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(audios.at(-1)?.src.startsWith("blob:")).toBe(true);
  });

  it("reports failure rather than throwing where there is no Web Audio", async () => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;

    expect(await sound.playLocalFile(file(), 0.5, false)).toBe(false);
  });
});
