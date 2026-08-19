import { describe, expect, it } from "vitest";

import { MIN_ENTRIES_FOR_ESTIMATE, entryOn, estimateNext, gaps, isLoggedStart, sortedEntries } from "./cycle";
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
