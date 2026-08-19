import { describe, expect, it } from "vitest";

import {
  CLOSE_HOUR,
  carryItem,
  closeAt,
  closeDay,
  completeItem,
  hasReflection,
  isCloseEligible,
  isClosed,
  letGoItem,
  openCount,
  openItems,
  reopenDay,
  tomorrowOf,
  writeReview,
} from "./day-close";
import { blankDay, blankPriority } from "./storage";
import type { ActionItem, Day, ScheduleItem } from "./types";

const D = "2026-08-19";
const NOW = new Date("2026-08-19T21:30:00.000Z");
/** Local wall-clock, because the rule is 9 PM where the user is. */
const local = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0);

const priority = (id: string, text: string, patch = {}) => ({
  ...blankPriority(),
  id,
  text,
  originDayId: D,
  ...patch,
});

const action = (id: string, text: string, patch: Partial<ActionItem> = {}): ActionItem => ({
  id,
  text,
  bucket: "task",
  done: false,
  createdAt: "x",
  ...patch,
});

const block = (id: string, time: string, text: string, patch: Partial<ScheduleItem> = {}): ScheduleItem => ({
  id,
  time,
  text,
  link: null,
  done: false,
  ...patch,
});

const dayWith = (patch: Partial<Day>): Day => ({ ...blankDay(D), ...patch });

const full = () =>
  dayWith({
    priority1: priority("p1", "Ship the store"),
    priority2: priority("p2", "Read ten pages", { done: true }),
    actions: [action("a1", "Email the accountant"), action("a2", "Book the dentist", { done: true })],
    scheduleItems: [
      block("s1", "13:00", "Lunch away from the desk"),
      block("s2", "09:00", "Ship the store", { link: { kind: "priority", priorityId: "p1" } }),
    ],
  });

describe("when a day becomes eligible to close", () => {
  it("is 9 PM in the user's own local time", () => {
    const at = closeAt(D);

    expect(CLOSE_HOUR).toBe(21);
    expect(at.getHours()).toBe(21);
    expect(at.getDate()).toBe(19);
  });

  it("still lands on local 9 PM across a daylight-saving change", () => {
    // Adding 21 hours to midnight would drift on a spring-forward day.
    expect(closeAt("2026-03-29").getHours()).toBe(21);
  });

  it("is not eligible a minute before, and is on the stroke", () => {
    expect(isCloseEligible(D, local(2026, 8, 19, 20, 59))).toBe(false);
    expect(isCloseEligible(D, local(2026, 8, 19, 21, 0))).toBe(true);
  });

  it("stays eligible when the app is reopened later that night", () => {
    expect(isCloseEligible(D, local(2026, 8, 19, 23, 45))).toBe(true);
  });

  it("stays eligible when the app is reopened the next morning", () => {
    expect(isCloseEligible(D, local(2026, 8, 20, 8, 0))).toBe(true);
  });

  it("is never eligible for a day that has not happened", () => {
    expect(isCloseEligible("2026-08-20", local(2026, 8, 19, 23, 0))).toBe(false);
  });
});

describe("closing and reopening", () => {
  it("records when the day was closed, and can be undone", () => {
    const closed = closeDay(dayWith({}), NOW);
    expect(isClosed(closed)).toBe(true);
    expect(isClosed(reopenDay(closed))).toBe(false);
  });

  it("keeps the reflection when the day is reopened", () => {
    const written = writeReview(dayWith({}), { proudOf: "Stopped at a sensible hour" }, NOW);
    expect(reopenDay(closeDay(written, NOW)).review?.proudOf).toBe("Stopped at a sensible hour");
  });
});

describe("what is still open", () => {
  it("lists each unfinished priority, action and standalone block exactly once", () => {
    expect(openItems(full()).map((i) => [i.kind, i.text])).toEqual([
      ["priority", "Ship the store"],
      ["action", "Email the accountant"],
      ["schedule", "Lunch away from the desk"],
    ]);
  });

  it("never lists a linked schedule row, because it is the same work", () => {
    // "Ship the store" appears once, as the priority, not twice.
    const texts = openItems(full()).map((i) => i.text);
    expect(texts.filter((t) => t === "Ship the store")).toHaveLength(1);
  });

  it("counts what is waiting", () => {
    expect(openCount(full())).toBe(3);
    expect(openCount(dayWith({}))).toBe(0);
  });
});

