import { describe, expect, it } from "vitest";

import {
  LOG_REFUSAL,
  MIN_ENTRIES_FOR_ESTIMATE,
  addPeriod,
  checkInOn,
  clampStatedCycleLength,
  completedPeriods,
  confirmedRange,
  describeRefusal,
  durationHistory,
  durationOf,
  editPeriod,
  endPeriod,
  formatWeeksAndDays,
  hasStartOn,
  entryOn,
  estimateNext,
  gaps,
  hasAnyCycleData,
  hasCheckIn,
  isLoggedStart,
  isOngoing,
  isPeriodDay,
  loggedStartDays,
  ongoingPeriod,
  overlapping,
  periodEntryOn,
  recentCheckIns,
  reopenPeriod,
  sortedEntries,
} from "./cycle";
import { blankCycle } from "./storage";
import type { CycleState, ISODate } from "./types";

/** A start on its own is an open period; a pair is a completed range. */
type Spec = ISODate | [ISODate, ISODate | null];

const cycleWith = (...specs: Spec[]): CycleState => ({
  settings: { enabled: true, optedInAt: "2026-01-01T09:00:00.000Z", cycleLength: null },
  entries: Object.fromEntries(
    specs.map((spec, i) => {
      const [startDate, endDate] = Array.isArray(spec) ? spec : [spec, null];
      return [
        `e${i}`,
        { id: `e${i}`, startDate, endDate, loggedAt: `${startDate}T09:00:00.000Z` },
      ];
    }),
  ),
  checkIns: {},
  lastSeen: null,
  guidanceMatches: {},
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

    expect(estimate).toEqual({
      typicalGap: 28,
      nextStart: "2026-03-26",
      basedOn: 2,
      source: "logged",
    });
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
  settings: { enabled: true, optedInAt: "2026-01-01T09:00:00.000Z", cycleLength: null },
  entries: {},
  checkIns: Object.fromEntries(
    Object.entries(entries).map(([dayId, note]) => [
      dayId,
      {
        dayId,
        energy: (note?.energy ?? null) as never,
        mood: (note?.mood ?? null) as never,
        stress: (note?.stress ?? null) as never,
        feeling: null,
        flow: null,
        note: "",
        evening: null,
      noticed: "",
      journal: "",
        updatedAt: "x",
      },
    ]),
  ),
  lastSeen: null,
  guidanceMatches: {},
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
      feeling: null,
      flow: null,
      note: "",
      evening: null,
      noticed: "",
      journal: "",
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
      settings: { enabled: true, optedInAt: "2026-01-01T09:00:00.000Z", cycleLength: null },
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

/** Thin helpers so the existing start-only cases keep reading as they did. */
const addPeriodStart = (
  cycle: CycleState,
  startDate: string,
  id: string,
  now: Date,
  todayId: ISODate,
) => addPeriod(cycle, { startDate, endDate: null }, id, now, todayId);

const editPeriodStart = (cycle: CycleState, id: string, startDate: string, todayId: ISODate) =>
  editPeriod(cycle, id, { startDate, endDate: cycle.entries[id]?.endDate ?? null }, todayId);

describe("adding a logged start", () => {
  const TODAY = "2026-08-19";

  it("adds a date in the past", () => {
    const result = addPeriodStart(blankCycle(), "2026-08-01", "e1", new Date(), TODAY);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.entries.e1.startDate).toBe("2026-08-01");
  });

  it("refuses a date that is already logged, rather than double counting it", () => {
    const result = addPeriodStart(cycleWith("2026-08-01"), "2026-08-01", "e9", new Date(), TODAY);

    expect(result).toEqual({ ok: false, reason: "duplicate" });
  });

  it("refuses a date that has not happened yet", () => {
    expect(addPeriodStart(blankCycle(), "2026-09-01", "e1", new Date(), TODAY)).toEqual({
      ok: false,
      reason: "future",
    });
  });

  it("accepts today itself", () => {
    expect(addPeriodStart(blankCycle(), TODAY, "e1", new Date(), TODAY).ok).toBe(true);
  });

  it("refuses something that is not a date", () => {
    expect(addPeriodStart(blankCycle(), "not-a-date", "e1", new Date(), TODAY)).toEqual({
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
    const result = editPeriodStart(cycle(), "e0", "2026-06-02", TODAY);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.entries.e0.startDate).toBe("2026-06-02");
  });

  it("keeps the entry's own id, so nothing else has to be rewritten", () => {
    const result = editPeriodStart(cycle(), "e0", "2026-06-02", TODAY);
    if (result.ok) expect(result.entries.e0.id).toBe("e0");
  });

  it("refuses a move onto another logged date", () => {
    expect(editPeriodStart(cycle(), "e0", "2026-06-29", TODAY)).toEqual({
      ok: false,
      reason: "duplicate",
    });
  });

  it("allows saving an entry onto its own date, which changes nothing", () => {
    expect(editPeriodStart(cycle(), "e0", "2026-06-01", TODAY).ok).toBe(true);
  });

  it("refuses a future date and an unknown entry", () => {
    expect(editPeriodStart(cycle(), "e0", "2026-12-01", TODAY).ok).toBe(false);
    expect(editPeriodStart(cycle(), "gone", "2026-06-02", TODAY)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("recalculates the estimate immediately after an edit", () => {
    const original = cycleWith("2026-06-01", "2026-06-29", "2026-07-27");
    expect(estimateNext(original)?.typicalGap).toBe(28);

    // Moving the last start later stretches the second gap to 35, so the
    // median of the two gaps moves with it.
    const edited = editPeriodStart(original, "e2", "2026-08-03", TODAY);
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

// ------------------------------------------------------------ period ranges

describe("a period is a range", () => {
  const TODAY: ISODate = "2026-08-19";

  it("counts duration inclusively, so a period ending the day it started is one day", () => {
    const cycle = cycleWith(["2026-08-01", "2026-08-01"]);

    expect(durationOf(cycle, cycle.entries.e0, TODAY)).toBe(1);
  });

  it("counts a three day period as three days, not two", () => {
    const cycle = cycleWith(["2026-08-01", "2026-08-03"]);

    expect(durationOf(cycle, cycle.entries.e0, TODAY)).toBe(3);
    expect(confirmedRange(cycle, cycle.entries.e0, TODAY)).toEqual({
      from: "2026-08-01",
      to: "2026-08-03",
    });
  });

  it("colours every day from start through end, and nothing outside it", () => {
    const cycle = cycleWith(["2026-08-01", "2026-08-04"]);

    expect(isPeriodDay(cycle, "2026-07-31", TODAY)).toBe(false);
    for (const day of ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04"] as ISODate[]) {
      expect(isPeriodDay(cycle, day, TODAY)).toBe(true);
    }
    expect(isPeriodDay(cycle, "2026-08-05", TODAY)).toBe(false);
  });

  it("finds which period a day belongs to", () => {
    const cycle = cycleWith(["2026-06-01", "2026-06-04"], ["2026-08-01", "2026-08-03"]);

    expect(periodEntryOn(cycle, "2026-06-03", TODAY)?.id).toBe("e0");
    expect(periodEntryOn(cycle, "2026-08-02", TODAY)?.id).toBe("e1");
    expect(periodEntryOn(cycle, "2026-07-01", TODAY)).toBeNull();
  });
});

describe("an ongoing period", () => {
  const TODAY: ISODate = "2026-08-19";

  it("is the newest period with no end date", () => {
    const cycle = cycleWith(["2026-06-01", "2026-06-04"], "2026-08-17");

    expect(ongoingPeriod(cycle)?.id).toBe("e1");
    expect(isOngoing(cycle, cycle.entries.e1)).toBe(true);
    expect(isOngoing(cycle, cycle.entries.e0)).toBe(false);
  });

  it("shows only the days confirmed so far, and never past today", () => {
    const cycle = cycleWith("2026-08-17");

    expect(confirmedRange(cycle, cycle.entries.e0, TODAY)).toEqual({
      from: "2026-08-17",
      to: TODAY,
    });
    expect(durationOf(cycle, cycle.entries.e0, TODAY)).toBe(3);
    expect(isPeriodDay(cycle, TODAY, TODAY)).toBe(true);
    expect(isPeriodDay(cycle, "2026-08-20", TODAY)).toBe(false);
  });

  it("does not count towards recorded durations until it is closed", () => {
    const open = cycleWith(["2026-06-01", "2026-06-04"], "2026-08-17");

    expect(completedPeriods(open).map((e) => e.id)).toEqual(["e0"]);
    expect(durationHistory(open)?.of).toBe(1);

    const closed = endPeriod(open, "e1", "2026-08-19", TODAY);
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;

    expect(durationHistory({ ...open, entries: closed.entries })?.of).toBe(2);
  });

  it("is closed by adding an end date, and can be reopened", () => {
    const cycle = cycleWith("2026-08-17");

    const closed = endPeriod(cycle, "e0", "2026-08-19", TODAY);
    if (!closed.ok) throw new Error("expected the close to be accepted");
    expect(closed.entries.e0.endDate).toBe("2026-08-19");

    const reopened = reopenPeriod({ ...cycle, entries: closed.entries }, "e0", TODAY);
    if (!reopened.ok) throw new Error("expected the reopen to be accepted");
    expect(reopened.entries.e0.endDate).toBeNull();
  });

  it("refuses an end date before its own start", () => {
    const cycle = cycleWith("2026-08-17");

    expect(endPeriod(cycle, "e0", "2026-08-15", TODAY)).toEqual({
      ok: false,
      reason: "backwards",
    });
  });

  it("treats an older period with no end as end-not-recorded, covering only its start", () => {
    // Logged before ranges existed. Nothing is invented to fill the gap, and it
    // must not swallow every day between then and now.
    const cycle = cycleWith("2026-06-01", "2026-08-17");

    expect(isOngoing(cycle, cycle.entries.e0)).toBe(false);
    expect(confirmedRange(cycle, cycle.entries.e0, TODAY)).toEqual({
      from: "2026-06-01",
      to: "2026-06-01",
    });
    expect(isPeriodDay(cycle, "2026-06-02", TODAY)).toBe(false);
  });
});

describe("recorded durations", () => {
  it("reads back the user's own numbers, with no verdict on them", () => {
    const cycle = cycleWith(
      ["2026-06-01", "2026-06-03"],
      ["2026-06-29", "2026-07-03"],
      ["2026-07-27", "2026-07-30"],
    );

    const history = durationHistory(cycle);
    expect(history).toEqual({ last: 4, min: 3, max: 5, typical: 4, of: 3 });
  });

  it("is null until at least one period has been closed", () => {
    expect(durationHistory(cycleWith("2026-06-01", "2026-06-29"))).toBeNull();
    expect(durationHistory(blankCycle())).toBeNull();
  });
});

describe("overlapping periods are refused", () => {
  const TODAY: ISODate = "2026-08-19";

  it("refuses a range that covers a day another period already covers", () => {
    const cycle = cycleWith(["2026-08-01", "2026-08-05"]);

    const result = addPeriod(
      cycle,
      { startDate: "2026-08-04", endDate: "2026-08-08" },
      "new",
      new Date(),
      TODAY,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("overlap");
    expect(result.conflict?.id).toBe("e0");
  });

  it("refuses a range swallowed whole by an existing one", () => {
    const cycle = cycleWith(["2026-08-01", "2026-08-10"]);

    const result = addPeriod(
      cycle,
      { startDate: "2026-08-04", endDate: "2026-08-06" },
      "new",
      new Date(),
      TODAY,
    );
    expect(result.ok).toBe(false);
  });

  it("allows a range that begins the day after another ends", () => {
    const cycle = cycleWith(["2026-08-01", "2026-08-05"]);

    expect(
      addPeriod(cycle, { startDate: "2026-08-06", endDate: "2026-08-08" }, "new", new Date(), TODAY)
        .ok,
    ).toBe(true);
  });

  it("refuses a new start inside a period that is still ongoing", () => {
    const cycle = cycleWith("2026-08-15");

    const result = addPeriod(
      cycle,
      { startDate: "2026-08-18", endDate: null },
      "new",
      new Date(),
      TODAY,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("overlap");
  });

  it("lets a period be saved over itself while it is being edited", () => {
    const cycle = cycleWith(["2026-08-01", "2026-08-05"]);

    expect(
      editPeriod(cycle, "e0", { startDate: "2026-08-01", endDate: "2026-08-06" }, TODAY).ok,
    ).toBe(true);
  });

  it("names the dates it clashed with, rather than only refusing", () => {
    const cycle = cycleWith(["2026-08-01", "2026-08-05"]);
    const result = addPeriod(
      cycle,
      { startDate: "2026-08-03", endDate: "2026-08-07" },
      "new",
      new Date(),
      TODAY,
    );
    if (result.ok) throw new Error("expected a refusal");

    const message = describeRefusal(result, cycle, TODAY);
    expect(message).toContain("1 Aug");
    expect(message).toContain("5 Aug");
  });

  it("reports the colliding entry directly, for any caller that wants it", () => {
    const cycle = cycleWith(["2026-08-01", "2026-08-05"]);

    expect(overlapping(cycle, { from: "2026-08-05", to: "2026-08-09" }, TODAY)?.id).toBe("e0");
    expect(overlapping(cycle, { from: "2026-08-06", to: "2026-08-09" }, TODAY)).toBeNull();
    // Ignoring itself is what makes an in-place edit possible.
    expect(overlapping(cycle, { from: "2026-08-01", to: "2026-08-05" }, TODAY, "e0")).toBeNull();
  });
});

describe("cycle length and period duration stay separate", () => {
  const TODAY: ISODate = "2026-08-19";
  const starts = () => cycleWith("2026-06-01", "2026-06-29", "2026-07-27");

  it("estimates from start to start, never from the number of bleeding days", () => {
    const before = estimateNext(starts());
    expect(before?.typicalGap).toBe(28);
    expect(before?.nextStart).toBe("2026-08-24");

    // Give every period a wildly different length. The estimate must not move.
    let entries = starts().entries;
    for (const [id, end] of [
      ["e0", "2026-06-02"],
      ["e1", "2026-07-08"],
    ] as const) {
      const result = editPeriod(
        { ...starts(), entries },
        id,
        { startDate: entries[id].startDate, endDate: end },
        TODAY,
      );
      if (!result.ok) throw new Error("expected the edit to be accepted");
      entries = result.entries;
    }

    const after = estimateNext({ ...starts(), entries });
    expect(after?.typicalGap).toBe(28);
    expect(after?.nextStart).toBe("2026-08-24");
    // And the durations are reported on their own terms.
    expect(durationHistory({ ...starts(), entries })).toEqual({
      last: 10,
      min: 2,
      max: 10,
      typical: 6,
      of: 2,
    });
  });

  it("reads a length back in weeks and days without changing the stored number", () => {
    expect(formatWeeksAndDays(29)).toBe("4 weeks and 1 day");
    expect(formatWeeksAndDays(28)).toBe("4 weeks");
    expect(formatWeeksAndDays(5)).toBe("5 days");
    expect(formatWeeksAndDays(0)).toBe("0 days");
  });
});

describe("editing a historic range", () => {
  const TODAY: ISODate = "2026-08-19";

  it("changes both ends at once and recalculates everything from it", () => {
    const cycle = cycleWith(["2026-06-01", "2026-06-04"], ["2026-06-29", "2026-07-02"]);

    const result = editPeriod(
      cycle,
      "e0",
      { startDate: "2026-06-02", endDate: "2026-06-08" },
      TODAY,
    );
    if (!result.ok) throw new Error("expected the edit to be accepted");

    const after = { ...cycle, entries: result.entries };
    expect(after.entries.e0.startDate).toBe("2026-06-02");
    expect(durationOf(after, after.entries.e0, TODAY)).toBe(7);
    expect(gaps(sortedEntries(after))).toEqual([27]);
  });

  it("refuses an end date in the future", () => {
    const cycle = cycleWith(["2026-08-01", "2026-08-05"]);

    expect(
      editPeriod(cycle, "e0", { startDate: "2026-08-01", endDate: "2026-12-01" }, TODAY),
    ).toEqual({ ok: false, reason: "future" });
  });

  it("refuses an end date before the start", () => {
    const cycle = cycleWith(["2026-08-05", "2026-08-08" ]);

    expect(
      editPeriod(cycle, "e0", { startDate: "2026-08-05", endDate: "2026-08-02" }, TODAY),
    ).toEqual({ ok: false, reason: "backwards" });
  });

  it("explains every refusal in plain words, including the new ones", () => {
    expect(Object.values(LOG_REFUSAL).every((line) => line.trim().length > 0)).toBe(true);
    expect(LOG_REFUSAL.backwards).toContain("end date");
    expect(LOG_REFUSAL.overlap).toContain("overlaps");
  });
});

describe("the length the user states", () => {
  const stated = (days: number | null, ...specs: Spec[]): CycleState => {
    const base = cycleWith(...specs);
    return { ...base, settings: { ...base.settings, cycleLength: days } };
  };

  it("lets the estimate appear from a single logged period", () => {
    // The whole point: not making somebody log three cycles before the
    // calendar is any use to them.
    const estimate = estimateNext(stated(25, "2026-08-14"));

    expect(estimate?.typicalGap).toBe(25);
    expect(estimate?.nextStart).toBe("2026-09-08");
    expect(estimate?.source).toBe("stated");
    expect(estimate?.basedOn).toBe(0);
  });

  it("still says nothing with no period logged at all", () => {
    // A length on its own has no date to count from.
    expect(estimateNext(stated(25))).toBeNull();
  });

  it("steps aside as soon as the user's own gaps can answer", () => {
    const estimate = estimateNext(stated(25, "2026-01-01", "2026-01-29", "2026-02-26"));

    expect(estimate?.typicalGap).toBe(28);
    expect(estimate?.source).toBe("logged");
  });

  it("falls back to the stated figure when the logged gaps are all implausible", () => {
    const estimate = estimateNext(stated(25, "2020-01-01", "2022-01-01", "2024-01-01"));

    expect(estimate?.source).toBe("stated");
    expect(estimate?.typicalGap).toBe(25);
  });

  it("ignores a figure outside the range a cycle length can be", () => {
    expect(estimateNext(stated(3, "2026-08-14"))).toBeNull();
    expect(estimateNext(stated(400, "2026-08-14"))).toBeNull();
  });

  it("clamps and rounds what the field accepts", () => {
    expect(clampStatedCycleLength(25)).toBe(25);
    expect(clampStatedCycleLength(24.6)).toBe(25);
    expect(clampStatedCycleLength(3)).toBeNull();
    expect(clampStatedCycleLength(400)).toBeNull();
    expect(clampStatedCycleLength(Number.NaN)).toBeNull();
  });

  it("reads a stated length back in weeks, which is how people say it", () => {
    expect(formatWeeksAndDays(25)).toBe("3 weeks and 4 days");
  });
});
