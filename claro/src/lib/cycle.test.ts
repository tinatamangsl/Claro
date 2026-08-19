import { describe, expect, it } from "vitest";

import {
  LOG_REFUSAL,
  MIN_ENTRIES_FOR_ESTIMATE,
  addStart,
  checkInOn,
  editStart,
  hasStartOn,
  entryOn,
  estimateNext,
  gaps,
  hasAnyCycleData,
  hasCheckIn,
  isLoggedStart,
  loggedStartDays,
  recentCheckIns,
  sortedEntries,
} from "./cycle";
import { blankCycle } from "./storage";
import type { CycleState, ISODate } from "./types";

const cycleWith = (...starts: ISODate[]): CycleState => ({
  settings: { enabled: true, optedInAt: "2026-01-01T09:00:00.000Z" },
  entries: Object.fromEntries(
    starts.map((startDate, i) => [
      `e${i}`,
      { id: `e${i}`, startDate, loggedAt: `${startDate}T09:00:00.000Z` },
    ]),
  ),
  checkIns: {},
});

describe("logged entries", () => {
  it("come back oldest first, whatever order they were logged in", () => {
    const cycle = cycleWith("2026-03-01", "2026-01-01", "2026-02-01");

    expect(sortedEntries(cycle).map((e) => e.startDate)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
  });

  it("can be found by day, for marking the calendar", () => {
    const cycle = cycleWith("2026-01-01");

    expect(isLoggedStart(cycle, "2026-01-01")).toBe(true);
    expect(isLoggedStart(cycle, "2026-01-02")).toBe(false);
    expect(entryOn(cycle, "2026-01-01")?.startDate).toBe("2026-01-01");
    expect(entryOn(cycle, "2026-01-02")).toBeNull();
  });

  it("measures the gaps between consecutive starts", () => {
    expect(gaps(sortedEntries(cycleWith("2026-01-01", "2026-01-29", "2026-02-26")))).toEqual([
      28, 28,
    ]);
  });
});

describe("the next-start estimate", () => {
  it("says nothing at all until there is enough of the user's own history", () => {
    expect(estimateNext(blankCycle())).toBeNull();
    expect(estimateNext(cycleWith("2026-01-01"))).toBeNull();
    expect(estimateNext(cycleWith("2026-01-01", "2026-01-29"))).toBeNull();
    expect(MIN_ENTRIES_FOR_ESTIMATE).toBe(3);
  });

  it("projects the user's own median gap from their last logged start", () => {
    const estimate = estimateNext(cycleWith("2026-01-01", "2026-01-29", "2026-02-26"));

    expect(estimate).toEqual({ typicalGap: 28, nextStart: "2026-03-26", basedOn: 2 });
  });

  it("uses a median, so one unusual month does not drag it", () => {
    // Gaps of 28, 28 and 45 — a mean would say 34.
    const estimate = estimateNext(
      cycleWith("2026-01-01", "2026-01-29", "2026-02-26", "2026-04-12"),
    );

    expect(estimate?.typicalGap).toBe(28);
  });

  it("leaves an implausible gap out rather than believing it", () => {
    // A 200-day gap is a mis-log or a break, not a cycle length.
    const estimate = estimateNext(
      cycleWith("2026-01-01", "2026-07-20", "2026-08-17", "2026-09-14"),
    );

    expect(estimate?.typicalGap).toBe(28);
    expect(estimate?.basedOn).toBe(2);
  });

  it("returns nothing when no gap is plausible", () => {
    expect(estimateNext(cycleWith("2020-01-01", "2022-01-01", "2024-01-01"))).toBeNull();
  });

  it("says how many gaps it drew on, so the reader can weigh it", () => {
    const estimate = estimateNext(cycleWith("2026-01-01", "2026-01-29", "2026-02-26"));

    expect(estimate?.basedOn).toBe(2);
  });
});

// ------------------------------------------------------------- check-ins

const withCheckIns = (
  entries: Partial<Record<string, { energy?: number; mood?: string; stress?: number }>>,
): CycleState => ({
  settings: { enabled: true, optedInAt: "2026-01-01T09:00:00.000Z" },
  entries: {},
  checkIns: Object.fromEntries(
    Object.entries(entries).map(([dayId, note]) => [
      dayId,
      {
        dayId,
        energy: (note?.energy ?? null) as never,
        mood: (note?.mood ?? null) as never,
        stress: (note?.stress ?? null) as never,
        note: "",
        updatedAt: "x",
      },
    ]),
  ),
});

describe("private daily notes", () => {
  it("reads a blank note without creating one", () => {
    const cycle = blankCycle();
    const note = checkInOn(cycle, "2026-08-19");

    expect(note).toEqual({
      dayId: "2026-08-19",
      energy: null,
      mood: null,
      stress: null,
      note: "",
      updatedAt: "",
    });
    // Reading must not materialise a record, or "delete all" would lie.
    expect(cycle.checkIns).toEqual({});
  });

  it("counts as written only once something is actually set", () => {
    expect(hasCheckIn(withCheckIns({ "2026-08-19": {} }), "2026-08-19")).toBe(false);
    expect(hasCheckIn(withCheckIns({ "2026-08-19": { energy: 3 } }), "2026-08-19")).toBe(true);
    expect(hasCheckIn(withCheckIns({ "2026-08-19": { stress: 2 } }), "2026-08-19")).toBe(true);
    expect(hasCheckIn(blankCycle(), "2026-08-19")).toBe(false);
  });

  it("lists recent notes newest first, ignoring empty ones", () => {
    const cycle = withCheckIns({
      "2026-08-17": { energy: 2 },
      "2026-08-19": { mood: "good" },
      "2026-08-18": {},
    });

    expect(recentCheckIns(cycle).map((n) => n.dayId)).toEqual(["2026-08-19", "2026-08-17"]);
  });

  it("limits how many it hands back", () => {
    const many = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`2026-08-${String(i + 1).padStart(2, "0")}`, { energy: 3 }]),
    );

    expect(recentCheckIns(withCheckIns(many), 5)).toHaveLength(5);
  });
});

