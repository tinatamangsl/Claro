import { describe, expect, it } from "vitest";

import {
  isIntendedDay,
  weekAgainstIntent,
  weekLabel,
  weekdayOf,
  weeklyIntent,
} from "./habits";
import type { Habit, HabitCompletion, ISODate } from "./types";

const habit = (patch: Partial<Habit> = {}): Habit => ({
  id: "h1",
  name: "Run",
  createdAt: "2026-09-01T09:00:00.000Z",
  archivedAt: null,
  ...patch,
});

/** Monday 14 September 2026 through Sunday the 20th. */
const WEEK: ISODate[] = [
  "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17",
  "2026-09-18", "2026-09-19", "2026-09-20",
];

const done = (...dayIds: ISODate[]): Record<string, HabitCompletion> =>
  Object.fromEntries(
    dayIds.map((dayId) => [
      `h1:${dayId}`,
      { id: `h1:${dayId}`, habitId: "h1", dayId, completedAt: "x" },
    ]),
  );

describe("what the user said they were aiming for", () => {
  it("has no intention until one is set, which is not a gap to fill", () => {
    expect(weeklyIntent(habit())).toBeNull();
    expect(weeklyIntent(habit({ targetPerWeek: null }))).toBeNull();
    // A zero is somebody clearing it, not aiming for nothing.
    expect(weeklyIntent(habit({ targetPerWeek: 0 }))).toBeNull();
  });

  it("reads a plain count when no days are pinned", () => {
    expect(weeklyIntent(habit({ targetPerWeek: 4 }))).toEqual({ days: null, count: 4 });
  });

  it("lets pinned days carry the count, rather than letting the two disagree", () => {
    /*
     * Saying "Mondays and Thursdays" already says "twice". If the stored count
     * could contradict the days, a row would read "1 of 5" with two days
     * marked, which is a puzzle rather than a prompt.
     */
    const pinned = habit({ targetDays: [4, 1], targetPerWeek: 5 });
    expect(weeklyIntent(pinned)).toEqual({ days: [1, 4], count: 2 });
  });

  it("cannot ask for more days than a week has", () => {
    expect(weeklyIntent(habit({ targetPerWeek: 99 }))?.count).toBe(7);
  });
});

describe("which day is which", () => {
  it("counts Monday as 1 and Sunday as 7, matching the grid", () => {
    expect(weekdayOf("2026-09-14")).toBe(1);
    expect(weekdayOf("2026-09-20")).toBe(7);
  });

  it("marks only the pinned days as intended", () => {
    const pinned = habit({ targetDays: [1, 4] });
    expect(isIntendedDay(pinned, "2026-09-14")).toBe(true);
    expect(isIntendedDay(pinned, "2026-09-17")).toBe(true);
    expect(isIntendedDay(pinned, "2026-09-16")).toBe(false);
    // A count with no pinned days makes no day more intended than another.
    expect(isIntendedDay(habit({ targetPerWeek: 3 }), "2026-09-14")).toBe(false);
  });
});

describe("the week against the intention", () => {
  it("counts a day that happened even when it was not one of the pinned ones", () => {
    const pinned = habit({ targetDays: [1, 4] });
    const kept = weekAgainstIntent(pinned, done("2026-09-14", "2026-09-16"), WEEK);

    /*
     * Doing it on an unplanned day is still doing it. A report that ignored
     * those would be telling somebody they had not done a thing they had.
     */
    expect(kept).toEqual({ kept: 2, intended: 2, onIntended: 1 });
  });

  it("says the plain count when nothing was aimed for", () => {
    expect(weekLabel(habit(), done("2026-09-14", "2026-09-15"), WEEK)).toBe("2 days this week");
    expect(weekLabel(habit(), {}, WEEK)).toBe("None yet this week");
  });

  it("states what happened beside what was meant, and stops", () => {
    const label = weekLabel(habit({ targetPerWeek: 4 }), done("2026-09-14", "2026-09-15"), WEEK);
    expect(label).toBe("2 of 4 days this week");

    /*
     * The standing rule for this feature. A number somebody set themselves is
     * information; the same number with a judgement attached is a scold.
     */
    for (const banned of ["only", "missed", "failed", "behind", "streak", "broke"]) {
      expect(label.toLowerCase()).not.toContain(banned);
    }
  });

  it("does not turn a good week into a score above the target", () => {
    // Five days against an intention of four reads as five of four, not 125%.
    expect(weekLabel(habit({ targetPerWeek: 4 }), done(...WEEK.slice(0, 5)), WEEK))
      .toBe("5 of 4 days this week");
  });
});
