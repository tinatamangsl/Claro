import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ClaroProvider, useClaro } from "./claro-store";
import { STORAGE_KEY, blankDay, emptyState, loadState, saveNow } from "./storage";
import { formatDayId } from "./dates";
import { FOCUS_BLOCK_MS, MAX_SIDE_QUESTS, type SoundPreset } from "./types";
import {
  closeSession,
  createInterruption,
  markDistracted,
  startFocusSession,
} from "./focus-session";
import { addCapped } from "./mutations";

beforeEach(() => {
  localStorage.clear();
});

/** Grabs the live context value so tests can drive it directly. */
function harness() {
  const api: { current: ReturnType<typeof useClaro> | null } = { current: null };

  function Probe() {
    api.current = useClaro();
    return <div data-testid="ready">{String(api.current.ready)}</div>;
  }

  render(
    <ClaroProvider>
      <Probe />
    </ClaroProvider>,
  );

  return api;
}

const flush = async () => {
  // Let the debounced save (300ms) fire.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 400));
  });
};

describe("hydration contract", () => {
  it("becomes ready only after mount, never during the first render", async () => {
    const seen: boolean[] = [];

    function Probe() {
      const { ready } = useClaro();
      seen.push(ready);
      return null;
    }

    render(
      <ClaroProvider>
        <Probe />
      </ClaroProvider>,
    );

    // The first render must match what the server produced: not ready.
    expect(seen[0]).toBe(false);
    await waitFor(() => expect(seen.at(-1)).toBe(true));
  });

  it("exposes an empty store and no date before hydration", () => {
    const seenToday: string[] = [];

    function Probe() {
      const { today, state } = useClaro();
      seenToday.push(today);
      if (seenToday.length === 1) {
        // Computing a date during the first render would disagree with SSR.
        expect(today).toBe("");
        expect(state).toEqual(emptyState());
      }
      return null;
    }

    render(
      <ClaroProvider>
        <Probe />
      </ClaroProvider>,
    );
  });

  it("reads today's date once hydrated", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    expect(api.current?.today).toBe(formatDayId(new Date()));
  });

  it("loads previously saved data on mount", async () => {
    const saved = emptyState();
    saved.days["2026-08-15"] = { ...blankDay("2026-08-15"), notes: "from disk" };
    saveNow(saved);

    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    expect(api.current?.day("2026-08-15").notes).toBe("from disk");
  });

  it("still becomes ready when stored data is corrupt", async () => {
    localStorage.setItem(STORAGE_KEY, "{{{ not json");
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    expect(api.current?.state).toEqual(emptyState());
    expect(screen.getByTestId("ready").textContent).toBe("true");
  });
});

describe("lazy record creation", () => {
  it("returns blanks for periods that were never edited", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    expect(api.current?.quarter("2030-Q1").work.mainQuest).toBe("");
    expect(api.current?.week("2030-W05").life.goal).toBe("");
    expect(api.current?.day("2030-01-02").notes).toBe("");
  });

  it("does not persist a record merely because it was read", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => {
      api.current?.quarter("2030-Q1");
      api.current?.week("2030-W05");
      api.current?.day("2030-01-02");
    });
    await flush();

    // Browsing forward through empty periods must not fill storage.
    expect(Object.keys(api.current!.state.quarters)).toHaveLength(0);
    expect(Object.keys(api.current!.state.weeks)).toHaveLength(0);
    expect(Object.keys(api.current!.state.days)).toHaveLength(0);
  });

  it("materialises a record on first write", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => {
      api.current?.updateDay("2026-08-15", (d) => ({ ...d, notes: "now it exists" }));
    });

    expect(Object.keys(api.current!.state.days)).toEqual(["2026-08-15"]);
  });
});