describe("a carried item is never active twice", () => {
  it("closes the original in the same step that produces the instance", () => {
    const [item] = openItems(full());
    const { day, carried } = carryItem(full(), item, "2026-08-20");

    expect(day.priority1.carriedTo).toBe("2026-08-20");
    expect(carried).toMatchObject({ id: "p1", text: "Ship the store" });
    // And it is gone from the open list, on this day, for good.
    expect(openItems(day).map((i) => i.text)).not.toContain("Ship the store");
  });

  it("leaves the original record in place as history", () => {
    const [item] = openItems(full());
    const { day } = carryItem(full(), item, "2026-08-20");

    expect(day.priority1.text).toBe("Ship the store");
    expect(day.priority1.done).toBe(false);
  });

  it("does the same for an action", () => {
    const item = openItems(full()).find((i) => i.kind === "action")!;
    const { day, carried } = carryItem(full(), item, "2026-08-21");

    expect(day.actions[0].carriedTo).toBe("2026-08-21");
    expect(openItems(day).map((i) => i.text)).not.toContain("Email the accountant");
    expect(carried?.bucket).toBe("task");
  });

  it("does the same for a standalone block", () => {
    const item = openItems(full()).find((i) => i.kind === "schedule")!;
    const { day, carried } = carryItem(full(), item, "2026-08-21");

    expect(day.scheduleItems[0].carriedTo).toBe("2026-08-21");
    expect(openItems(day).map((i) => i.text)).not.toContain("Lunch away from the desk");
    expect(carried?.text).toBe("Lunch away from the desk");
  });

  it("refuses to carry a day onto itself", () => {
    const [item] = openItems(full());
    const { day, carried } = carryItem(full(), item, D);

    expect(carried).toBeNull();
    expect(day.priority1.carriedTo).toBeNull();
  });

  it("cannot be carried a second time, however many times it is asked", () => {
    const [item] = openItems(full());
    const first = carryItem(full(), item, "2026-08-20").day;

    // The item is no longer open, so there is nothing left to carry.
    expect(openItems(first).some((i) => i.id === "p1")).toBe(false);
  });

  it("sends work to tomorrow by default", () => {
    expect(tomorrowOf(D)).toBe("2026-08-20");
    expect(tomorrowOf("2026-12-31")).toBe("2027-01-01");
  });
});

describe("the other three decisions", () => {
  it("completes a priority, an action and a block", () => {
    const items = openItems(full());
    expect(completeItem(full(), items[0]).priority1.done).toBe(true);
    expect(completeItem(full(), items[1]).actions[0].done).toBe(true);
    expect(completeItem(full(), items[2]).scheduleItems[0].done).toBe(true);
  });

  it("lets something go without deleting the record", () => {
    const [item] = openItems(full());
    const day = letGoItem(full(), item, NOW);

    expect(day.priority1.text).toBe("Ship the store");
    expect(day.priority1.done).toBe(false);
    // Closed, so it stops being open work and is not carried anywhere.
    expect(openItems(day).some((i) => i.id === "p1")).toBe(false);
  });

  it("leaves the other two priorities untouched when one is decided", () => {
    const [item] = openItems(full());
    const day = completeItem(full(), item);

    expect(day.priority2.done).toBe(true);
    expect(day.priority3.text).toBe("");
  });
});

describe("the reflection", () => {
  it("counts once anything at all is written", () => {
    expect(hasReflection(dayWith({}))).toBe(false);
    expect(hasReflection(writeReview(dayWith({}), { proudOf: "Rested" }, NOW))).toBe(true);
    expect(hasReflection(writeReview(dayWith({}), { betterTomorrow: "Start earlier" }, NOW))).toBe(true);
    expect(hasReflection(writeReview(dayWith({}), { mood: "steady" }, NOW))).toBe(true);
    expect(hasReflection(writeReview(dayWith({}), { stress: 2 }, NOW))).toBe(true);
  });

  it("does not count whitespace", () => {
    expect(hasReflection(writeReview(dayWith({}), { proudOf: "   " }, NOW))).toBe(false);
  });
});
