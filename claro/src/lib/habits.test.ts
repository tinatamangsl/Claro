import { describe, expect, it } from "vitest";

import {
  activeHabits,
  reorderHabits,
  archiveHabit,
  archivedHabits,
  completedDays,
  consistencyLabel,
  countCompletions,
  createHabit,
  isDoneOn,
  removeHabitCompletions,
  restoreHabit,
  toggleCompletion,
} from "./habits";
import type { Habit, HabitCompletion } from "./types";

const NOW = new Date("2026-08-18T09:00:00.000Z");
const DAYS = ["2026-08-17", "2026-08-18", "2026-08-19"];

const habit = (patch: Partial<Habit> = {}): Habit => ({
  id: "h1",
  name: "Meditate",
  createdAt: NOW.toISOString(),
  archivedAt: null,
  ...patch,
});

describe("creating habits", () => {
  it("trims the name and stamps the clock it was given", () => {
    const h = createHabit("  Read ten pages  ", NOW)!;

    expect(h.name).toBe("Read ten pages");
    expect(h.createdAt).toBe(NOW.toISOString());
    expect(h.archivedAt).toBeNull();
    expect(h.id).toBeTruthy();
  });

  it("refuses a blank name rather than creating an unnamed habit", () => {
    expect(createHabit("   ", NOW)).toBeNull();
  });

  it("gives each habit its own id", () => {
    expect(createHabit("A", NOW)!.id).not.toBe(createHabit("B", NOW)!.id);
  });
});

describe("archiving and restoring", () => {
  it("archives without deleting", () => {
    const archived = archiveHabit(habit(), NOW);

    expect(archived.archivedAt).toBe(NOW.toISOString());
    expect(archived.name).toBe("Meditate");
  });

  it("keeps archived habits out of the daily list but findable", () => {
    const habits = { h1: habit(), h2: archiveHabit(habit({ id: "h2", name: "Run" }), NOW) };

    expect(activeHabits(habits).map((h) => h.id)).toEqual(["h1"]);
    expect(archivedHabits(habits).map((h) => h.id)).toEqual(["h2"]);
  });

  it("restores an archived habit", () => {
    expect(restoreHabit(archiveHabit(habit(), NOW)).archivedAt).toBeNull();
  });

  it("orders the daily list by when each was created", () => {
    const habits = {
      b: habit({ id: "b", createdAt: "2026-08-02T00:00:00.000Z" }),
      a: habit({ id: "a", createdAt: "2026-08-01T00:00:00.000Z" }),
    };

    expect(activeHabits(habits).map((h) => h.id)).toEqual(["a", "b"]);
  });
});

describe("daily completion", () => {
  it("marks a habit done for one day only", () => {
    const done = toggleCompletion({}, "h1", "2026-08-18", NOW);

    expect(isDoneOn(done, "h1", "2026-08-18")).toBe(true);
    expect(isDoneOn(done, "h1", "2026-08-19")).toBe(false);
  });

  it("toggles back off without leaving a row behind", () => {
    const on = toggleCompletion({}, "h1", "2026-08-18", NOW);
    const off = toggleCompletion(on, "h1", "2026-08-18", NOW);

    expect(off).toEqual({});
  });

  it("never records the same habit twice in one day", () => {
    let c = toggleCompletion({}, "h1", "2026-08-18", NOW);
    c = toggleCompletion(c, "h1", "2026-08-18", NOW);
    c = toggleCompletion(c, "h1", "2026-08-18", NOW);

    expect(Object.keys(c)).toHaveLength(1);
  });

  it("keeps other habits and other days untouched", () => {
    let c = toggleCompletion({}, "h1", "2026-08-18", NOW);
    c = toggleCompletion(c, "h2", "2026-08-18", NOW);
    c = toggleCompletion(c, "h1", "2026-08-17", NOW);

    expect(Object.keys(c)).toHaveLength(3);
    expect(isDoneOn(c, "h2", "2026-08-18")).toBe(true);
  });

  it("stamps the injected clock, not its own", () => {
    const c = toggleCompletion({}, "h1", "2026-08-18", NOW);

    expect(c["h1:2026-08-18"].completedAt).toBe(NOW.toISOString());
  });
});

describe("gentle consistency", () => {
  const filled = (): Record<string, HabitCompletion> => {
    let c = toggleCompletion({}, "h1", "2026-08-17", NOW);
    c = toggleCompletion(c, "h1", "2026-08-19", NOW);
    return c;
  };

  it("counts only the days it was actually done", () => {
    expect(countCompletions(filled(), "h1", DAYS)).toBe(2);
  });

  it("counts zero for a habit with no history", () => {
    expect(countCompletions(filled(), "h2", DAYS)).toBe(0);
  });

  it("ignores completions outside the range asked for", () => {
    expect(countCompletions(filled(), "h1", ["2026-08-18"])).toBe(0);
  });

  it("aggregates completions per day for the calendar", () => {
    let c = filled();
    c = toggleCompletion(c, "h2", "2026-08-17", NOW);

    expect(completedDays(c, DAYS)).toEqual({
      "2026-08-17": 2,
      "2026-08-18": 0,
      "2026-08-19": 1,
    });
  });

  it("speaks in counts, never streaks", () => {
    expect(consistencyLabel(4, "week")).toBe("4 days this week");
    expect(consistencyLabel(1, "week")).toBe("1 day this week");
    expect(consistencyLabel(12, "month")).toBe("12 times this month");
    expect(consistencyLabel(0, "week")).toBe("None yet this week");
    expect(consistencyLabel(0, "month")).toBe("None yet this month");
  });
});

describe("deleting a habit", () => {
  it("takes its history with it and leaves everything else", () => {
    let c = toggleCompletion({}, "h1", "2026-08-18", NOW);
    c = toggleCompletion(c, "h2", "2026-08-18", NOW);

    const pruned = removeHabitCompletions(c, "h1");

    expect(isDoneOn(pruned, "h1", "2026-08-18")).toBe(false);
    expect(isDoneOn(pruned, "h2", "2026-08-18")).toBe(true);
  });
});

describe("ordering habits", () => {
  const habit = (id: string, order?: number, createdAt = "2026-08-01T09:00:00.000Z") => ({
    id,
    name: id,
    createdAt,
    archivedAt: null,
    ...(order === undefined ? {} : { order }),
  });

  it("sorts by explicit order", () => {
    const habits = { a: habit("a", 2), b: habit("b", 0), c: habit("c", 1) };

    expect(activeHabits(habits).map((h) => h.id)).toEqual(["b", "c", "a"]);
  });

  it("leaves habits saved before ordering existed in creation order", () => {
    const habits = {
      a: habit("a", undefined, "2026-08-03T09:00:00.000Z"),
      b: habit("b", undefined, "2026-08-01T09:00:00.000Z"),
    };

    expect(activeHabits(habits).map((h) => h.id)).toEqual(["b", "a"]);
  });

  it("puts explicitly ordered habits before unordered ones", () => {
    const habits = { a: habit("a"), b: habit("b", 0) };

    expect(activeHabits(habits).map((h) => h.id)).toEqual(["b", "a"]);
  });

  it("renumbers only the habits whose position actually changed", () => {
    // a is already 0 and c is already 2; only b's number is wrong for its slot.
    const patches = reorderHabits([habit("a", 0), habit("b", 5), habit("c", 2)]);

    expect(patches).toEqual({ b: { order: 1 } });
  });

  it("gives every habit an order when none had one", () => {
    expect(reorderHabits([habit("a"), habit("b")])).toEqual({
      a: { order: 0 },
      b: { order: 1 },
    });
  });
});
