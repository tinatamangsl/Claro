import { describe, expect, it } from "vitest";

import {
  blockItem,
  canEditText,
  linkedItem,
  resolveScheduleItem,
  scheduleHabitToggle,
  settleHours,
  toggleScheduleItem,
} from "./schedule";
import { blankDay, blankPriority } from "./storage";
import {
  habitCompletionId,
  type ActionItem,
  type Day,
  type Habit,
  type HabitCompletion,
  type Priority,
  type ScheduleItem,
} from "./types";

const at = (id: string, time: string, text = id): ScheduleItem => ({
  id,
  time,
  text,
  link: null,
  done: false,
});

describe("settleHours", () => {
  it("leaves an unchanged schedule alone", () => {
    const items = [at("a", "09:00"), at("b", "13:00")];
    expect(settleHours(items, items)).toBe(items);
  });

  it("allows a move to an empty hour", () => {
    const before = [at("a", "09:00")];
    const after = [at("a", "11:00")];

    expect(settleHours(before, after)).toEqual([at("a", "11:00")]);
  });

  it("swaps when the destination hour is already taken", () => {
    const before = [at("a", "09:00"), at("b", "13:00")];
    const after = [at("a", "13:00"), at("b", "13:00")];

    expect(settleHours(before, after)).toEqual([at("a", "13:00"), at("b", "09:00")]);
  });

  it("never leaves two entries on one hour", () => {
    const before = [at("a", "09:00"), at("b", "13:00"), at("c", "16:00")];
    const after = [at("a", "16:00"), at("b", "13:00"), at("c", "16:00")];

    const times = settleHours(before, after).map((i) => i.time);
    expect(new Set(times).size).toBe(times.length);
  });

  it("keeps every entry", () => {
    const before = [at("a", "09:00"), at("b", "13:00")];
    const after = [at("a", "13:00"), at("b", "13:00")];

    expect(settleHours(before, after).map((i) => i.id).sort()).toEqual(["a", "b"]);
  });

  it("ignores an entry that is new rather than moved", () => {
    const before = [at("a", "09:00")];
    const after = [at("a", "09:00"), at("new", "09:00")];

    expect(settleHours(before, after)).toBe(after);
  });
});

// ------------------------------------------------------- linked and standalone

const priority = (id: string, text: string, done = false): Priority => ({
  ...blankPriority(),
  id,
  text,
  done,
  originDayId: "2026-08-19",
});

const action = (id: string, text: string, done = false): ActionItem => ({
  id,
  text,
  bucket: "task",
  done,
  createdAt: "x",
});

const habit = (id: string, name: string, archivedAt: string | null = null): Habit => ({
  id,
  name,
  createdAt: "2026-08-01T09:00:00.000Z",
  archivedAt,
});

const dayWith = (patch: Partial<Day>): Day => ({ ...blankDay("2026-08-19"), ...patch });

const completionsFor = (habitId: string, dayId: string): Record<string, HabitCompletion> => ({
  [habitCompletionId(habitId, dayId)]: {
    id: habitCompletionId(habitId, dayId),
    habitId,
    dayId,
    completedAt: "x",
  },
});

const resolveOne = (
  day: Day,
  habits: Record<string, Habit> = {},
  completions: Record<string, HabitCompletion> = {},
) => resolveScheduleItem(day.scheduleItems[0], day, habits, completions);

describe("reading a standalone block", () => {
  const day = () =>
    dayWith({ scheduleItems: [{ ...blockItem("09:00", "Deep work"), id: "s1" }] });

  it("owns its own words and its own completion", () => {
    const row = resolveOne(day());

    expect(row.kind).toBe("block");
    expect(row.title).toBe("Deep work");
    expect(row.done).toBe(false);
    expect(row.available).toBe(true);
  });

  it("ticks and unticks only itself", () => {
    const ticked = toggleScheduleItem(day(), "s1");
    expect(ticked.scheduleItems[0].done).toBe(true);

    expect(toggleScheduleItem(ticked, "s1").scheduleItems[0].done).toBe(false);
  });

  it("is editable, unlike a reference", () => {
    expect(canEditText(day().scheduleItems[0])).toBe(true);
  });

  it("reports no habit to toggle", () => {
    expect(scheduleHabitToggle(day(), "s1")).toBeNull();
  });
});

describe("a row linked to a priority", () => {
  const day = (done = false) =>
    dayWith({
      priority1: priority("p1", "Ship the store", done),
      scheduleItems: [
        { ...linkedItem("09:00", { kind: "priority", priorityId: "p1" }, "Ship the store"), id: "s1" },
      ],
    });

  it("reads its title and completion from the priority, not from itself", () => {
    const row = resolveOne(day(true));

    expect(row.kind).toBe("priority");
    expect(row.title).toBe("Ship the store");
    expect(row.done).toBe(true);
  });

  it("shows the priority's current words after it is edited", () => {
    const renamed = dayWith({
      ...day(),
      priority1: priority("p1", "Ship the store, properly"),
    });

    expect(resolveOne(renamed).title).toBe("Ship the store, properly");
  });

  it("completes the priority when ticked from the schedule", () => {
    const next = toggleScheduleItem(day(), "s1");

    expect(next.priority1.done).toBe(true);
    // The row keeps no completion of its own, so there is only one answer.
    expect(next.scheduleItems[0].done).toBe(false);
  });

  it("shows as complete the moment the priority is completed elsewhere", () => {
    const completedInToday = dayWith({
      ...day(),
      priority1: { ...priority("p1", "Ship the store"), done: true },
    });

    expect(resolveOne(completedInToday).done).toBe(true);
  });

  it("follows the priority by id, not by slot, so reordering cannot rebind it", () => {
    // The same priority now sits in slot 3.
    const reordered = dayWith({
      priority1: blankPriority(),
      priority3: priority("p1", "Ship the store", true),
      scheduleItems: day().scheduleItems,
    });

    expect(resolveOne(reordered).title).toBe("Ship the store");
    expect(resolveOne(reordered).done).toBe(true);
  });

  it("refuses text edits, so it cannot fork a second copy", () => {
    expect(canEditText(day().scheduleItems[0])).toBe(false);
  });
});