describe("updates", () => {
  it("updates quarter, week and day independently", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => {
      api.current?.updateQuarter("2026-Q3", (q) => ({
        ...q,
        work: { ...q.work, mainQuest: "Ship Claro" },
      }));
      api.current?.updateWeek("2026-W33", (w) => ({
        ...w,
        life: { ...w.life, goal: "Three runs" },
      }));
      api.current?.updateDay("2026-08-15", (d) => ({ ...d, mood: 4 }));
    });

    expect(api.current?.quarter("2026-Q3").work.mainQuest).toBe("Ship Claro");
    expect(api.current?.week("2026-W33").life.goal).toBe("Three runs");
    expect(api.current?.day("2026-08-15").mood).toBe(4);
  });

  it("leaves sibling periods untouched", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => {
      api.current?.updateDay("2026-08-15", (d) => ({ ...d, notes: "monday" }));
    });
    act(() => {
      api.current?.updateDay("2026-08-16", (d) => ({ ...d, notes: "tuesday" }));
    });

    expect(api.current?.day("2026-08-15").notes).toBe("monday");
    expect(api.current?.day("2026-08-16").notes).toBe("tuesday");
  });

  it("enforces the side-quest cap through the store", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    for (let i = 0; i < 5; i++) {
      act(() => {
        api.current?.updateQuarter("2026-Q3", (q) => ({
          ...q,
          work: {
            ...q.work,
            sideQuests: addCapped(
              q.work.sideQuests,
              { id: `sq${i}`, text: `Side quest ${i}`, done: false },
              MAX_SIDE_QUESTS,
            ),
          },
        }));
      });
    }

    expect(api.current?.quarter("2026-Q3").work.sideQuests).toHaveLength(MAX_SIDE_QUESTS);
  });

  it("moves an action between buckets without duplicating it", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => {
      api.current?.updateDay("2026-08-15", (d) => ({
        ...d,
        actions: [
          { id: "a1", text: "Book dentist", bucket: "quickTick", done: false, createdAt: "" },
        ],
      }));
    });
    act(() => {
      api.current?.updateDay("2026-08-15", (d) => ({
        ...d,
        actions: d.actions.map((a) => (a.id === "a1" ? { ...a, bucket: "project" } : a)),
      }));
    });

    const actions = api.current!.day("2026-08-15").actions;
    expect(actions).toHaveLength(1);
    expect(actions[0].bucket).toBe("project");
  });
});

describe("persistence", () => {
  it("writes changes to localStorage after the debounce", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => {
      api.current?.updateDay("2026-08-15", (d) => ({ ...d, notes: "persist me" }));
    });
    await flush();

    expect(loadState().days["2026-08-15"].notes).toBe("persist me");
  });

  it("does not rewrite storage just for loading", async () => {
    const spy = vi.spyOn(Storage.prototype, "setItem");
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    await flush();

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("reports a save failure through saveStatus", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    act(() => {
      api.current?.updateDay("2026-08-15", (d) => ({ ...d, notes: "too big" }));
    });
    await flush();

    expect(api.current?.saveStatus).toBe("error");
    spy.mockRestore();
  });

  it("resetAll clears both memory and storage", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => {
      api.current?.updateDay("2026-08-15", (d) => ({ ...d, notes: "goodbye" }));
    });
    await flush();

    act(() => api.current?.resetAll());

    expect(api.current?.state).toEqual(emptyState());
    expect(loadState()).toEqual(emptyState());
  });
});

describe("useClaro guard", () => {
  it("throws when used outside the provider", () => {
    function Orphan() {
      useClaro();
      return null;
    }
    // React logs the error boundary trace; silence it for a clean run.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow(/ClaroProvider/);
    spy.mockRestore();
  });
});

