import { describe, expect, it } from "vitest";

import {
  HOUR_TAKEN_NOTE,
  SLOTS_FULL_NOTE,
  freeHours,
  freePriorityKey,
  planBlock,
  nextFreeSlot,
  scheduledCount,
} from "./day-plan";
import { blockItem } from "./schedule";
import { blankDay } from "./storage";
import { SCHEDULE_HOURS } from "./dates";
import type { Day } from "./types";

const NOW = new Date("2026-08-24T09:00:00.000Z");
const day = (patch: Partial<Day> = {}): Day => ({ ...blankDay("2026-08-24"), ...patch });

const withPriorities = (...texts: string[]): Day => {
  const base = day();
  const keys = ["priority1", "priority2", "priority3"] as const;
  return texts.reduce<Day>(
    (d, text, i) => ({ ...d, [keys[i]]: { ...d[keys[i]], id: `p${i}`, text } }),
    base,
  );
};

describe("adding a block from outside the day", () => {
  it("puts it on the day's own schedule, not a second store of events", () => {
    const result = planBlock(day(), { time: "09:00", text: "Dentist", asPriority: false }, NOW);
    if (!result.ok) throw new Error("expected the block to be added");

    expect(result.day.scheduleItems).toHaveLength(1);
    expect(result.day.scheduleItems[0]).toMatchObject({ time: "09:00", text: "Dentist" });
    // A plain block stands alone; it points at nothing.
    expect(result.day.scheduleItems[0].link).toBeNull();
    expect(result.promoted).toBe(false);
  });

  it("refuses an hour that already has something in it", () => {
    const taken = day({ scheduleItems: [blockItem("09:00", "Standup")] });

    expect(planBlock(taken, { time: "09:00", text: "Dentist", asPriority: false }, NOW)).toEqual({
      ok: false,
      reason: "hourTaken",
    });
    expect(HOUR_TAKEN_NOTE).toContain("already has something");
  });

  it("refuses nothing, rather than recording an empty block", () => {
    expect(planBlock(day(), { time: "09:00", text: "   ", asPriority: false }, NOW)).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("offers every quarter hour that is still free, not only whole hours", () => {
    // An hour is a frame: 4:00 and 4:30 are different times, so a taken hour
    // does not close the rest of it.
    const taken = day({ scheduleItems: [blockItem("09:00", "Standup")] });

    expect(freeHours(day())).toHaveLength(SCHEDULE_HOURS.length * 4);
    expect(freeHours(day())).toContain("16:15");
    expect(freeHours(taken)).not.toContain("09:00");
    expect(freeHours(taken)).toContain("09:30");
  });

  it("takes a block at a quarter past, and keeps it apart from the hour", () => {
    const onTheHour = planBlock(day(), { time: "16:00", text: "Call", asPriority: false }, NOW);
    if (!onTheHour.ok) throw new Error("expected the block to be added");

    const quarterPast = planBlock(
      onTheHour.day,
      { time: "16:15", text: "Follow up", asPriority: false },
      NOW,
    );
    if (!quarterPast.ok) throw new Error("expected the second block to be added");

    expect(quarterPast.day.scheduleItems.map((i) => i.time)).toEqual(["16:00", "16:15"]);
  });

  it("finds the next free quarter inside an hour", () => {
    const taken = day({
      scheduleItems: [blockItem("16:00", "Call"), blockItem("16:15", "Follow up")],
    });

    expect(nextFreeSlot(day(), "16:00")).toBe("16:00");
    expect(nextFreeSlot(taken, "16:00")).toBe("16:30");
  });

  it("stops counting a block once it has been carried to another day", () => {
    const carried = day({
      scheduleItems: [
        blockItem("09:00", "Standup"),
        { ...blockItem("10:00", "Moved on"), carriedTo: "2026-08-26" },
      ],
    });

    expect(scheduledCount(carried)).toBe(1);
    expect(freeHours(carried)).toContain("10:00");
  });
});

describe("making a block the day's priority", () => {
  it("writes the priority and links the block to it, so it is one piece of work", () => {
    const result = planBlock(day(), { time: "09:00", text: "Ship the store", asPriority: true }, NOW);
    if (!result.ok) throw new Error("expected the block to be added");

    expect(result.promoted).toBe(true);
    expect(result.day.priority1.text).toBe("Ship the store");

    const item = result.day.scheduleItems[0];
    expect(item.link).toEqual({ kind: "priority", priorityId: result.day.priority1.id });
    // Named once. The block reads through to the priority rather than copying it.
    expect(item.text).toBe("Ship the store");
  });

  it("fills the first empty slot rather than always the first slot", () => {
    const result = planBlock(
      withPriorities("Already here"),
      { time: "09:00", text: "Second thing", asPriority: true },
      NOW,
    );
    if (!result.ok) throw new Error("expected the block to be added");

    expect(result.day.priority1.text).toBe("Already here");
    expect(result.day.priority2.text).toBe("Second thing");
  });

  it("keeps the block when all three slots are taken, rather than losing what was typed", () => {
    // The cap is a product feature, so it must not break; but it must not eat
    // somebody's typing either.
    const full = withPriorities("One", "Two", "Three");
    const result = planBlock(full, { time: "09:00", text: "Fourth", asPriority: true }, NOW);
    if (!result.ok) throw new Error("expected the block to be added anyway");

    expect(result.slotsFull).toBe(true);
    expect(result.promoted).toBe(false);
    expect(result.day.scheduleItems[0].text).toBe("Fourth");
    expect(result.day.scheduleItems[0].link).toBeNull();

    // And nothing already there was overwritten.
    expect([result.day.priority1.text, result.day.priority2.text, result.day.priority3.text]).toEqual(
      ["One", "Two", "Three"],
    );
  });

  it("explains the full-slots case rather than failing quietly", () => {
    expect(SLOTS_FULL_NOTE).toContain("All three priorities are taken");
    expect(SLOTS_FULL_NOTE).toContain("time block");
  });

  it("reports which slot is free, and none when they are all taken", () => {
    expect(freePriorityKey(day())).toBe("priority1");
    expect(freePriorityKey(withPriorities("One"))).toBe("priority2");
    expect(freePriorityKey(withPriorities("One", "Two", "Three"))).toBeNull();
  });

  it("stamps the priority with the day it came from", () => {
    const result = planBlock(day(), { time: "09:00", text: "Ship it", asPriority: true }, NOW);
    if (!result.ok) throw new Error("expected the block to be added");

    expect(result.day.priority1.createdAt).toBe(NOW.toISOString());
    expect(result.day.priority1.originDayId).toBe("2026-08-24");
    expect(result.day.priority1.done).toBe(false);
  });
});
