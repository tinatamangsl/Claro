import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_FOCUS_PREFS } from "./focus-presets";
import { blankPlan } from "./quarter-plan";
import {
  STORAGE_KEY,
  blankDay,
  blankQuarter,
  blankWeek,
  clearState,
  emptyState,
  flushSave,
  loadState,
  migrate,
  readDay,
  readQuarter,
  readWeek,
  saveNow,
  scheduleSave,
  readActiveFocusSession,
} from "./storage";
import { CLARO_SCHEMA_VERSION, type ClaroState } from "./types";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  flushSave();
  vi.useRealTimers();
});

describe("blank records", () => {
  it("creates an empty store at the current schema version", () => {
    expect(emptyState()).toEqual({
      version: CLARO_SCHEMA_VERSION,
      quarters: {},
      weeks: {},
      days: {},
      focusSessions: {},
      activeFocusSessionId: null,
      interruptions: {},
      focusPrefs: DEFAULT_FOCUS_PREFS,
      habits: {},
      habitCompletions: {},
      cycle: {
        settings: { enabled: false, optedInAt: null, cycleLength: null, syncConsentAt: null },
        entries: {},
        checkIns: {},
        lastSeen: null,
  guidanceMatches: {},
  guideAnswers: {},
      },
      sound: {
        volume: 0.4,
        muted: false,
        soundscape: "brown",
        mode: null,
        endChime: false,
      },
      soundPresets: {},
      soundFeedback: {},
      monthPlans: {},
    });
  });

  it("creates a blank quarter with both domains and no side quests", () => {
    const q = blankQuarter("2026-Q3");
    expect(q.id).toBe("2026-Q3");
    expect(q.work.mainQuest).toBe("");
    expect(q.life.sideQuests).toEqual([]);
  });

  it("creates a blank week with both goals", () => {
    const w = blankWeek("2026-W33");
    expect(w.work.goal).toBe("");
    expect(w.life.actions).toEqual([]);
  });

  it("creates a blank day with wellbeing unset rather than zeroed", () => {
    const d = blankDay("2026-08-15");
    // null means "not recorded"; 0 would be a real reading.
    expect(d.sleepHours).toBeNull();
    expect(d.steps).toBeNull();
    expect(d.mood).toBeNull();
    expect(d.waterGlasses).toBe(0); // count, so 0 is meaningful
    expect(d.priority1).toEqual({
      id: null,
      text: "",
      done: false,
      goal: null,
      createdAt: null,
      originDayId: null,
      carriedTo: null,
    });
    expect(d.priority3.text).toBe("");
    expect(d.carriedForward).toEqual([]);
    expect(d.actions).toEqual([]);
  });
});

describe("migrate", () => {
  it("returns an empty store for junk input", () => {
    for (const junk of [null, undefined, 42, "nope", [], {}]) {
      expect(migrate(junk)).toEqual(emptyState());
    }
  });

  it("returns an empty store when the version is missing or not a number", () => {
    expect(migrate({ quarters: {}, weeks: {}, days: {} })).toEqual(emptyState());
    expect(migrate({ version: "1" })).toEqual(emptyState());
  });

  it("refuses to downgrade data written by a newer version", () => {
    // Reading it as v1 would silently drop fields it doesn't know about.
    const future = { version: CLARO_SCHEMA_VERSION + 1, quarters: { x: {} }, weeks: {}, days: {} };
    expect(migrate(future)).toEqual(emptyState());
  });

  it("preserves a valid payload", () => {
    const state: ClaroState = {
      ...emptyState(),
      quarters: { "2026-Q3": blankQuarter("2026-Q3") },
    };
    expect(migrate(state).quarters["2026-Q3"]).toBeDefined();
  });

  it("repairs collections that are the wrong shape", () => {
    const damaged = { version: CLARO_SCHEMA_VERSION, quarters: [], weeks: null, days: "x" };
    const result = migrate(damaged);
    expect(result.quarters).toEqual({});
    expect(result.weeks).toEqual({});
    expect(result.days).toEqual({});
  });
});