describe("the one canonical focus session", () => {
  const T0 = new Date("2026-08-18T09:00:00.000Z");

  const newSession = () =>
    startFocusSession({
      dayId: "2026-08-18",
      target: { kind: "priority", dayId: "2026-08-18", rank: 1, title: "Ship the store" },
      intention: "Ship the store",
      plannedMs: FOCUS_BLOCK_MS,
      now: T0,
      timeZone: "Europe/London",
    });

  /** A provider we can unmount, so a remount is a genuine page refresh. */
  function mountProvider() {
    const api: { current: ReturnType<typeof useClaro> | null } = { current: null };

    function Probe() {
      api.current = useClaro();
      return null;
    }

    const { unmount } = render(
      <ClaroProvider>
        <Probe />
      </ClaroProvider>,
    );

    return { api, unmount };
  }

  const ready = async (api: { current: ReturnType<typeof useClaro> | null }) =>
    waitFor(() => expect(api.current?.ready).toBe(true));

  it("has no session until one is started", async () => {
    const { api } = mountProvider();
    await ready(api);

    expect(api.current?.activeSession).toBeNull();
  });

  it("exposes the session it was given", async () => {
    const { api } = mountProvider();
    await ready(api);
    const session = newSession();

    act(() => api.current?.startSession(session));

    expect(api.current?.activeSession?.id).toBe(session.id);
    expect(api.current?.activeSession?.intention).toBe("Ship the store");
  });

  it("survives a refresh with its timestamps intact", async () => {
    const first = mountProvider();
    await ready(first.api);
    const session = newSession();

    act(() => first.api.current?.startSession(session));
    await flush();
    first.unmount();

    // A fresh provider, reading the same disk — this is what a reload does.
    const second = mountProvider();
    await ready(second.api);

    const restored = second.api.current?.activeSession;
    expect(restored?.id).toBe(session.id);
    expect(restored?.startedAt).toBe(session.startedAt);
    expect(restored?.segmentStartedAt).toBe(session.segmentStartedAt);
    expect(restored?.plannedMs).toBe(FOCUS_BLOCK_MS);
  });

  it("applies a transition through the store", async () => {
    const { api } = mountProvider();
    await ready(api);

    act(() => api.current?.startSession(newSession()));
    act(() => api.current?.updateSession((s) => markDistracted(s, new Date(T0.getTime() + 60_000))));

    expect(api.current?.activeSession?.phase).toBe("interrupted");
    expect(api.current?.activeSession?.elapsedBeforeMs).toBe(60_000);
  });

  it("ignores a transition that changes nothing", async () => {
    const { api } = mountProvider();
    await ready(api);
    act(() => api.current?.startSession(newSession()));

    const before = api.current?.activeSession;
    act(() => api.current?.updateSession((s) => s));

    expect(api.current?.activeSession).toBe(before);
  });

  it("keeps the record but drops the pointer when the session is cleared", async () => {
    const { api } = mountProvider();
    await ready(api);
    const session = newSession();

    act(() => api.current?.startSession(session));
    act(() => api.current?.clearActiveSession());

    expect(api.current?.activeSession).toBeNull();
    expect(api.current?.state.focusSessions[session.id]).toBeDefined();
  });

  it("never holds two live sessions at once", async () => {
    const { api } = mountProvider();
    await ready(api);
    const first = newSession();
    const second = newSession();

    act(() => api.current?.startSession(first));
    act(() => api.current?.startSession(second));

    expect(api.current?.state.activeFocusSessionId).toBe(second.id);
    expect(Object.keys(api.current!.state.focusSessions)).toHaveLength(2);
  });
});

describe("the private interruption log", () => {
  const T0 = new Date("2026-08-18T09:00:00.000Z");

  const session = () =>
    startFocusSession({
      dayId: "2026-08-18",
      target: null,
      intention: "Ship the store",
      plannedMs: FOCUS_BLOCK_MS,
      now: T0,
      timeZone: "UTC",
    });

  it("records an interruption and keeps it across a refresh", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    const s = session();
    const interruption = createInterruption({ session: s, now: T0, timeZone: "UTC" });

    act(() => {
      api.current?.startSession(s);
      api.current?.logInterruption(interruption);
    });
    await flush();

    expect(loadState().interruptions[interruption.id].focusSessionId).toBe(s.id);
  });

  it("fills in the reason, the return block and the return afterwards", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    const s = session();
    const interruption = createInterruption({ session: s, now: T0, timeZone: "UTC" });

    act(() => {
      api.current?.startSession(s);
      api.current?.logInterruption(interruption);
    });
    act(() => api.current?.updateInterruption(interruption.id, { reason: "phone" }));
    act(() => api.current?.updateInterruption(interruption.id, { returnBlockStarted: true }));
    act(() =>
      api.current?.updateInterruption(interruption.id, {
        returnedAt: "2026-08-18T09:16:00.000Z",
      }),
    );

    const stored = api.current!.state.interruptions[interruption.id];
    expect(stored.reason).toBe("phone");
    expect(stored.returnBlockStarted).toBe(true);
    expect(stored.returnedAt).toBe("2026-08-18T09:16:00.000Z");
  });

  it("ignores a patch for an interruption that does not exist", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => api.current?.updateInterruption("nope", { reason: "fatigue" }));

    expect(api.current?.state.interruptions).toEqual({});
  });

  it("is wiped by resetAll along with everything else", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    const s = session();

    act(() => {
      api.current?.startSession(s);
      api.current?.logInterruption(createInterruption({ session: s, now: T0, timeZone: "UTC" }));
    });
    act(() => api.current?.resetAll());

    expect(api.current?.state).toEqual(emptyState());
    expect(api.current?.activeSession).toBeNull();
  });
});

