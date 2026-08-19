import { describe, expect, it } from "vitest";

import {
  carryItem,
  completeItem,
  hasReflection,
  letGoItem,
  openItems,
  writeReview,
} from "./daily-review";
import { blankDay, blankPriority } from "./storage";
import type { ActionItem, Day } from "./types";

const NOW = new Date("2026-08-19T21:00:00.000Z");

const priority = (id: string, text: string, done = false) => ({
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

const dayWith = (patch: Partial<Day>): Day => ({ ...blankDay("2026-08-19"), ...patch });

describe("writing a reflection", () => {
  it("creates one on first write and keeps what is already there", () => {
    let day = writeReview(dayWith({}), { proudOf: "Finished the migration" }, NOW);
    expect(day.review?.proudOf).toBe("Finished the migration");

    day = writeReview(day, { mood: "good" }, NOW);
    expect(day.review?.proudOf).toBe("Finished the migration");
    expect(day.review?.mood).toBe("good");
  });

  it("counts as captured once anything at all is written", () => {
    expect(hasReflection(dayWith({}))).toBe(false);
    expect(hasReflection(writeReview(dayWith({}), { mood: "steady" }, NOW))).toBe(true);
    expect(hasReflection(writeReview(dayWith({}), { stress: 2 }, NOW))).toBe(true);
    expect(hasReflection(writeReview(dayWith({}), { proudOf: "Rested" }, NOW))).toBe(true);
  });

  it("does not count whitespace as a reflection", () => {
    expect(hasReflection(writeReview(dayWith({}), { proudOf: "   " }, NOW))).toBe(false);
  });

  it("lets a mood be cleared back to nothing", () => {
    const day = writeReview(writeReview(dayWith({}), { mood: "good" }, NOW), { mood: null }, NOW);
    expect(day.review?.mood).toBeNull();
    expect(hasReflection(day)).toBe(false);
  });
});

describe("listing what is still open", () => {
  it("lists unfinished priorities and actions, and nothing else", () => {
    const day = dayWith({
      priority1: priority("p1", "Ship the store"),
      priority2: priority("p2", "Read ten pages", true),
      priority3: blankPriority(),
      actions: [action("a1", "Email"), action("a2", "Call", true), action("a3", "   ")],
    });

    expect(openItems(day).map((i) => [i.kind, i.text])).toEqual([
      ["priority", "Ship the store"],
      ["action", "Email"],
    ]);
  });

  it("is empty on a day with nothing outstanding", () => {
    expect(openItems(dayWith({}))).toEqual([]);
  });
});

describe("the four decisions", () => {
  const day = () =>
    dayWith({
      priority1: priority("p1", "Ship the store"),
      priority2: priority("p2", "Read ten pages"),
      actions: [action("a1", "Email")],
    });

  it("completes a priority without touching the others", () => {
    const [item] = openItems(day());
    const next = completeItem(day(), item);

    expect(next.priority1.done).toBe(true);
    expect(next.priority2.done).toBe(false);
    expect(next.actions[0].done).toBe(false);
  });

  it("completes an action", () => {
    const item = openItems(day()).find((i) => i.kind === "action")!;
    expect(completeItem(day(), item).actions[0].done).toBe(true);
  });

  it("lets a priority go by emptying only its slot", () => {
    const [item] = openItems(day());
    const next = letGoItem(day(), item);

    expect(next.priority1.text).toBe("");
    expect(next.priority1.id).toBeNull();
    expect(next.priority2.text).toBe("Read ten pages");
  });

  it("lets an action go by removing it", () => {
    const item = openItems(day()).find((i) => i.kind === "action")!;
    expect(letGoItem(day(), item).actions).toEqual([]);
  });

  it("carries a priority forward, marking the source so nothing carries it twice", () => {
    const [item] = openItems(day());
    const { day: next, carried } = carryItem(day(), item, "2026-08-20");

    expect(next.priority1.carriedTo).toBe("2026-08-20");
    // The record stays where it is: the day's history is not rewritten.
    expect(next.priority1.text).toBe("Ship the store");
    expect(carried).toMatchObject({ id: "p1", text: "Ship the store", origin: "priority" });
  });

  it("carries an action forward with its bucket", () => {
    const item = openItems(day()).find((i) => i.kind === "action")!;
    const { day: next, carried } = carryItem(day(), item, "2026-08-25");

    expect(next.actions[0].carriedTo).toBe("2026-08-25");
    expect(carried).toMatchObject({ id: "a1", origin: "action", bucket: "task" });
  });

  it("keeps the original creation date when carrying", () => {
    const withHistory = dayWith({
      priority1: { ...priority("p1", "Ship it"), createdAt: "2026-08-14T09:00:00.000Z", originDayId: "2026-08-14" },
    });
    const { carried } = carryItem(withHistory, openItems(withHistory)[0], "2026-08-20");

    expect(carried?.createdAt).toBe("2026-08-14T09:00:00.000Z");
    expect(carried?.originDayId).toBe("2026-08-14");
  });

  it("never moves anything on its own: a decision is always required", () => {
    // Listing is a read. Nothing about it changes the day.
    const before = day();
    openItems(before);
    expect(before).toEqual(day());
  });
});
