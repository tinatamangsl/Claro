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
import { dayMarks, summariseDay, summariseQuarter } from "./calendar";
import { editPeriod, estimateNext } from "./cycle";
import {
  carryItem,
  closeDay,
  completeItem,
  letGoItem,
  openItems,
  writeReview,
} from "./day-close";
import { resolveGoal } from "./goals";
import { clearPriority, reorderPriorities } from "./priorities";
import { reopenPlan, settlePlan, startPlan } from "./quarter-plan";
import { queueCarried } from "./rollover";
import { resolveScheduleItem, toggleScheduleItem } from "./schedule";

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

describe("nothing is carried automatically", () => {
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

  it("leaves yesterday's unfinished work exactly where the user left it", async () => {
    saveNow(unfinishedYesterday());
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    // Carrying is a decision made in "Close my day", never something the app
    // does on the user's behalf while they were not looking.
    expect(api.current!.state.days[yesterdayId()].priority1.carriedTo).toBeNull();
    expect(api.current!.day(formatDayId(new Date())).priority1.text).toBe("");
  });

  it("writes nothing to disk merely by being opened", async () => {
    saveNow(emptyState());
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

describe("schedule completion survives a refresh", () => {
  const dayId = "2026-08-19";

  const seed = (api: ReturnType<typeof harness>) =>
    act(() => {
      api.current!.updateDay(dayId, (d) => ({
        ...d,
        priority1: { ...d.priority1, id: "p1", text: "Ship the store" },
        actions: [
          { id: "a1", text: "Draft the note", bucket: "task", done: false, createdAt: "x" },
        ],
        scheduleItems: [
          { id: "s1", time: "09:00", text: "Ship the store", link: { kind: "priority", priorityId: "p1" }, done: false },
          { id: "s2", time: "11:00", text: "Draft the note", link: { kind: "action", actionId: "a1" }, done: false },
          { id: "s3", time: "13:00", text: "Lunch away from the desk", link: null, done: false },
        ],
      }));
    });

  it("writes a linked completion to the original, and reads it back after a reload", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    seed(api);

    act(() => api.current!.updateDay(dayId, (d) => toggleScheduleItem(d, "s1")));
    await flush();

    const stored = loadState().days[dayId];
    // The completion lives on the priority, and nowhere else.
    expect(stored.priority1.done).toBe(true);
    expect(stored.scheduleItems[0].done).toBe(false);
    expect(resolveScheduleItem(stored.scheduleItems[0], stored, {}, {}).done).toBe(true);
  });

  it("keeps a standalone block's own completion across a reload", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    seed(api);

    act(() => api.current!.updateDay(dayId, (d) => toggleScheduleItem(d, "s3")));
    await flush();

    const stored = loadState().days[dayId];
    expect(stored.scheduleItems[2].done).toBe(true);
    // A standalone block touches nothing else.
    expect(stored.priority1.done).toBe(false);
    expect(stored.actions[0].done).toBe(false);
  });

  it("shows a completion made in Today on the schedule, without a second write", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    seed(api);

    // Completed the ordinary way, from the priorities block.
    act(() =>
      api.current!.updateDay(dayId, (d) => ({
        ...d,
        priority1: { ...d.priority1, done: true },
      })),
    );
    await flush();

    const stored = loadState().days[dayId];
    expect(resolveScheduleItem(stored.scheduleItems[0], stored, {}, {}).done).toBe(true);
  });

  it("shows a habit ticked on Today as complete on its scheduled hour", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => {
      api.current!.addHabit({
        id: "h1",
        name: "Ten pages",
        createdAt: "2026-08-01T09:00:00.000Z",
        archivedAt: null,
      });
      api.current!.updateDay(dayId, (d) => ({
        ...d,
        scheduleItems: [
          { id: "s1", time: "07:00", text: "Ten pages", link: { kind: "habit", habitId: "h1" }, done: false },
        ],
      }));
    });
    act(() => api.current!.toggleHabitDone("h1", dayId, new Date()));
    await flush();

    const state = loadState();
    const stored = state.days[dayId];
    expect(
      resolveScheduleItem(stored.scheduleItems[0], stored, state.habits, state.habitCompletions).done,
    ).toBe(true);
  });

  it("leaves the row readable and safe once the linked action is deleted", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    seed(api);

    act(() => api.current!.updateDay(dayId, (d) => ({ ...d, actions: [] })));
    await flush();

    const stored = loadState().days[dayId];
    const row = resolveScheduleItem(stored.scheduleItems[1], stored, {}, {});
    expect(row.available).toBe(false);
    expect(row.title).toBe("Draft the note");
    // The hour is kept, and nothing was recreated.
    expect(stored.scheduleItems).toHaveLength(3);
    expect(stored.actions).toEqual([]);
  });
});