describe("carry-forward at load", () => {
  /** Yesterday relative to the machine's real today, so the test never drifts. */
  const yesterdayId = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return formatDayId(d);
  };

  const unfinishedYesterday = () => {
    const id = yesterdayId();
    return {
      ...emptyState(),
      days: {
        [id]: {
          ...blankDay(id),
          priority1: {
            id: "p-1",
            text: "Ship the store",
            done: false,
            goal: null,
            createdAt: "2026-01-01T09:00:00.000Z",
            originDayId: id,
            carriedTo: null,
          },
        },
      },
    };
  };

  it("carries unfinished work forward the moment Claro is opened", async () => {
    saveNow(unfinishedYesterday());
    const api = harness();

    await waitFor(() => expect(api.current?.ready).toBe(true));

    const carriedInto = api.current!.state.days[yesterdayId()].priority1.carriedTo;
    expect(carriedInto).not.toBeNull();
    expect(api.current!.day(carriedInto!).priority1.text).toBe("Ship the store");
  });

  it("writes the carry to disk, so a decision about it cannot be undone by a reload", async () => {
    saveNow(unfinishedYesterday());
    harness();

    await waitFor(() => expect(screen.getByTestId("ready").textContent).toBe("true"));

    // Read straight off localStorage rather than from the live context: the
    // point of the test is that the change survives the tab being closed.
    expect(loadState().days[yesterdayId()].priority1.carriedTo).not.toBeNull();
  });

  it("writes nothing when there was nothing to carry", async () => {
    const untouched = emptyState();
    saveNow(untouched);
    const spy = vi.spyOn(Storage.prototype, "setItem");

    harness();
    await waitFor(() => expect(screen.getByTestId("ready").textContent).toBe("true"));

    expect(spy).not.toHaveBeenCalled();
  });
});

describe("one canonical focus session, whatever started it", () => {
  const start = (
    api: ReturnType<typeof harness>,
    target: Parameters<typeof startFocusSession>[0]["target"],
  ) =>
    act(() => {
      api.current!.startSession(
        startFocusSession({
          dayId: "2026-08-19",
          target,
          intention: target?.title ?? "",
          plannedMs: FOCUS_BLOCK_MS,
          now: new Date(),
          timeZone: "UTC",
        }),
      );
    });

  it("points at the block started from Quarter just as it does one from Today", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    start(api, { kind: "mainQuest", quarterId: "2026-Q3", domain: "work", title: "Ship Claro" });

    expect(api.current!.activeSession?.target).toEqual({
      kind: "mainQuest",
      quarterId: "2026-Q3",
      domain: "work",
      title: "Ship Claro",
    });
  });

  it("replaces the live session rather than running two clocks", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    start(api, { kind: "priority", dayId: "2026-08-19", rank: 1, title: "First" });
    const first = api.current!.activeSession!.id;

    start(api, { kind: "weekGoal", weekId: "2026-W34", domain: "life", title: "Second" });
    const second = api.current!.activeSession!.id;

    expect(second).not.toBe(first);
    // Exactly one pointer exists, so there is nowhere for a second timer to live.
    expect(api.current!.state.activeFocusSessionId).toBe(second);
    // The earlier record is kept, not deleted.
    expect(api.current!.state.focusSessions[first]).toBeTruthy();
  });

  it("never marks the linked priority done when the session is resolved", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => {
      api.current!.updateDay("2026-08-19", (d) => ({
        ...d,
        priority1: { ...d.priority1, id: "p1", text: "Ship it" },
      }));
    });
    start(api, { kind: "priority", dayId: "2026-08-19", rank: 1, title: "Ship it" });

    act(() => {
      api.current!.updateSession((s) => closeSession(s, "completed", new Date()));
      api.current!.clearActiveSession();
    });

    // Completing a *block* is not completing the work: only the explicit
    // choice on the end screen may do that.
    expect(api.current!.day("2026-08-19").priority1.done).toBe(false);
    expect(api.current!.activeSession).toBeNull();
  });
});