describe("read-through defaults", () => {
  it("returns a blank for a period that was never saved", () => {
    const state = emptyState();
    expect(readQuarter(state, "2026-Q3")).toEqual(blankQuarter("2026-Q3"));
    expect(readWeek(state, "2026-W33")).toEqual(blankWeek("2026-W33"));
    expect(readDay(state, "2026-08-15")).toEqual(blankDay("2026-08-15"));
  });

  it("does not write anything when reading a missing period", () => {
    const state = emptyState();
    readDay(state, "2026-08-15");
    expect(Object.keys(state.days)).toHaveLength(0);
  });

  it("fills in fields absent from an older saved record", () => {
    // A day saved before `notes` and `mood` existed must not come back undefined.
    const state = emptyState();
    // @ts-expect-error deliberately partial, simulating an older schema
    state.days["2026-08-15"] = { id: "2026-08-15", waterGlasses: 3 };

    const day = readDay(state, "2026-08-15");
    expect(day.waterGlasses).toBe(3); // saved value wins
    expect(day.notes).toBe(""); // missing field defaults
    expect(day.mood).toBeNull();
    expect(day.actions).toEqual([]);
  });

  it("merges nested domain objects rather than replacing them", () => {
    const state = emptyState();
    // @ts-expect-error deliberately partial: `life` missing entirely
    state.quarters["2026-Q3"] = { id: "2026-Q3", work: { mainQuest: "Ship it" } };

    const q = readQuarter(state, "2026-Q3");
    expect(q.work.mainQuest).toBe("Ship it");
    expect(q.work.sideQuests).toEqual([]); // nested default filled in
    expect(q.life.mainQuest).toBe("");
  });

  it("always returns the requested id, even if the stored record disagrees", () => {
    const state = emptyState();
    state.weeks["2026-W33"] = { ...blankWeek("wrong-id") };
    expect(readWeek(state, "2026-W33").id).toBe("2026-W33");
  });
});