describe("priority order survives a refresh", () => {
  const dayId = "2026-08-19";

  const seedThree = (api: ReturnType<typeof harness>) =>
    act(() => {
      api.current!.updateDay(dayId, (d) => ({
        ...d,
        priority1: { ...d.priority1, id: "a", text: "Cloud Cycle session", done: true, goal: { category: "workMain" } },
        priority2: { ...d.priority2, id: "b", text: "Read ten pages", goal: { category: "lifeMain" } },
        priority3: { ...d.priority3, id: "c", text: "Plan Claro" },
      }));
    });

  it("keeps the new order, and every record intact, after a reload", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    seedThree(api);

    act(() =>
      api.current!.updateDay(dayId, (d) => reorderPriorities(d, ["c", "a", "b"])),
    );
    await flush();

    const stored = loadState().days[dayId];
    expect([stored.priority1.id, stored.priority2.id, stored.priority3.id]).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(stored.priority1.text).toBe("Plan Claro");
    // The completion and the goal travelled with the priority, not the slot.
    expect(stored.priority2.text).toBe("Cloud Cycle session");
    expect(stored.priority2.done).toBe(true);
    expect(stored.priority2.goal).toEqual({ category: "workMain" });
    expect(stored.priority3.goal).toEqual({ category: "lifeMain" });
  });

  it("keeps a scheduled reference pointing at the same work after a reorder", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    seedThree(api);

    act(() =>
      api.current!.updateDay(dayId, (d) => ({
        ...d,
        scheduleItems: [
          { id: "s1", time: "09:00", text: "Read ten pages", link: { kind: "priority", priorityId: "b" }, done: false },
        ],
      })),
    );
    act(() => api.current!.updateDay(dayId, (d) => reorderPriorities(d, ["c", "a", "b"])));
    await flush();

    const stored = loadState().days[dayId];
    const row = resolveScheduleItem(stored.scheduleItems[0], stored, {}, {});
    expect(row.title).toBe("Read ten pages");
    expect(row.available).toBe(true);
  });

  it("clears one slot without disturbing the other two", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    seedThree(api);

    act(() => api.current!.updateDay(dayId, (d) => clearPriority(d, { id: "b" })));
    await flush();

    const stored = loadState().days[dayId];
    expect(stored.priority2.text).toBe("");
    expect(stored.priority2.id).toBeNull();
    expect(stored.priority1.text).toBe("Cloud Cycle session");
    expect(stored.priority1.done).toBe(true);
    expect(stored.priority3.text).toBe("Plan Claro");
  });
});

