import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFocusSession } from "./use-focus-session";
import { ClaroProvider, useClaro } from "@/lib/claro-store";
import * as sound from "@/lib/sound";
import { startFocusSession } from "@/lib/focus-session";
import { FOCUS_BLOCK_MS } from "@/lib/types";

/** Only what the engine needs to report state; the audio itself is tested elsewhere. */
const engine = {
  playing: false,
  paused: 0,
  chimes: 0,
};

beforeEach(() => {
  localStorage.clear();
  engine.playing = false;
  engine.paused = 0;
  engine.chimes = 0;

  vi.spyOn(sound, "isPlaying").mockImplementation(() => engine.playing);
  vi.spyOn(sound, "pause").mockImplementation(() => {
    engine.paused += 1;
    engine.playing = false;
  });
  vi.spyOn(sound, "chime").mockImplementation(async () => {
    engine.chimes += 1;
  });
});

afterEach(() => vi.restoreAllMocks());

function harness() {
  const api: {
    focus: ReturnType<typeof useFocusSession> | null;
    store: ReturnType<typeof useClaro> | null;
  } = { focus: null, store: null };

  function Probe() {
    api.focus = useFocusSession();
    api.store = useClaro();
    return <div data-testid="ready">{String(api.store.ready)}</div>;
  }

  render(
    <ClaroProvider>
      <Probe />
    </ClaroProvider>,
  );
  return api;
}

const startBlock = (api: ReturnType<typeof harness>) =>
  act(() => {
    api.store!.startSession(
      startFocusSession({
        dayId: "2026-08-19",
        target: { kind: "priority", dayId: "2026-08-19", rank: 1, title: "Ship it" },
        intention: "Ship it",
        plannedMs: FOCUS_BLOCK_MS,
        now: new Date(),
        timeZone: "UTC",
      }),
    );
  });

describe("sound belongs to the focus session", () => {
  it("stops the sound when a session is resolved", async () => {
    const api = harness();
    await waitFor(() => expect(api.store?.ready).toBe(true));
    startBlock(api);
    engine.playing = true;

    act(() => {
      api.focus!.close("completed");
    });

    expect(engine.paused).toBe(1);
    expect(sound.isPlaying()).toBe(false);
  });

  it("stops the sound when a session is left rather than finished", async () => {
    const api = harness();
    await waitFor(() => expect(api.store?.ready).toBe(true));
    startBlock(api);
    engine.playing = true;

    act(() => {
      api.focus!.close("left");
    });

    expect(engine.paused).toBe(1);
  });

  it("stops the sound the moment the block ends, before any outcome is chosen", async () => {
    const api = harness();
    await waitFor(() => expect(api.store?.ready).toBe(true));
    startBlock(api);
    engine.playing = true;

    act(() => api.focus!.endBlock());

    expect(engine.paused).toBe(1);
    expect(api.focus!.endedWithSound).toBe(true);
  });

  it("does not ask about sound after a silent block", async () => {
    const api = harness();
    await waitFor(() => expect(api.store?.ready).toBe(true));
    startBlock(api);
    engine.playing = false;

    act(() => api.focus!.endBlock());

    expect(api.focus!.endedWithSound).toBe(false);
  });

  it("asks the question once, then lets it be dismissed", async () => {
    const api = harness();
    await waitFor(() => expect(api.store?.ready).toBe(true));
    startBlock(api);
    engine.playing = true;

    act(() => api.focus!.endBlock());
    expect(api.focus!.endedWithSound).toBe(true);

    act(() => api.focus!.dismissSoundQuestion());
    expect(api.focus!.endedWithSound).toBe(false);
  });

  it("does not pause anything when no sound was playing", async () => {
    const api = harness();
    await waitFor(() => expect(api.store?.ready).toBe(true));
    startBlock(api);

    act(() => {
      api.focus!.close("completed");
    });

    expect(engine.paused).toBe(0);
  });
});

describe("the optional end chime", () => {
  it("stays silent while the preference is off", async () => {
    const api = harness();
    await waitFor(() => expect(api.store?.ready).toBe(true));
    startBlock(api);

    act(() => {
      api.focus!.close("completed");
    });

    expect(engine.chimes).toBe(0);
  });

  it("sounds once when the block ends and the user has turned it on", async () => {
    const api = harness();
    await waitFor(() => expect(api.store?.ready).toBe(true));

    act(() => api.store!.setSound({ endChime: true }));
    startBlock(api);
    act(() => api.focus!.endBlock());

    expect(engine.chimes).toBe(1);
  });

  it("does not chime again when the outcome is chosen", async () => {
    const api = harness();
    await waitFor(() => expect(api.store?.ready).toBe(true));

    act(() => api.store!.setSound({ endChime: true }));
    startBlock(api);
    act(() => api.focus!.endBlock());
    act(() => api.focus!.close("completed"));

    expect(engine.chimes).toBe(1);
  });
});

describe("several controls, one lifecycle", () => {
  /** The header control and the page both use the hook at the same time. */
  function twoConsumers() {
    const api: {
      a: ReturnType<typeof useFocusSession> | null;
      b: ReturnType<typeof useFocusSession> | null;
      store: ReturnType<typeof useClaro> | null;
    } = { a: null, b: null, store: null };

    function A() {
      api.a = useFocusSession();
      return null;
    }
    function B() {
      api.b = useFocusSession();
      api.store = useClaro();
      return <div data-testid="ready">{String(api.store.ready)}</div>;
    }

    render(
      <ClaroProvider>
        <A />
        <B />
      </ClaroProvider>,
    );
    return api;
  }

  it("pauses the sound exactly once, however many controls are mounted", async () => {
    const api = twoConsumers();
    await waitFor(() => expect(api.store?.ready).toBe(true));

    act(() => {
      api.store!.startSession(
        startFocusSession({
          dayId: "2026-08-19",
          target: { kind: "priority", dayId: "2026-08-19", rank: 1, title: "Ship it" },
          intention: "Ship it",
          plannedMs: FOCUS_BLOCK_MS,
          now: new Date(),
          timeZone: "UTC",
        }),
      );
    });
    engine.playing = true;

    act(() => api.a!.endBlock());

    expect(engine.paused).toBe(1);
  });

  it("lets every control agree that there was sound", async () => {
    const api = twoConsumers();
    await waitFor(() => expect(api.store?.ready).toBe(true));

    act(() => {
      api.store!.startSession(
        startFocusSession({
          dayId: "2026-08-19",
          target: { kind: "priority", dayId: "2026-08-19", rank: 1, title: "Ship it" },
          intention: "Ship it",
          plannedMs: FOCUS_BLOCK_MS,
          now: new Date(),
          timeZone: "UTC",
        }),
      );
    });
    engine.playing = true;

    act(() => api.a!.endBlock());

    // The instance that did not run the side effect must not conclude there
    // was never any sound: that would silently hide the question.
    expect(api.a!.endedWithSound).toBe(true);
    expect(api.b!.endedWithSound).toBe(true);
  });

  it("chimes once, not once per mounted control", async () => {
    const api = twoConsumers();
    await waitFor(() => expect(api.store?.ready).toBe(true));

    act(() => api.store!.setSound({ endChime: true }));
    act(() => {
      api.store!.startSession(
        startFocusSession({
          dayId: "2026-08-19",
          target: null,
          intention: "",
          plannedMs: FOCUS_BLOCK_MS,
          now: new Date(),
          timeZone: "UTC",
        }),
      );
    });

    act(() => api.a!.endBlock());

    expect(engine.chimes).toBe(1);
  });
});
