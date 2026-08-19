import { describe, expect, it } from "vitest";

import {
  consistency,
  daysWithAnyCompletion,
  formatMonthId,
  formatMonthLong,
  monthCompletions,
  monthDayIds,
  monthGrid,
  monthOfDay,
  shiftMonthId,
} from "./calendar";
import { habitCompletionId, type Habit, type HabitCompletion } from "./types";

const habit = (id: string): Habit => ({
  id,
  name: id,
  createdAt: "2026-01-01T09:00:00.000Z",
  archivedAt: null,
});

const done = (...pairs: [string, string][]): Record<string, HabitCompletion> =>
  Object.fromEntries(
    pairs.map(([habitId, dayId]) => [
      habitCompletionId(habitId, dayId),
      { id: habitCompletionId(habitId, dayId), habitId, dayId, completedAt: "x" },
    ]),
  );

describe("month ids", () => {
  it("formats and shifts", () => {
    expect(formatMonthId(new Date(2026, 7, 19))).toBe("2026-08");
    expect(shiftMonthId("2026-08", 1)).toBe("2026-09");
    expect(shiftMonthId("2026-01", -1)).toBe("2025-12");
  });

  it("crosses a year boundary in both directions", () => {
    expect(shiftMonthId("2026-12", 1)).toBe("2027-01");
    expect(shiftMonthId("2027-01", -1)).toBe("2026-12");
  });

  it("reads the month from a day id", () => {
    expect(monthOfDay("2026-08-19")).toBe("2026-08");
  });

  it("names the month for a reader", () => {
    expect(formatMonthLong("2026-08")).toBe("August 2026");
  });
});

describe("the month grid", () => {
  it("is always six Monday-first weeks, so the page never reflows", () => {
    for (const id of ["2026-02", "2026-08", "2027-01"]) {
      expect(monthGrid(id)).toHaveLength(42);
    }
  });

  it("starts on a Monday", () => {
    const first = monthGrid("2026-08")[0].dayId;
    expect(new Date(first + "T00:00:00").getDay()).toBe(1);
  });

  it("marks the padding days as outside the month", () => {
    const grid = monthGrid("2026-08");
    const inside = grid.filter((c) => c.inMonth);

    // August 2026 has 31 days.
    expect(inside).toHaveLength(31);
    expect(inside[0].dayId).toBe("2026-08-01");
    expect(inside.at(-1)?.dayId).toBe("2026-08-31");
  });

  it("covers every day of the month exactly once", () => {
    const days = monthDayIds("2026-02");
    expect(days).toHaveLength(28);
    expect(new Set(days).size).toBe(28);
  });

  it("handles a leap February", () => {
    expect(monthDayIds("2028-02")).toHaveLength(29);
  });
});

describe("month completions", () => {
  const habits = [habit("a"), habit("b")];

  it("counts how many habits were kept on each day", () => {
    const result = monthCompletions(
      habits,
      done(["a", "2026-08-03"], ["b", "2026-08-03"], ["a", "2026-08-04"]),
      "2026-08",
    );

    expect(result["2026-08-03"]).toEqual({ done: 2, total: 2, complete: true });
    expect(result["2026-08-04"]).toEqual({ done: 1, total: 2, complete: false });
    expect(result["2026-08-05"]).toEqual({ done: 0, total: 2, complete: false });
  });

  it("is never complete when there are no habits to keep", () => {
    const result = monthCompletions([], {}, "2026-08");

    expect(result["2026-08-01"]).toEqual({ done: 0, total: 0, complete: false });
  });

  it("ignores completions from another month", () => {
    const result = monthCompletions(habits, done(["a", "2026-07-31"]), "2026-08");

    expect(Object.values(result).every((d) => d.done === 0)).toBe(true);
  });

  it("counts the days on which anything at all was kept", () => {
    const completions = done(["a", "2026-08-03"], ["b", "2026-08-03"], ["a", "2026-08-10"]);

    expect(daysWithAnyCompletion(habits, completions, "2026-08")).toBe(2);
  });
});

describe("consistency counts", () => {
  it("reports the week, the month and the quarter", () => {
    // 17–19 August 2026 is Mon–Wed of the same ISO week.
    const completions = done(
      ["a", "2026-08-17"],
      ["a", "2026-08-18"],
      ["a", "2026-08-01"],
      ["a", "2026-07-04"],
    );

    expect(consistency(completions, "a", "2026-08-19")).toEqual({
      week: 2,
      month: 3,
      quarter: 4,
    });
  });

  it("is zero for a habit with no history, rather than absent", () => {
    expect(consistency({}, "a", "2026-08-19")).toEqual({ week: 0, month: 0, quarter: 0 });
  });

  it("counts only the anchor's own quarter", () => {
    // 30 June is Q2; the anchor is in Q3.
    const completions = done(["a", "2026-06-30"], ["a", "2026-08-19"]);

    expect(consistency(completions, "a", "2026-08-19").quarter).toBe(1);
  });

  it("never reports a streak or a best run", () => {
    const result = consistency(done(["a", "2026-08-19"]), "a", "2026-08-19");

    expect(Object.keys(result).sort()).toEqual(["month", "quarter", "week"]);
  });
});