describe("quarterly planning writes into the canonical quarter", () => {
  const quarterId = "2026-Q3";

  it("adds planning fields to a quarter saved before they existed", async () => {
    // A quarter as an earlier build wrote it, with no planning fields at all.
    saveNow({
      ...emptyState(),
      quarters: {
        [quarterId]: {
          id: quarterId,
          work: { mainQuest: "Take Claro to real users", sideQuests: [] },
          life: { mainQuest: "", sideQuests: [] },
        } as never,
      },
    });

    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    const read = api.current!.quarter(quarterId);
    expect(read.work.mainQuest).toBe("Take Claro to real users");
    expect(read.work.mainQuestWhy).toBe("");
    expect(read.work.mainQuestEnough).toBe("");
    expect(read.plan).toBeNull();
  });

  it("saves a plan and its quests into one record, with no duplicate goal", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => api.current!.updateQuarter(quarterId, (q) => startPlan(q, new Date())));
    act(() =>
      api.current!.updateQuarter(quarterId, (q) => ({
        ...q,
        plan: { ...q.plan!, reflection: { ...q.plan!.reflection, proudOf: "Shipped the beta" } },
        work: { ...q.work, mainQuest: "Take Claro to real users", mainQuestWhy: "It is the one thing" },
      })),
    );
    await flush();

    const stored = loadState().quarters[quarterId];
    expect(stored.work.mainQuest).toBe("Take Claro to real users");
    expect(stored.work.mainQuestWhy).toBe("It is the one thing");
    expect(stored.plan?.reflection.proudOf).toBe("Shipped the beta");
    // One quarter record, not a plan record beside it.
    expect(Object.keys(loadState().quarters)).toEqual([quarterId]);
  });

  it("survives a reload, reflections and quests together", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => api.current!.updateQuarter(quarterId, (q) => startPlan(q, new Date())));
    act(() =>
      api.current!.updateQuarter(quarterId, (q) => ({
        ...q,
        plan: { ...q.plan!, direction: { ...q.plan!.direction, mattersMost: "Fewer things" } },
        life: { ...q.life, mainQuest: "Get properly strong again" },
      })),
    );
    act(() => api.current!.updateQuarter(quarterId, (q) => settlePlan(q, new Date())));
    await flush();

    const reloaded = loadState().quarters[quarterId];
    expect(reloaded.plan?.direction.mattersMost).toBe("Fewer things");
    expect(reloaded.life.mainQuest).toBe("Get properly strong again");
    expect(reloaded.plan?.completedAt).not.toBeNull();
  });

  it("makes the planned quest immediately linkable from Today", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() =>
      api.current!.updateQuarter(quarterId, (q) => ({
        ...q,
        work: { ...q.work, mainQuest: "Take Claro to real users" },
      })),
    );

    // Today resolves a goal link through the same quarter record.
    const linked = resolveGoal({ category: "workMain" }, api.current!.quarter(quarterId));
    expect(linked?.title).toBe("Take Claro to real users");
  });

  it("counts a planned goal in the calendar's quarter review", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() =>
      api.current!.updateQuarter(quarterId, (q) => ({
        ...q,
        work: { ...q.work, mainQuest: "Take Claro to real users" },
      })),
    );
    act(() =>
      api.current!.updateDay("2026-08-03", (d) => ({
        ...d,
        priority1: { ...d.priority1, id: "p1", text: "Ship it", done: true, goal: { category: "workMain" } },
      })),
    );

    const goals = summariseQuarter(api.current!.state, quarterId, []).goals;
    expect(goals).toEqual([
      { key: "workMain", category: "workMain", title: "Take Claro to real users", linked: 1, done: 1 },
    ]);
  });

  it("does not duplicate side quests when the plan is reopened and settled again", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => api.current!.updateQuarter(quarterId, (q) => startPlan(q, new Date())));
    act(() =>
      api.current!.updateQuarter(quarterId, (q) => ({
        ...q,
        work: { ...q.work, sideQuests: [{ id: "s1", text: "Write the launch note", done: false }] },
      })),
    );
    act(() => api.current!.updateQuarter(quarterId, (q) => settlePlan(q, new Date())));
    act(() => api.current!.updateQuarter(quarterId, reopenPlan));
    act(() => api.current!.updateQuarter(quarterId, (q) => settlePlan(q, new Date())));
    await flush();

    expect(loadState().quarters[quarterId].work.sideQuests).toHaveLength(1);
  });
});