describe("load / save round-trip", () => {
  it("round-trips a store through localStorage", () => {
    const state = emptyState();
    state.days["2026-08-15"] = { ...blankDay("2026-08-15"), notes: "kept" };

    expect(saveNow(state)).toBe("ok");
    expect(loadState().days["2026-08-15"].notes).toBe("kept");
  });

  it("writes under the versioned key", () => {
    saveNow(emptyState());
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("returns an empty store when nothing has been saved", () => {
    expect(loadState()).toEqual(emptyState());
  });

  it("survives corrupt JSON rather than throwing", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(() => loadState()).not.toThrow();
    expect(loadState()).toEqual(emptyState());
  });

  it("reports failure instead of throwing when the write is rejected", () => {
    // Simulates a full quota or a privacy mode that blocks writes.
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(saveNow(emptyState())).toBe("failed");
    spy.mockRestore();
  });

  it("clears the stored payload", () => {
    saveNow(emptyState());
    clearState();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("scheduleSave debounce", () => {
  it("collapses rapid writes into a single one", () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(Storage.prototype, "setItem");

    for (let i = 0; i < 5; i++) {
      const state = emptyState();
      state.days["2026-08-15"] = { ...blankDay("2026-08-15"), notes: `v${i}` };
      scheduleSave(state);
    }
    expect(spy).not.toHaveBeenCalled(); // nothing written yet

    vi.advanceTimersByTime(500);
    expect(spy).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
    expect(loadState().days["2026-08-15"].notes).toBe("v4"); // last value wins
  });

  it("flushSave writes immediately without waiting for the timer", () => {
    vi.useFakeTimers();
    const state = emptyState();
    state.days["2026-08-15"] = { ...blankDay("2026-08-15"), notes: "urgent" };

    scheduleSave(state);
    flushSave();
    vi.useRealTimers();

    expect(loadState().days["2026-08-15"].notes).toBe("urgent");
  });

  it("flushSave is safe when nothing is pending", () => {
    expect(() => flushSave()).not.toThrow();
  });
});

describe("focus state defaults", () => {
  it("starts with no sessions, no live session and no interruptions", () => {
    const fresh = emptyState();

    expect(fresh.focusSessions).toEqual({});
    expect(fresh.activeFocusSessionId).toBeNull();
    expect(fresh.interruptions).toEqual({});
  });

  it("gives a store saved before focus existed the new collections", () => {
    const legacy = { version: CLARO_SCHEMA_VERSION, quarters: {}, weeks: {}, days: {} };

    expect(migrate(legacy)).toEqual(emptyState());
  });

  it("keeps focus records that are already there", () => {
    const stored = {
      ...emptyState(),
      activeFocusSessionId: "s1",
      focusSessions: { s1: { id: "s1" } },
      interruptions: { i1: { id: "i1" } },
    };

    const result = migrate(stored);
    expect(result.activeFocusSessionId).toBe("s1");
    expect(result.focusSessions.s1).toBeDefined();
    expect(result.interruptions.i1).toBeDefined();
  });

  it("repairs a damaged active session pointer rather than trusting it", () => {
    const damaged = { ...emptyState(), activeFocusSessionId: 42, focusSessions: [] };

    const result = migrate(damaged);
    expect(result.activeFocusSessionId).toBeNull();
    expect(result.focusSessions).toEqual({});
  });

  it("reads the live session through the store, or null when there is none", () => {
    expect(readActiveFocusSession(emptyState())).toBeNull();

    const withDangling = { ...emptyState(), activeFocusSessionId: "gone" };
    expect(readActiveFocusSession(withDangling)).toBeNull();
  });
});

describe("v1 → v2 migration", () => {
  const v1Day = (link: "work" | "life" | null) => ({
    id: "2026-08-18",
    priority1: { text: "Ship the store", done: false, link },
    priority2: { text: "", done: false, link: null },
    scheduleItems: [],
    actions: [],
    nonNegotiables: [],
    sleepHours: null,
    waterGlasses: 0,
    steps: null,
    mood: null,
    notes: "kept",
  });

  const v1Store = (link: "work" | "life" | null) => ({
    version: 1,
    quarters: {},
    weeks: {},
    days: { "2026-08-18": v1Day(link) },
  });

  it("turns a work link into the Work Main Quest reference", () => {
    const day = migrate(v1Store("work")).days["2026-08-18"];

    expect(day.priority1.goal).toEqual({ category: "workMain" });
  });

  it("turns a life link into the Life Main Quest reference", () => {
    expect(migrate(v1Store("life")).days["2026-08-18"].priority1.goal).toEqual({
      category: "lifeMain",
    });
  });

  it("leaves an unlinked priority unlinked", () => {
    expect(migrate(v1Store(null)).days["2026-08-18"].priority1.goal).toBeNull();
  });

  it("loses nothing else on the day", () => {
    const day = migrate(v1Store("work")).days["2026-08-18"];

    expect(day.priority1.text).toBe("Ship the store");
    expect(day.priority1.done).toBe(false);
    expect(day.notes).toBe("kept");
  });

  it("drops the dead link field rather than carrying two sources of truth", () => {
    const day = migrate(v1Store("work")).days["2026-08-18"];

    expect("link" in day.priority1).toBe(false);
  });

  it("does not re-derive a goal that a later version already resolved", () => {
    const v2 = {
      ...emptyState(),
      version: 2,
      days: {
        "2026-08-18": {
          ...blankDay("2026-08-18"),
          priority1: { text: "Already v2", done: false, goal: { category: "lifeSide", sideQuestId: "s1" } },
        },
      },
    };

    expect(migrate(v2).days["2026-08-18"].priority1.goal).toEqual({
      category: "lifeSide",
      sideQuestId: "s1",
    });
  });

  it("gives a v1 store the new collections", () => {
    const migrated = migrate(v1Store(null));

    expect(migrated.habits).toEqual({});
    expect(migrated.habitCompletions).toEqual({});
    expect(migrated.cycle.settings.enabled).toBe(false);
    expect(migrated.sound.volume).toBe(0.4);
  });
});

describe("v2 → v3 migration", () => {
  const v2Day = () => ({
    id: "2026-08-18",
    priority1: { text: "Ship the store", done: false, goal: { category: "workMain" } },
    priority2: { text: "", done: false, goal: null },
    scheduleItems: [{ id: "s1", time: "09:00", text: "Standup" }],
    actions: [
      { id: "a1", text: "Email", bucket: "quickTick", done: false, createdAt: "x" },
    ],
    nonNegotiables: [{ id: "n1", text: "Walk", done: false }],
    sleepHours: 7,
    waterGlasses: 3,
    steps: 4000,
    mood: 4,
    notes: "kept",
  });

  const v2Store = () => ({
    ...emptyState(),
    version: 2,
    days: { "2026-08-18": v2Day() },
  });

  it("gives the day a third priority slot", () => {
    const day = migrate(v2Store()).days["2026-08-18"];

    expect(day.priority3).toEqual({
      id: null,
      text: "",
      done: false,
      goal: null,
      createdAt: null,
      originDayId: null,
      carriedTo: null,
    });
  });

  it("gives written work a stable identity, and blank slots none", () => {
    const day = migrate(v2Store()).days["2026-08-18"];

    expect(day.priority1.id).toEqual(expect.any(String));
    expect(day.priority2.id).toBeNull();
  });

  it("treats existing work as having started on the day it sits on", () => {
    const day = migrate(v2Store()).days["2026-08-18"];

    expect(day.priority1.originDayId).toBe("2026-08-18");
    expect(day.actions[0].originDayId).toBe("2026-08-18");
  });

  it("marks nothing as already carried, because nothing could have been", () => {
    const day = migrate(v2Store()).days["2026-08-18"];

    expect(day.priority1.carriedTo).toBeNull();
    expect(day.actions[0].carriedTo).toBeNull();
    expect(day.carriedForward).toEqual([]);
  });

  it("invents no creation timestamp it cannot know", () => {
    expect(migrate(v2Store()).days["2026-08-18"].priority1.createdAt).toBeNull();
  });

  it("loses nothing else on the day", () => {
    const day = migrate(v2Store()).days["2026-08-18"];

    expect(day.priority1.text).toBe("Ship the store");
    expect(day.priority1.goal).toEqual({ category: "workMain" });
    expect(day.scheduleItems).toHaveLength(1);
    expect(day.nonNegotiables).toHaveLength(1);
    expect(day.notes).toBe("kept");
    expect(day.sleepHours).toBe(7);
  });

  it("carries a v1 store all the way through both steps", () => {
    const v1 = {
      version: 1,
      quarters: {},
      weeks: {},
      days: {
        "2026-08-18": {
          id: "2026-08-18",
          priority1: { text: "Old work", done: false, link: "life" },
          actions: [],
        },
      },
    };

    const day = migrate(v1).days["2026-08-18"];

    expect(day.priority1.goal).toEqual({ category: "lifeMain" });
    expect(day.priority1.id).toEqual(expect.any(String));
    expect(day.priority1.originDayId).toBe("2026-08-18");
    expect(day.priority3.text).toBe("");
  });

  it("does not re-stamp a store already at v3", () => {
    const v3 = {
      ...emptyState(),
      days: {
        "2026-08-18": {
          ...blankDay("2026-08-18"),
          priority1: {
            id: "kept-id",
            text: "Carried from before",
            done: false,
            goal: null,
            createdAt: "2026-08-14T09:00:00.000Z",
            originDayId: "2026-08-14",
            carriedTo: null,
          },
        },
      },
    };

    const day = migrate(v3).days["2026-08-18"];
    expect(day.priority1.id).toBe("kept-id");
    expect(day.priority1.originDayId).toBe("2026-08-14");
  });
});

describe("v5 → v6 schedule migration", () => {
  const v5Day = () => ({
    ...blankDay("2026-08-19"),
    scheduleItems: [
      { id: "s1", time: "09:00", text: "Deep work" },
      { id: "s2", time: "13:00", text: "Lunch away from the desk" },
    ],
    priority1: {
      id: "p1",
      text: "Deep work",
      done: false,
      goal: null,
      createdAt: null,
      originDayId: "2026-08-19",
      carriedTo: null,
    },
  });

  const v5Store = () => ({ ...emptyState(), version: 5, days: { "2026-08-19": v5Day() } });

  it("keeps every entry, on its own hour, with its own words", () => {
    const items = migrate(v5Store()).days["2026-08-19"].scheduleItems;

    expect(items).toHaveLength(2);
    expect(items.map((i) => [i.id, i.time, i.text])).toEqual([
      ["s1", "09:00", "Deep work"],
      ["s2", "13:00", "Lunch away from the desk"],
    ]);
  });

  it("makes every existing entry a standalone block", () => {
    const items = migrate(v5Store()).days["2026-08-19"].scheduleItems;

    expect(items.every((i) => i.link === null)).toBe(true);
  });

  it("never infers a link from matching text", () => {
    // "Deep work" is also priority 1's text. Guessing would bind a user's
    // schedule to a record they never linked it to, and that is not undoable.
    const day = migrate(v5Store()).days["2026-08-19"];

    expect(day.scheduleItems[0].link).toBeNull();
    expect(day.priority1.id).toBe("p1");
  });

  it("starts every entry incomplete, since entries had no completion before v6", () => {
    expect(migrate(v5Store()).days["2026-08-19"].scheduleItems.every((i) => i.done === false)).toBe(
      true,
    );
  });

  it("creates no extra entries", () => {
    const before = v5Store().days["2026-08-19"].scheduleItems.length;

    expect(migrate(v5Store()).days["2026-08-19"].scheduleItems).toHaveLength(before);
  });

  it("loses nothing else on the day", () => {
    const day = migrate(v5Store()).days["2026-08-19"];

    expect(day.priority1.text).toBe("Deep work");
    expect(day.priority1.id).toBe("p1");
  });

  it("copes with a day that has no schedule at all", () => {
    const store = { ...emptyState(), version: 5, days: { "2026-08-19": blankDay("2026-08-19") } };

    expect(migrate(store).days["2026-08-19"].scheduleItems).toEqual([]);
  });

  it("leaves a link alone if the payload somehow already carries one", () => {
    const store = {
      ...emptyState(),
      version: 5,
      days: {
        "2026-08-19": {
          ...blankDay("2026-08-19"),
          scheduleItems: [
            {
              id: "s1",
              time: "09:00",
              text: "Ship it",
              link: { kind: "priority", priorityId: "p1" },
              done: true,
            },
          ],
        },
      },
    };

    const item = migrate(store).days["2026-08-19"].scheduleItems[0];
    expect(item.link).toEqual({ kind: "priority", priorityId: "p1" });
    expect(item.done).toBe(true);
  });

  it("carries a v1 store all the way to a v6 schedule", () => {
    const v1 = {
      version: 1,
      quarters: {},
      weeks: {},
      days: {
        "2026-08-19": {
          id: "2026-08-19",
          priority1: { text: "Old work", done: false, link: "work" },
          scheduleItems: [{ id: "s1", time: "09:00", text: "Standup" }],
          actions: [],
        },
      },
    };

    const day = migrate(v1).days["2026-08-19"];
    expect(day.scheduleItems[0]).toMatchObject({ id: "s1", time: "09:00", link: null, done: false });
    expect(day.priority1.goal).toEqual({ category: "workMain" });
  });

  it("does not re-run on a store already at v6", () => {
    const v6 = {
      ...emptyState(),
      days: {
        "2026-08-19": {
          ...blankDay("2026-08-19"),
          scheduleItems: [
            {
              id: "s1",
              time: "09:00",
              text: "Ship it",
              link: { kind: "action", actionId: "a1" },
              done: false,
            },
          ],
        },
      },
    };

    expect(migrate(v6).days["2026-08-19"].scheduleItems[0].link).toEqual({
      kind: "action",
      actionId: "a1",
    });
  });
});

describe("v6 → v7 review migration", () => {
  it("moves the old second answer across rather than dropping it", () => {
    const v6 = {
      ...emptyState(),
      version: 6,
      days: {
        "2026-08-19": {
          ...blankDay("2026-08-19"),
          review: {
            proudOf: "Stopped at a sensible hour",
            helped: "Two quiet hours before anyone was awake",
            mood: "good",
            stress: 2,
            updatedAt: "x",
          },
        } as never,
      },
    };

    const review = migrate(v6).days["2026-08-19"].review;
    expect(review?.proudOf).toBe("Stopped at a sensible hour");
    expect(review?.betterTomorrow).toBe("Two quiet hours before anyone was awake");
    expect(review?.mood).toBe("good");
    expect(review?.stress).toBe(2);
  });

  it("leaves a day with no review alone", () => {
    const v6 = { ...emptyState(), version: 6, days: { "2026-08-19": blankDay("2026-08-19") } };
    expect(migrate(v6).days["2026-08-19"].review).toBeNull();
  });

  it("gives every day a closed marker of null", () => {
    const v6 = { ...emptyState(), version: 6, days: { "2026-08-19": blankDay("2026-08-19") } };
    expect(migrate(v6).days["2026-08-19"].closedAt).toBeNull();
  });
});

describe("reading a plan saved before the workspace grew", () => {
  it("adds the new sections as blanks, without a migration", () => {
    const state = {
      ...emptyState(),
      quarters: {
        "2026-Q3": {
          id: "2026-Q3",
          work: { mainQuest: "Take Claro to real users", sideQuests: [] },
          life: { mainQuest: "", sideQuests: [] },
          plan: {
            startedAt: "2026-07-01T09:00:00.000Z",
            completedAt: null,
            reflection: { proudOf: "Shipped the beta", whatWorked: "", carryForward: "" },
            direction: { mattersMost: "", meaningful: "", constraints: "" },
          },
        } as never,
      },
    };

    const quarter = readQuarter(state, "2026-Q3");
    expect(quarter.plan?.reflection.proudOf).toBe("Shipped the beta");
    expect(quarter.plan?.foundation).toEqual({
      theme: "",
      outcome: "",
      whyItMatters: "",
      headline: "",
    });
    expect(quarter.plan?.focusWeeks).toHaveLength(12);
    expect(quarter.plan?.clearestGoals).toEqual(["", "", ""]);
    expect(quarter.work.mainQuestEvidence).toBe("");
  });

  it("pads a short focus list and trims an over-long one", () => {
    const state = {
      ...emptyState(),
      quarters: {
        "2026-Q3": {
          ...blankQuarter("2026-Q3"),
          plan: {
            ...blankPlan(new Date("2026-07-01T09:00:00.000Z")),
            focusWeeks: ["Ship the beta"],
          },
        },
      },
    };

    const weeks = readQuarter(state, "2026-Q3").plan!.focusWeeks;
    expect(weeks).toHaveLength(12);
    expect(weeks[0]).toBe("Ship the beta");
    expect(weeks[11]).toBe("");
  });
});

describe("v7 → v8 period range migration", () => {
  /** Exactly what a store saved before ranges existed looks like on disk. */
  const v7Store = () => ({
    ...emptyState(),
    version: 7,
    cycle: {
      settings: { enabled: true, optedInAt: "2026-01-01T09:00:00.000Z", cycleLength: null, syncConsentAt: null },
      entries: {
        e0: { id: "e0", startDate: "2026-06-01", loggedAt: "2026-06-01T09:00:00.000Z" },
        e1: { id: "e1", startDate: "2026-06-29", loggedAt: "2026-06-29T09:00:00.000Z" },
      },
      checkIns: {},
      lastSeen: null,
  guidanceMatches: {},
  guideAnswers: {},
    },
  });

  it("keeps every start date that was already logged", () => {
    const { entries } = migrate(v7Store()).cycle;

    expect(Object.keys(entries).sort()).toEqual(["e0", "e1"]);
    expect(entries.e0.startDate).toBe("2026-06-01");
    expect(entries.e1.startDate).toBe("2026-06-29");
  });

  it("records the missing end as null rather than inventing one", () => {
    const { entries } = migrate(v7Store()).cycle;

    // An end date is a fact about someone's body. A guess would be a lie in a
    // place where lying matters.
    expect(entries.e0.endDate).toBeNull();
    expect(entries.e1.endDate).toBeNull();
  });

  it("keeps the opt-in and the private notes intact", () => {
    const store = v7Store();
    store.cycle.checkIns = {
      "2026-06-02": {
        dayId: "2026-06-02",
        energy: 2,
        mood: null,
        stress: null,
        note: "Tired",
        updatedAt: "2026-06-02T20:00:00.000Z",
      },
    };

    const cycle = migrate(store).cycle;
    expect(cycle.settings.enabled).toBe(true);
    expect(cycle.settings.optedInAt).toBe("2026-01-01T09:00:00.000Z");
    expect(cycle.checkIns["2026-06-02"].note).toBe("Tired");
  });

  it("drops an entry with no start date at all, rather than crashing on it", () => {
    const store = v7Store();
    (store.cycle.entries as Record<string, unknown>).broken = { id: "broken" };

    expect(Object.keys(migrate(store).cycle.entries).sort()).toEqual(["e0", "e1"]);
  });
});

describe("period ranges survive a refresh", () => {
  const withPeriods = (): ClaroState => ({
    ...emptyState(),
    cycle: {
      settings: { enabled: true, optedInAt: "2026-01-01T09:00:00.000Z", cycleLength: null, syncConsentAt: null },
      entries: {
        done: {
          id: "done",
          startDate: "2026-08-01",
          endDate: "2026-08-04",
          loggedAt: "2026-08-01T09:00:00.000Z",
        },
        open: {
          id: "open",
          startDate: "2026-08-17",
          endDate: null,
          loggedAt: "2026-08-17T09:00:00.000Z",
        },
      },
      checkIns: {},
      lastSeen: null,
  guidanceMatches: {},
  guideAnswers: {},
    },
  });

  it("reloads a completed range and an ongoing one exactly as they were saved", () => {
    saveNow(withPeriods());

    const { entries } = loadState().cycle;
    expect(entries.done.startDate).toBe("2026-08-01");
    expect(entries.done.endDate).toBe("2026-08-04");
    expect(entries.open.startDate).toBe("2026-08-17");
    // Still ongoing after the reload, not silently closed.
    expect(entries.open.endDate).toBeNull();
  });
});
