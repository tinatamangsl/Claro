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
  monthsOfQuarter,
  monthsOfYear,
  quarterOfMonth,
  shiftMonthId,
  summariseDay,
  summariseMonth,
  summariseQuarter,
  summariseYear,
  yearOfMonth,
  formatFocusTotal,
} from "./calendar";
import { blankDay, blankPriority, emptyState } from "./storage";
import {
  habitCompletionId,
  type ClaroState,
  type Day,
  type FocusSession,
  type Habit,
  type HabitCompletion,
} from "./types";

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

// ------------------------------------------------------------- aggregation

const focusSession = (dayId: string, minutes: number, i = 0): FocusSession => ({
  id: `f${dayId}-${i}`,
  dayId,
  priority: null,
  target: null,
  intention: "",
  plannedMs: 25 * 60_000,
  startedAt: `${dayId}T09:00:00.000Z`,
  timeZone: "UTC",
  phase: "closed",
  elapsedBeforeMs: minutes * 60_000,
  segmentStartedAt: null,
  returnBlockEndsAt: null,
  endedAt: `${dayId}T09:30:00.000Z`,
  outcome: "completed",
});

const dayRecord = (id: string, patch: Partial<Day> = {}): Day => ({
  ...blankDay(id),
  ...patch,
});

const written = (id: string, text: string, done: boolean, goal: Day["priority1"]["goal"] = null) => ({
  ...blankPriority(),
  id,
  text,
  done,
  goal,
  originDayId: "2026-08-03",
});

const stateWith = (patch: Partial<ClaroState> = {}): ClaroState => ({
  ...emptyState(),
  ...patch,
});

describe("summarising one day", () => {
  const habits = [habit("a"), habit("b")];

  it("reads every count from the canonical records", () => {
    const state = stateWith({
      days: {
        "2026-08-03": dayRecord("2026-08-03", {
          priority1: written("p1", "Ship it", true),
          priority2: written("p2", "Read", false),
          actions: [
            { id: "a1", text: "Email", bucket: "task", done: true, createdAt: "x" },
            { id: "a2", text: "Call", bucket: "task", done: false, createdAt: "x" },
          ],
          scheduleItems: [
            { id: "s1", time: "09:00", text: "Ship it", link: { kind: "priority", priorityId: "p1" }, done: false },
            { id: "s2", time: "13:00", text: "Lunch", link: null, done: false },
          ],
        }),
      },
      habitCompletions: done(["a", "2026-08-03"]),
      focusSessions: { f1: focusSession("2026-08-03", 50) },
    });

    expect(summariseDay(state, "2026-08-03", habits)).toMatchObject({
      habitsDone: 1,
      habitsTotal: 2,
      prioritiesDone: 1,
      prioritiesSet: 2,
      actionsDone: 1,
      actionsTotal: 2,
      // The linked row resolves to the priority, which is done.
      scheduleDone: 1,
      scheduleTotal: 2,
      focusMs: 50 * 60_000,
      focusSessions: 1,
      empty: false,
    });
  });

  it("calls a day with nothing on it empty", () => {
    expect(summariseDay(emptyState(), "2026-08-03", habits).empty).toBe(true);
  });

  it("counts a day that has only focus time as not empty", () => {
    const state = stateWith({ focusSessions: { f1: focusSession("2026-08-03", 25) } });

    expect(summariseDay(state, "2026-08-03", habits).empty).toBe(false);
  });

  it("ignores a blank priority slot", () => {
    const state = stateWith({
      days: { "2026-08-03": dayRecord("2026-08-03", { priority1: blankPriority() }) },
    });

    expect(summariseDay(state, "2026-08-03", habits).prioritiesSet).toBe(0);
  });

  it("banks only settled focus time, so a total never moves as it is read", () => {
    const running: FocusSession = {
      ...focusSession("2026-08-03", 10),
      phase: "running",
      segmentStartedAt: "2026-08-03T09:00:00.000Z",
    };

    expect(summariseDay(stateWith({ focusSessions: { f: running } }), "2026-08-03", habits).focusMs)
      .toBe(10 * 60_000);
  });
});