describe("monthly plans and daily reflections persist", () => {
  it("materialises a month plan only when something is written", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    // Reading a month that has never been planned stores nothing.
    expect(api.current!.monthPlan("2026-08").intention).toBe("");
    expect(api.current!.state.monthPlans).toEqual({});

    act(() =>
      api.current!.updateMonthPlan("2026-08", (p) => ({ ...p, intention: "Fewer, deeper things" })),
    );
    await flush();

    expect(loadState().monthPlans["2026-08"].intention).toBe("Fewer, deeper things");
  });

  it("keeps a month plan under one record across edits", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => api.current!.updateMonthPlan("2026-08", (p) => ({ ...p, intention: "Ship it" })));
    act(() =>
      api.current!.updateMonthPlan("2026-08", (p) => ({ ...p, reflection: "Went better than I feared" })),
    );
    await flush();

    const stored = loadState().monthPlans;
    expect(Object.keys(stored)).toEqual(["2026-08"]);
    expect(stored["2026-08"].intention).toBe("Ship it");
    expect(stored["2026-08"].reflection).toBe("Went better than I feared");
  });

  it("keeps a daily reflection by date, and shows it on the calendar", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() =>
      api.current!.updateDay("2026-08-19", (day) =>
        writeReview(day, { proudOf: "Stopped at a sensible hour", mood: "good" }, new Date()),
      ),
    );
    await flush();

    const state = loadState();
    expect(state.days["2026-08-19"].review?.proudOf).toBe("Stopped at a sensible hour");
    expect(dayMarks(state, summariseDay(state, "2026-08-19", [])).reflectionCaptured).toBe(true);
    // A different day is untouched.
    expect(dayMarks(state, summariseDay(state, "2026-08-18", [])).reflectionCaptured).toBe(false);
  });

  it("moves a carried item into the chosen day's review queue, and nowhere else", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() =>
      api.current!.updateDay("2026-08-19", (day) => ({
        ...day,
        priority1: { ...day.priority1, id: "p1", text: "Ship the store" },
      })),
    );

    let carried: ReturnType<typeof carryItem>["carried"] = null;
    act(() =>
      api.current!.updateDay("2026-08-19", (day) => {
        const item = openItems(day)[0];
        const result = carryItem(day, item, "2026-08-20");
        carried = result.carried;
        return result.day;
      }),
    );
    act(() => api.current!.updateDay("2026-08-20", (day) => queueCarried(day, carried!)));
    await flush();

    const state = loadState();
    // The source keeps its record, marked so the rollover will not act again.
    expect(state.days["2026-08-19"].priority1.text).toBe("Ship the store");
    expect(state.days["2026-08-19"].priority1.carriedTo).toBe("2026-08-20");
    // The destination receives it for review, not forced into a slot.
    expect(state.days["2026-08-20"].carriedForward.map((i) => i.text)).toEqual(["Ship the store"]);
    expect(state.days["2026-08-20"].priority1.text).toBe("");
  });
});

