import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    expect(d.priority1).toEqual({ text: "", done: false, link: null });
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
      version: CLARO_SCHEMA_VERSION,
      quarters: { "2026-Q3": blankQuarter("2026-Q3") },
      weeks: {},
      days: {},
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