describe("summarising a month", () => {
  const habits = [habit("a")];

  it("totals the days and reports per-habit consistency", () => {
    const state = stateWith({
      days: {
        "2026-08-03": dayRecord("2026-08-03", { priority1: written("p1", "Ship it", true) }),
        "2026-08-04": dayRecord("2026-08-04", { priority1: written("p2", "Read", true) }),
      },
      habitCompletions: done(["a", "2026-08-03"], ["a", "2026-08-10"]),
      focusSessions: { f1: focusSession("2026-08-03", 25), f2: focusSession("2026-08-04", 50, 1) },
    });

    const month = summariseMonth(state, "2026-08", habits);

    expect(month.prioritiesDone).toBe(2);
    expect(month.habitsKept).toBe(2);
    expect(month.daysWithHabit).toBe(2);
    expect(month.focusMs).toBe(75 * 60_000);
    expect(month.focusSessions).toBe(2);
    expect(month.perHabit[0]).toMatchObject({ kept: 2, of: 31 });
    expect(month.empty).toBe(false);
  });

  it("is empty when the month holds nothing", () => {
    const month = summariseMonth(emptyState(), "2026-08", habits);

    expect(month.empty).toBe(true);
    expect(month.habitsKept).toBe(0);
    expect(month.days).toHaveLength(31);
  });

  it("counts nothing from a neighbouring month", () => {
    const state = stateWith({ habitCompletions: done(["a", "2026-07-31"], ["a", "2026-09-01"]) });

    expect(summariseMonth(state, "2026-08", habits).habitsKept).toBe(0);
  });
});