describe("closing a day never leaves work active twice", () => {
  const D = "2026-08-19";
  const T = "2026-08-20";

  const seed = (api: ReturnType<typeof harness>) =>
    act(() => {
      api.current!.updateDay(D, (d) => ({
        ...d,
        priority1: { ...d.priority1, id: "p1", text: "Ship the store" },
        actions: [
          { id: "a1", text: "Email the accountant", bucket: "task", done: false, createdAt: "x" },
        ],
        scheduleItems: [
          { id: "s1", time: "13:00", text: "Lunch away from the desk", link: null, done: false },
        ],
      }));
    });

  const carry = (api: ReturnType<typeof harness>, index: number, to: string) => {
    let carried: ReturnType<typeof carryItem>["carried"] = null;
    act(() =>
      api.current!.updateDay(D, (day) => {
        const result = carryItem(day, openItems(day)[index], to);
        carried = result.carried;
        return result.day;
      }),
    );
    if (carried) act(() => api.current!.updateDay(to, (day) => queueCarried(day, carried!)));
  };

  it("moves a priority to exactly one active place", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    seed(api);

    carry(api, 0, T);
    await flush();

    const state = loadState();
    // Closed on the source, so it is no longer open work there.
    expect(openItems(state.days[D]).some((i) => i.id === "p1")).toBe(false);
    expect(state.days[D].priority1.carriedTo).toBe(T);
    // And present exactly once on the destination.
    expect(state.days[T].carriedForward.map((i) => i.text)).toEqual(["Ship the store"]);
  });

  it("cannot queue the same work twice, however often it is asked", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    seed(api);

    const carryById = (id: string) => {
      let carried: ReturnType<typeof carryItem>["carried"] = null;
      act(() =>
        api.current!.updateDay(D, (day) => {
          const item = openItems(day).find((i) => i.id === id);
          if (!item) return day;
          const result = carryItem(day, item, T);
          carried = result.carried;
          return result.day;
        }),
      );
      if (carried) act(() => api.current!.updateDay(T, (day) => queueCarried(day, carried!)));
    };

    carryById("p1");
    // The second attempt finds it closed, so there is nothing left to carry.
    carryById("p1");
    await flush();

    expect(loadState().days[T].carriedForward).toHaveLength(1);
    expect(loadState().days[T].carriedForward[0].id).toBe("p1");
  });

  it("schedules a standalone block onto a chosen later date", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    seed(api);

    carry(api, 2, "2026-08-25");
    await flush();

    const state = loadState();
    expect(state.days[D].scheduleItems[0].carriedTo).toBe("2026-08-25");
    expect(state.days["2026-08-25"].carriedForward.map((i) => i.text)).toEqual([
      "Lunch away from the desk",
    ]);
    expect(openItems(state.days[D]).some((i) => i.kind === "schedule")).toBe(false);
  });

  it("keeps every decision across a reload", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    seed(api);

    carry(api, 0, T);
    act(() =>
      api.current!.updateDay(D, (day) => completeItem(day, openItems(day)[0])),
    );
    act(() => api.current!.updateDay(D, (day) => letGoItem(day, openItems(day)[0], new Date())));
    act(() => api.current!.updateDay(D, (day) => closeDay(day, new Date())));
    await flush();

    const state = loadState();
    expect(state.days[D].priority1.carriedTo).toBe(T);
    expect(state.days[D].actions[0].done).toBe(true);
    expect(state.days[D].scheduleItems[0].carriedTo).not.toBeNull();
    expect(state.days[D].closedAt).not.toBeNull();
    // Nothing is left open once every decision has been made.
    expect(openItems(state.days[D])).toEqual([]);
  });

  it("leaves the linked schedule row reading its source correctly", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    seed(api);

    act(() =>
      api.current!.updateDay(D, (d) => ({
        ...d,
        scheduleItems: [
          ...d.scheduleItems,
          { id: "s2", time: "09:00", text: "Ship the store", link: { kind: "priority", priorityId: "p1" }, done: false },
        ],
      })),
    );
    act(() => api.current!.updateDay(D, (day) => completeItem(day, openItems(day)[0])));
    await flush();

    const stored = loadState().days[D];
    const linked = stored.scheduleItems.find((s) => s.id === "s2")!;
    expect(resolveScheduleItem(linked, stored, {}, {}).done).toBe(true);
  });
});