describe("what deleting everything has to remove", () => {
  it("reports nothing to delete on a fresh, untouched cycle", () => {
    expect(hasAnyCycleData(blankCycle())).toBe(false);
  });

  it("reports data once the user has opted in", () => {
    const cycle: CycleState = {
      ...blankCycle(),
      settings: { enabled: true, optedInAt: "2026-01-01T09:00:00.000Z" },
    };

    expect(hasAnyCycleData(cycle)).toBe(true);
  });

  it("reports data for logged dates and for private notes alike", () => {
    expect(hasAnyCycleData(cycleWith("2026-01-01"))).toBe(true);
    expect(hasAnyCycleData(withCheckIns({ "2026-08-19": { energy: 3 } }))).toBe(true);
  });
});

describe("marking the calendar", () => {
  it("marks only the days the user actually logged", () => {
    const days = loggedStartDays(cycleWith("2026-01-01", "2026-01-29"));

    expect([...days].sort()).toEqual(["2026-01-01", "2026-01-29"]);
    // No length, window or phase is inferred around them.
    expect(days.has("2026-01-02")).toBe(false);
  });
});

// ------------------------------------------------- adding and editing starts

describe("adding a logged start", () => {
  const TODAY = "2026-08-19";

  it("adds a date in the past", () => {
    const result = addStart(blankCycle(), "2026-08-01", "e1", new Date(), TODAY);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.entries.e1.startDate).toBe("2026-08-01");
  });

  it("refuses a date that is already logged, rather than double counting it", () => {
    const result = addStart(cycleWith("2026-08-01"), "2026-08-01", "e9", new Date(), TODAY);

    expect(result).toEqual({ ok: false, reason: "duplicate" });
  });

  it("refuses a date that has not happened yet", () => {
    expect(addStart(blankCycle(), "2026-09-01", "e1", new Date(), TODAY)).toEqual({
      ok: false,
      reason: "future",
    });
  });

  it("accepts today itself", () => {
    expect(addStart(blankCycle(), TODAY, "e1", new Date(), TODAY).ok).toBe(true);
  });

  it("refuses something that is not a date", () => {
    expect(addStart(blankCycle(), "not-a-date", "e1", new Date(), TODAY)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("explains every refusal in plain words", () => {
    expect(Object.values(LOG_REFUSAL).every((line) => line.trim().length > 0)).toBe(true);
  });
});

describe("editing a logged start", () => {
  const TODAY = "2026-08-19";
  const cycle = () => cycleWith("2026-06-01", "2026-06-29");

  it("moves an entry to another date", () => {
    const result = editStart(cycle(), "e0", "2026-06-02", TODAY);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.entries.e0.startDate).toBe("2026-06-02");
  });

  it("keeps the entry's own id, so nothing else has to be rewritten", () => {
    const result = editStart(cycle(), "e0", "2026-06-02", TODAY);
    if (result.ok) expect(result.entries.e0.id).toBe("e0");
  });

  it("refuses a move onto another logged date", () => {
    expect(editStart(cycle(), "e0", "2026-06-29", TODAY)).toEqual({
      ok: false,
      reason: "duplicate",
    });
  });

  it("allows saving an entry onto its own date, which changes nothing", () => {
    expect(editStart(cycle(), "e0", "2026-06-01", TODAY).ok).toBe(true);
  });

  it("refuses a future date and an unknown entry", () => {
    expect(editStart(cycle(), "e0", "2026-12-01", TODAY).ok).toBe(false);
    expect(editStart(cycle(), "gone", "2026-06-02", TODAY)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("recalculates the estimate immediately after an edit", () => {
    const original = cycleWith("2026-06-01", "2026-06-29", "2026-07-27");
    expect(estimateNext(original)?.typicalGap).toBe(28);

    // Moving the last start later stretches the second gap to 35, so the
    // median of the two gaps moves with it.
    const edited = editStart(original, "e2", "2026-08-03", TODAY);
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;

    const after = estimateNext({ ...original, entries: edited.entries });
    expect(after?.typicalGap).toBe(32);
    expect(after?.nextStart).toBe("2026-09-04");
  });

  it("recalculates after a deletion too", () => {
    const original = cycleWith("2026-06-01", "2026-06-29", "2026-08-03");
    const { e2, ...rest } = original.entries;
    void e2;

    // Two entries leave one gap, which is below the threshold to estimate at all.
    expect(estimateNext({ ...original, entries: rest })).toBeNull();
  });

  it("spots a duplicate whichever entry is asked about", () => {
    expect(hasStartOn(cycle(), "2026-06-01")).toBe(true);
    // Ignoring the entry itself is what lets it be saved unchanged.
    expect(hasStartOn(cycle(), "2026-06-01", "e0")).toBe(false);
  });
});