describe("sound presets and feedback", () => {
  const preset = (patch: Partial<SoundPreset> = {}): SoundPreset => ({
    id: "p1",
    name: "Founder deep work",
    mode: "deep",
    soundscape: "brown",
    volume: 0.4,
    focusMinutes: 50,
    createdAt: "2026-08-19T09:00:00.000Z",
    ...patch,
  });

  it("keeps the sound preferences a user set", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => api.current!.setSound({ soundscape: "rain", volume: 0.7, endChime: true }));
    await flush();

    // Read off disk: the point is that it survives the tab closing.
    const stored = loadState().sound;
    expect(stored.soundscape).toBe("rain");
    expect(stored.volume).toBe(0.7);
    expect(stored.endChime).toBe(true);
  });

  it("has the chime off until it is explicitly turned on", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    expect(api.current!.sound.endChime).toBe(false);
  });

  it("saves a preset under a stable id", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => api.current!.addPreset(preset()));

    expect(api.current!.soundPresets.p1).toMatchObject({
      name: "Founder deep work",
      mode: "deep",
      soundscape: "brown",
      focusMinutes: 50,
    });
  });

  it("edits a preset without changing its identity", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => api.current!.addPreset(preset()));
    act(() => api.current!.patchPreset("p1", { name: "Admin reset", soundscape: "pink" }));

    expect(api.current!.soundPresets.p1.id).toBe("p1");
    expect(api.current!.soundPresets.p1.name).toBe("Admin reset");
    expect(api.current!.soundPresets.p1.soundscape).toBe("pink");
    // Untouched fields survive the patch.
    expect(api.current!.soundPresets.p1.focusMinutes).toBe(50);
  });

  it("ignores an edit to a preset that is not there", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => api.current!.patchPreset("gone", { name: "Nope" }));

    expect(api.current!.soundPresets).toEqual({});
  });

  it("deletes a preset and leaves the others alone", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => {
      api.current!.addPreset(preset());
      api.current!.addPreset(preset({ id: "p2", name: "Creative planning" }));
    });
    act(() => api.current!.deletePreset("p1"));

    expect(api.current!.soundPresets.p1).toBeUndefined();
    expect(api.current!.soundPresets.p2.name).toBe("Creative planning");
  });

  it("keeps presets across a reload", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => api.current!.addPreset(preset()));
    await flush();

    expect(loadState().soundPresets.p1.name).toBe("Founder deep work");
  });

  it("records a private answer to the post-session question", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() =>
      api.current!.recordSoundFeedback({
        id: "f1",
        focusSessionId: "s1",
        response: "helpful",
        soundscape: "rain",
        mode: "deep",
        at: "2026-08-19T10:00:00.000Z",
      }),
    );

    expect(api.current!.state.soundFeedback.f1).toMatchObject({
      focusSessionId: "s1",
      response: "helpful",
    });
  });

  it("records a skip as an answer in its own right", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() =>
      api.current!.recordSoundFeedback({
        id: "f2",
        focusSessionId: "s1",
        response: "skipped",
        soundscape: "pad",
        mode: null,
        at: "2026-08-19T10:00:00.000Z",
      }),
    );

    expect(api.current!.state.soundFeedback.f2.response).toBe("skipped");
  });
});