describe("cycle notes are private, opt-in, and fully deletable", () => {
  it("collects and shows nothing until the user opts in", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    expect(api.current!.cycle.settings.enabled).toBe(false);
    expect(api.current!.cycle.settings.optedInAt).toBeNull();
    expect(api.current!.cycle.entries).toEqual({});
    expect(api.current!.cycle.checkIns).toEqual({});
  });

  it("records when consent was given, once", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => api.current!.setCycleEnabled(true, new Date("2026-08-19T09:00:00.000Z")));
    const first = api.current!.cycle.settings.optedInAt;
    expect(first).toBe("2026-08-19T09:00:00.000Z");

    // Turning it off and on again does not rewrite when consent was first given.
    act(() => api.current!.setCycleEnabled(false, new Date()));
    act(() => api.current!.setCycleEnabled(true, new Date("2026-09-01T09:00:00.000Z")));
    expect(api.current!.cycle.settings.optedInAt).toBe(first);
  });

  it("keeps logged dates and private notes across a reload", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => api.current!.setCycleEnabled(true, new Date()));
    act(() =>
      api.current!.logCycleStart({ id: "e1", startDate: "2026-08-01", endDate: null, loggedAt: "x" }),
    );
    act(() => api.current!.writeCycleCheckIn("2026-08-19", { energy: 4 }, new Date()));
    await flush();

    const stored = loadState().cycle;
    expect(stored.entries.e1.startDate).toBe("2026-08-01");
    expect(stored.checkIns["2026-08-19"].energy).toBe(4);
  });

  it("shows no estimate until there is enough of the user's own history", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => api.current!.setCycleEnabled(true, new Date()));
    for (const [i, startDate] of ["2026-01-01", "2026-01-29"].entries()) {
      act(() => api.current!.logCycleStart({ id: `e${i}`, startDate, endDate: null, loggedAt: "x" }));
    }
    expect(estimateNext(api.current!.cycle)).toBeNull();

    act(() => api.current!.logCycleStart({ id: "e2", startDate: "2026-02-26", endDate: null, loggedAt: "x" }));
    expect(estimateNext(api.current!.cycle)).toMatchObject({ typicalGap: 28, basedOn: 2 });
  });

  it("deletes every logged date, every note and the consent itself", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => api.current!.setCycleEnabled(true, new Date()));
    act(() => api.current!.logCycleStart({ id: "e1", startDate: "2026-08-01", endDate: null, loggedAt: "x" }));
    act(() => api.current!.writeCycleCheckIn("2026-08-19", { mood: "good" }, new Date()));

    act(() => api.current!.deleteAllCycleData());
    await flush();

    const stored = loadState().cycle;
    expect(stored.entries).toEqual({});
    expect(stored.checkIns).toEqual({});
    expect(stored.settings).toEqual({ enabled: false, optedInAt: null });
  });

  it("leaves the day's own reflection untouched when cycle data is deleted", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() =>
      api.current!.updateDay("2026-08-19", (day) =>
        writeReview(day, { proudOf: "Stopped at a sensible hour" }, new Date()),
      ),
    );
    act(() => api.current!.setCycleEnabled(true, new Date()));
    act(() => api.current!.writeCycleCheckIn("2026-08-19", { energy: 2 }, new Date()));

    act(() => api.current!.deleteAllCycleData());
    await flush();

    // Cycle data and planning data are separate records, so one cannot take
    // the other with it.
    expect(loadState().days["2026-08-19"].review?.proudOf).toBe("Stopped at a sensible hour");
    expect(loadState().cycle.checkIns).toEqual({});
  });

  it("never changes a plan because of a note", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() =>
      api.current!.updateDay("2026-08-19", (day) => ({
        ...day,
        priority1: { ...day.priority1, id: "p1", text: "Ship the store" },
      })),
    );
    const before = api.current!.day("2026-08-19");

    act(() => api.current!.setCycleEnabled(true, new Date()));
    act(() => api.current!.writeCycleCheckIn("2026-08-19", { energy: 1, stress: 5 }, new Date()));

    expect(api.current!.day("2026-08-19")).toEqual(before);
    expect(api.current!.sound.soundscape).toBe("brown");
  });
});