describe("a row linked to an action", () => {
  const day = (done = false) =>
    dayWith({
      actions: [action("a1", "Draft the release note", done)],
      scheduleItems: [
        { ...linkedItem("11:00", { kind: "action", actionId: "a1" }, "Draft the release note"), id: "s1" },
      ],
    });

  it("reads the action's title and completion", () => {
    const row = resolveOne(day(true));

    expect(row.kind).toBe("action");
    expect(row.title).toBe("Draft the release note");
    expect(row.done).toBe(true);
  });

  it("completes the action when ticked from the schedule", () => {
    const next = toggleScheduleItem(day(), "s1");

    expect(next.actions[0].done).toBe(true);
  });

  it("unticks the action again", () => {
    const next = toggleScheduleItem(day(true), "s1");

    expect(next.actions[0].done).toBe(false);
  });
});

describe("a row linked to a habit", () => {
  const day = () =>
    dayWith({
      scheduleItems: [
        { ...linkedItem("07:00", { kind: "habit", habitId: "h1" }, "Ten pages"), id: "s1" },
      ],
    });
  const habits = { h1: habit("h1", "Ten pages") };

  it("reads the habit's name and that day's completion", () => {
    const row = resolveOne(day(), habits, completionsFor("h1", "2026-08-19"));

    expect(row.kind).toBe("habit");
    expect(row.title).toBe("Ten pages");
    expect(row.done).toBe(true);
  });

  it("is not complete on a day the habit was not kept", () => {
    expect(resolveOne(day(), habits, completionsFor("h1", "2026-08-18")).done).toBe(false);
  });

  it("hands the habit to the caller rather than storing a second completion", () => {
    expect(scheduleHabitToggle(day(), "s1")).toBe("h1");
    // The day itself is left alone: habit completions do not live here.
    expect(toggleScheduleItem(day(), "s1")).toEqual(day());
  });
});

describe("when the linked record has gone", () => {
  it("keeps the row, marked unavailable, when a priority is cleared", () => {
    const day = dayWith({
      priority1: blankPriority(),
      scheduleItems: [
        { ...linkedItem("09:00", { kind: "priority", priorityId: "p1" }, "Ship the store"), id: "s1" },
      ],
    });

    const row = resolveOne(day);
    expect(row.available).toBe(false);
    // The snapshot is all that is left, and it is not presented as complete.
    expect(row.title).toBe("Ship the store");
    expect(row.done).toBe(false);
  });

  it("keeps the row when the action was deleted", () => {
    const day = dayWith({
      actions: [],
      scheduleItems: [
        { ...linkedItem("11:00", { kind: "action", actionId: "gone" }, "Draft the note"), id: "s1" },
      ],
    });

    expect(resolveOne(day).available).toBe(false);
    expect(resolveOne(day).title).toBe("Draft the note");
  });

  it("treats an archived habit as no longer here, without losing its history", () => {
    const day = dayWith({
      scheduleItems: [
        { ...linkedItem("07:00", { kind: "habit", habitId: "h1" }, "Ten pages"), id: "s1" },
      ],
    });
    const archived = { h1: habit("h1", "Ten pages", "2026-08-18T09:00:00.000Z") };

    const row = resolveOne(day, archived, completionsFor("h1", "2026-08-19"));
    expect(row.available).toBe(false);
    expect(row.done).toBe(false);
  });

  it("never recreates the missing record when ticked", () => {
    const day = dayWith({
      scheduleItems: [
        { ...linkedItem("09:00", { kind: "priority", priorityId: "gone" }, "Ship it"), id: "s1" },
      ],
    });

    const next = toggleScheduleItem(day, "s1");
    expect(next).toEqual(day);
    expect(next.priority1.text).toBe("");
    expect(next.actions).toEqual([]);
  });

  it("stays read-only, so a dead reference cannot become an editable copy", () => {
    const day = dayWith({
      scheduleItems: [
        { ...linkedItem("09:00", { kind: "priority", priorityId: "gone" }, "Ship it"), id: "s1" },
      ],
    });

    expect(canEditText(day.scheduleItems[0])).toBe(false);
  });
});

describe("toggling something that is not there", () => {
  it("is a no-op rather than an error", () => {
    const day = dayWith({ scheduleItems: [] });

    expect(toggleScheduleItem(day, "nope")).toBe(day);
    expect(scheduleHabitToggle(day, "nope")).toBeNull();
  });
});
