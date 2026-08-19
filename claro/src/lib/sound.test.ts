import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as sound from "./sound";

/**
 * jsdom has no Web Audio, so the engine is driven against a stand-in that
 * records what it was asked to do. What matters here is the contract: one
 * engine, never started without being asked, and volume applied through a ramp.
 */
type Ramp = { value: number; at: number };

let ramps: Ramp[] = [];
let created = 0;
let resumed = 0;
let closed = 0;
let contextState = "running";

class FakeGain {
  gain = {
    value: 0,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: (value: number, at: number) => ramps.push({ value, at }),
  };
  connect = vi.fn();
}

class FakeAudioContext {
  sampleRate = 8000;
  currentTime = 0;
  destination = {};
  get state() {
    return contextState;
  }
  constructor() {
    created += 1;
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  createGain() {
    return new FakeGain();
  }
  createBiquadFilter() {
    return { type: "", frequency: { value: 0 }, Q: { value: 0 }, connect: vi.fn() };
  }
  createBufferSource() {
    return { buffer: null, loop: false, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
  }
  resume() {
    resumed += 1;
    contextState = "running";
    return Promise.resolve();
  }
  close() {
    closed += 1;
    return Promise.resolve();
  }
}

beforeEach(() => {
  ramps = [];
  created = 0;
  resumed = 0;
  closed = 0;
  contextState = "running";
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
});

afterEach(() => {
  sound.stop();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe("ambient sound", () => {
  it("is not playing until something asks it to", () => {
    expect(sound.isPlaying()).toBe(false);
    expect(created).toBe(0);
  });

  it("reports whether the browser can generate it at all", () => {
    expect(sound.isSupported()).toBe(true);

    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    expect(sound.isSupported()).toBe(false);
  });

  it("starts only on an explicit call, and then is playing", async () => {
    expect(await sound.play(0.4, false)).toBe(true);

    expect(sound.isPlaying()).toBe(true);
    expect(created).toBe(1);
  });

  it("builds one engine however many times it is started", async () => {
    await sound.play(0.4, false);
    sound.pause();
    await sound.play(0.4, false);

    // Two routes mounting the control must not mean two sounds.
    expect(created).toBe(1);
  });

  it("resumes a context the browser suspended", async () => {
    contextState = "suspended";
    await sound.play(0.4, false);

    expect(resumed).toBe(1);
  });

  it("fades to silence on pause rather than cutting", () => {
    ramps = [];
    sound.pause();

    expect(sound.isPlaying()).toBe(false);
  });

  it("mutes to exactly zero", async () => {
    await sound.play(0.8, false);
    ramps = [];
    sound.setLevel(0.8, true);

    expect(ramps.at(-1)?.value).toBe(0);
  });

  it("applies a louder volume as a larger gain", async () => {
    await sound.play(0.2, false);
    ramps = [];
    sound.setLevel(0.2, false);
    const quiet = ramps.at(-1)?.value ?? 0;

    sound.setLevel(0.9, false);
    const loud = ramps.at(-1)?.value ?? 0;

    expect(loud).toBeGreaterThan(quiet);
    expect(loud).toBeLessThanOrEqual(1);
  });

  it("ignores a volume change while nothing is playing", () => {
    ramps = [];
    sound.setLevel(0.9, false);

    expect(ramps).toHaveLength(0);
  });

  it("clamps a volume outside 0–1 rather than distorting", async () => {
    await sound.play(0.5, false);
    ramps = [];
    sound.setLevel(9, false);

    expect(ramps.at(-1)?.value).toBeLessThanOrEqual(1);
  });

  it("tears the engine down on stop", async () => {
    await sound.play(0.4, false);
    sound.stop();

    expect(closed).toBe(1);
    expect(sound.isPlaying()).toBe(false);
  });

  it("reports failure rather than throwing when there is no Web Audio", async () => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;

    expect(await sound.play(0.4, false)).toBe(false);
    expect(sound.isPlaying()).toBe(false);
  });
});