describe("cycle edits recalculate, and deletion stays isolated", () => {
  const TODAY = "2026-08-19";

  const seedStarts = (api: ReturnType<typeof harness>) =>
    act(() => {
      api.current!.setCycleEnabled(true, new Date());
      api.current!.setCycleEntries({
        // One completed range and two starts, so deletion is proved against both.
        e0: { id: "e0", startDate: "2026-06-01", endDate: "2026-06-04", loggedAt: "x" },
        e1: { id: "e1", startDate: "2026-06-29", endDate: null, loggedAt: "x" },
        e2: { id: "e2", startDate: "2026-07-27", endDate: null, loggedAt: "x" },
      });
    });

  it("recalculates the estimate the moment an entry is edited", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    seedStarts(api);

    expect(estimateNext(api.current!.cycle)?.typicalGap).toBe(28);

    act(() => {
      const result = editPeriod(
        api.current!.cycle,
        "e2",
        { startDate: "2026-08-03", endDate: null },
        TODAY,
      );
      if (result.ok) api.current!.setCycleEntries(result.entries);
    });

    expect(estimateNext(api.current!.cycle)?.typicalGap).toBe(32);
  });

  it("recalculates when an entry is deleted", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    seedStarts(api);

    act(() => api.current!.deleteCycleEntry("e2"));

    // Two entries leave one gap, below the threshold to estimate at all.
    expect(estimateNext(api.current!.cycle)).toBeNull();
  });

  it("keeps edits across a reload", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    seedStarts(api);

    act(() => {
      const result = editPeriod(
        api.current!.cycle,
        "e0",
        { startDate: "2026-06-02", endDate: null },
        TODAY,
      );
      if (result.ok) api.current!.setCycleEntries(result.entries);
    });
    await flush();

    expect(loadState().cycle.entries.e0.startDate).toBe("2026-06-02");
  });

  it("deleting all cycle data leaves every other surface untouched", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    // Something on each surface that must survive.
    act(() => {
      api.current!.updateDay(TODAY, (day) => ({
        ...day,
        priority1: { ...day.priority1, id: "p1", text: "Ship the store", done: true },
        notes: "A day worth keeping",
      }));
      api.current!.updateWeek("2026-W34", (w) => ({
        ...w,
        work: { ...w.work, goal: "Launch the beta" },
      }));
      api.current!.updateQuarter("2026-Q3", (q) => ({
        ...q,
        work: { ...q.work, mainQuest: "Take Claro to real users" },
      }));
      api.current!.addHabit({
        id: "h1",
        name: "Ten pages",
        createdAt: "2026-01-01T09:00:00.000Z",
        archivedAt: null,
      });
      api.current!.toggleHabitDone("h1", TODAY, new Date());
      api.current!.updateMonthPlan("2026-08", (p) => ({ ...p, intention: "Fewer things" }));
    });

    seedStarts(api);
    act(() => api.current!.writeCycleCheckIn(TODAY, { energy: 2, note: "A private note" }, new Date()));

    act(() => api.current!.deleteAllCycleData());
    await flush();

    const state = loadState();
    // Every trace of cycle data is gone.
    expect(state.cycle).toEqual({
      settings: { enabled: false, optedInAt: null },
      entries: {},
      checkIns: {},
      lastSeen: null,
    });
    // And nothing else moved.
    expect(state.days[TODAY].priority1.text).toBe("Ship the store");
    expect(state.days[TODAY].priority1.done).toBe(true);
    expect(state.days[TODAY].notes).toBe("A day worth keeping");
    expect(state.weeks["2026-W34"].work.goal).toBe("Launch the beta");
    expect(state.quarters["2026-Q3"].work.mainQuest).toBe("Take Claro to real users");
    expect(state.habits.h1.name).toBe("Ten pages");
    expect(Object.keys(state.habitCompletions)).toHaveLength(1);
    expect(state.monthPlans["2026-08"].intention).toBe("Fewer things");
  });

  it("keeps the free-text note private and unread", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => api.current!.setCycleEnabled(true, new Date()));
    act(() => api.current!.writeCycleCheckIn(TODAY, { note: "Slept badly" }, new Date()));
    await flush();

    expect(loadState().cycle.checkIns[TODAY].note).toBe("Slept badly");
    // It lives in the cycle branch, never on the day.
    expect(loadState().days[TODAY]?.notes ?? "").toBe("");
  });
});