describe("summarising a quarter", () => {
  const habits = [habit("a")];

  it("covers its three months and nothing else", () => {
    const state = stateWith({
      habitCompletions: done(
        ["a", "2026-07-01"],
        ["a", "2026-08-01"],
        ["a", "2026-09-01"],
        ["a", "2026-10-01"],
      ),
    });

    const quarter = summariseQuarter(state, "2026-Q3", habits);

    expect(quarter.months.map((m) => m.monthId)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(quarter.habitsKept).toBe(3);
  });

  it("reports progress for each linked goal separately", () => {
    const state = stateWith({
      quarters: {
        "2026-Q3": {
          id: "2026-Q3",
          work: {
            mainQuest: "Take Claro to real users",
            sideQuests: [{ id: "s1", text: "Write the launch note", done: false }],
          },
          life: { mainQuest: "Get properly strong again", sideQuests: [] },
        },
      },
      days: {
        "2026-08-03": dayRecord("2026-08-03", {
          priority1: written("p1", "Ship it", true, { category: "workMain" }),
          priority2: written("p2", "Draft it", false, { category: "workSide", sideQuestId: "s1" }),
          priority3: written("p3", "Run", true, { category: "lifeMain" }),
        }),
        "2026-08-04": dayRecord("2026-08-04", {
          priority1: written("p4", "Ship more", false, { category: "workMain" }),
        }),
      },
    });

    const goals = summariseQuarter(state, "2026-Q3", habits).goals;

    expect(goals.map((g) => [g.category, g.title, g.done, g.linked])).toEqual([
      ["workMain", "Take Claro to real users", 1, 2],
      ["lifeMain", "Get properly strong again", 1, 1],
      ["workSide", "Write the launch note", 0, 1],
    ]);
  });

  it("keeps a goal whose words have gone, rather than dropping the work", () => {
    const state = stateWith({
      days: {
        "2026-08-03": dayRecord("2026-08-03", {
          priority1: written("p1", "Ship it", true, { category: "workMain" }),
        }),
      },
    });

    const goals = summariseQuarter(state, "2026-Q3", habits).goals;
    expect(goals).toHaveLength(1);
    expect(goals[0].title).toBe("");
    expect(goals[0].done).toBe(1);
  });

  it("is empty, with no goals, when the quarter holds nothing", () => {
    const quarter = summariseQuarter(emptyState(), "2026-Q3", habits);

    expect(quarter.empty).toBe(true);
    expect(quarter.goals).toEqual([]);
  });
});

describe("summarising a year", () => {
  const habits = [habit("a")];

  it("covers twelve months and four quarters", () => {
    const year = summariseYear(emptyState(), 2026, habits);

    expect(year.months).toHaveLength(12);
    expect(year.months[0].monthId).toBe("2026-01");
    expect(year.months[11].monthId).toBe("2026-12");
    expect(year.quarters).toEqual(["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"]);
  });

  it("counts nothing from the year either side of it", () => {
    const state = stateWith({
      habitCompletions: done(["a", "2025-12-31"], ["a", "2026-01-01"], ["a", "2027-01-01"]),
    });

    expect(summariseYear(state, 2026, habits).habitsKept).toBe(1);
  });

  it("totals across December and January without leaking between years", () => {
    const state = stateWith({
      focusSessions: {
        a: focusSession("2026-12-31", 30),
        b: focusSession("2027-01-01", 45, 1),
      },
    });

    expect(summariseYear(state, 2026, habits).focusMs).toBe(30 * 60_000);
    expect(summariseYear(state, 2027, habits).focusMs).toBe(45 * 60_000);
  });

  it("is empty for a year with nothing in it", () => {
    expect(summariseYear(emptyState(), 2026, habits).empty).toBe(true);
  });
});

describe("period identities", () => {
  it("maps a month to its quarter", () => {
    expect(quarterOfMonth("2026-01")).toBe("2026-Q1");
    expect(quarterOfMonth("2026-03")).toBe("2026-Q1");
    expect(quarterOfMonth("2026-04")).toBe("2026-Q2");
    expect(quarterOfMonth("2026-12")).toBe("2026-Q4");
  });

  it("lists the months of a quarter and a year", () => {
    expect(monthsOfQuarter("2026-Q4")).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(monthsOfYear(2026)).toHaveLength(12);
  });

  it("reads the year off a month", () => {
    expect(yearOfMonth("2026-08")).toBe(2026);
  });
});

describe("formatting a focus total", () => {
  it("says none rather than showing a zero", () => {
    expect(formatFocusTotal(0)).toBe("none");
  });

  it("reads in minutes below an hour, and in hours above", () => {
    expect(formatFocusTotal(45 * 60_000)).toBe("45m");
    expect(formatFocusTotal(60 * 60_000)).toBe("1h");
    expect(formatFocusTotal(135 * 60_000)).toBe("2h 15m");
  });
});

describe("one aggregation, no conflicting totals", () => {
  const habits = [habit("a")];

  const busyState = (): ClaroState =>
    stateWith({
      days: {
        "2026-07-06": dayRecord("2026-07-06", {
          priority1: written("p1", "Ship it", true, { category: "workMain" }),
        }),
        "2026-08-03": dayRecord("2026-08-03", {
          priority1: written("p2", "Read", true),
          actions: [{ id: "a1", text: "Email", bucket: "task", done: true, createdAt: "x" }],
        }),
        "2026-09-15": dayRecord("2026-09-15", {
          priority1: written("p3", "Plan", false),
        }),
      },
      habitCompletions: done(["a", "2026-07-06"], ["a", "2026-08-03"], ["a", "2026-08-04"]),
      focusSessions: {
        f1: focusSession("2026-07-06", 25),
        f2: focusSession("2026-08-03", 50, 1),
      },
    });

  it("gives the same month totals whether read alone or through the quarter", () => {
    const state = busyState();
    const alone = summariseMonth(state, "2026-08", habits);
    const viaQuarter = summariseQuarter(state, "2026-Q3", habits).months.find(
      (m) => m.monthId === "2026-08",
    );

    expect(viaQuarter).toEqual(alone);
  });

  it("gives the same month totals whether read alone or through the year", () => {
    const state = busyState();
    const alone = summariseMonth(state, "2026-08", habits);
    const viaYear = summariseYear(state, 2026, habits).months.find(
      (m) => m.monthId === "2026-08",
    );

    expect(viaYear).toEqual(alone);
  });

  it("makes the quarter total the sum of its months", () => {
    const state = busyState();
    const quarter = summariseQuarter(state, "2026-Q3", habits);
    const summed = quarter.months.reduce((n, m) => n + m.prioritiesDone, 0);

    expect(quarter.prioritiesDone).toBe(summed);
    expect(quarter.focusMs).toBe(quarter.months.reduce((n, m) => n + m.focusMs, 0));
  });

  it("makes the year total the sum of its months", () => {
    const state = busyState();
    const year = summariseYear(state, 2026, habits);

    expect(year.habitsKept).toBe(year.months.reduce((n, m) => n + m.habitsKept, 0));
    expect(year.focusMs).toBe(year.months.reduce((n, m) => n + m.focusMs, 0));
  });
});

describe("reflecting changes made elsewhere", () => {
  const habits = [habit("a")];
  const base = () =>
    stateWith({
      days: {
        "2026-08-03": dayRecord("2026-08-03", {
          priority1: written("p1", "Ship it", false, { category: "workMain" }),
          actions: [{ id: "a1", text: "Email", bucket: "task", done: false, createdAt: "x" }],
          scheduleItems: [
            { id: "s1", time: "09:00", text: "Ship it", link: { kind: "priority", priorityId: "p1" }, done: false },
          ],
        }),
      },
    });

  it("counts a priority the moment it is completed on Today", () => {
    const before = summariseMonth(base(), "2026-08", habits);
    expect(before.prioritiesDone).toBe(0);

    const after = base();
    after.days["2026-08-03"].priority1.done = true;

    const month = summariseMonth(after, "2026-08", habits);
    expect(month.prioritiesDone).toBe(1);
    // The linked schedule row follows the priority, without a second write.
    expect(month.scheduleDone).toBe(1);
  });

  it("counts an action completed in an action bucket", () => {
    const state = base();
    state.days["2026-08-03"].actions[0].done = true;

    expect(summariseMonth(state, "2026-08", habits).actionsDone).toBe(1);
  });

  it("counts focus time recorded by a session", () => {
    const state = base();
    state.focusSessions = { f: focusSession("2026-08-03", 40) };

    expect(summariseMonth(state, "2026-08", habits).focusMs).toBe(40 * 60_000);
  });

  it("moves goal progress with the priority when its link changes", () => {
    const state = base();
    state.days["2026-08-03"].priority1.goal = { category: "lifeMain" };
    state.days["2026-08-03"].priority1.done = true;

    const goals = summariseQuarter(state, "2026-Q3", habits).goals;
    expect(goals.map((g) => g.category)).toEqual(["lifeMain"]);
  });
});

describe("year boundaries", () => {
  const habits = [habit("a")];

  it("puts December and January in the right quarters", () => {
    expect(quarterOfMonth("2026-12")).toBe("2026-Q4");
    expect(quarterOfMonth("2027-01")).toBe("2027-Q1");
  });

  it("steps from December into the next January", () => {
    expect(shiftMonthId("2026-12", 1)).toBe("2027-01");
    expect(monthsOfQuarter("2026-Q4")).toEqual(["2026-10", "2026-11", "2026-12"]);
  });

  it("keeps a 31 December day out of the following year", () => {
    const state = stateWith({
      days: {
        "2026-12-31": dayRecord("2026-12-31", { priority1: written("p1", "Ship it", true) }),
      },
    });

    expect(summariseYear(state, 2026, habits).prioritiesDone).toBe(1);
    expect(summariseYear(state, 2027, habits).prioritiesDone).toBe(0);
  });

  it("handles a leap year February", () => {
    expect(summariseMonth(emptyState(), "2028-02", habits).daysInMonth).toBe(29);
  });
});
