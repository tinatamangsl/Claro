import { describe, expect, it } from "vitest";

import {
  addBlock,
  addEntry,
  moveActionToDay,
  moveBlock,
  moveBlockToDay,
  removeAction,
  removeBlock,
  slotFor,
  toggleAction,
} from "./week-plan";
import { blankDay } from "./storage";
import type { Day, ScheduleItem } from "./types";

const at = (id: string, time: string, text = id): ScheduleItem => ({
  id,
  time,
  text,
  link: null,
  done: false,
});

const day = (id: string, ...items: ScheduleItem[]): Day => ({
  ...blankDay(id),
  scheduleItems: items,
});

describe("moving a block from the week grid", () => {
  it("keeps the minute it was set to", () => {
    const from = day("2026-09-21", at("a", "09:40"));
    const moved = moveBlock(from, day("2026-09-22"), "a", "14:00")!;

    /*
     * Somebody who set 9:40 deliberately means 2:40, not 2:00. Snapping to the
     * hour would quietly discard a minute they had chosen.
     */
    expect(moved.to.scheduleItems[0].time).toBe("14:40");
  });

  it("takes the block off the day it left", () => {
    const from = day("2026-09-21", at("a", "09:00"), at("b", "10:00"));
    const moved = moveBlock(from, day("2026-09-22"), "a", "14:00")!;

    // Both days are written, or the block exists twice or not at all.
    expect(moved.from.scheduleItems.map((i) => i.id)).toEqual(["b"]);
    expect(moved.to.scheduleItems.map((i) => i.id)).toEqual(["a"]);
  });

  it("finds another slot rather than refusing when the minute is taken", () => {
    const from = day("2026-09-21", at("a", "09:40"));
    const to = day("2026-09-22", at("x", "14:40"));
    const moved = moveBlock(from, to, "a", "14:00")!;

    // The gesture already said which hour was meant; refusing it would be
    // rejecting an instruction that was perfectly clear.
    const landed = moved.to.scheduleItems.find((i) => i.id === "a")!;
    expect(landed.time).not.toBe("14:40");
    expect(landed.time.startsWith("14:")).toBe(true);
  });

  it("re-times in place when the day has not changed", () => {
    const d = day("2026-09-21", at("a", "09:00"), at("b", "11:00"));
    const moved = moveBlock(d, d, "a", "15:00")!;

    expect(moved.from.scheduleItems.map((i) => `${i.id}@${i.time}`).sort()).toEqual([
      "a@15:00",
      "b@11:00",
    ]);
  });

  it("does nothing for a block that is not there", () => {
    expect(moveBlock(day("2026-09-21"), day("2026-09-22"), "ghost", "14:00")).toBeNull();
  });
});

describe("adding from a cell", () => {
  it("writes into the hour that was clicked", () => {
    const next = addBlock(day("2026-09-21"), "14:00", "call Ren");
    expect(next.scheduleItems[0].time).toBe("14:00");
    expect(next.scheduleItems[0].text).toBe("call Ren");
  });

  it("sits beside what is already in that hour", () => {
    const next = addBlock(day("2026-09-21", at("a", "14:00")), "14:00", "second");
    expect(next.scheduleItems.map((i) => i.time).sort()).toEqual(["14:00", "14:15"]);
  });

  it("refuses to record nothing", () => {
    const empty = day("2026-09-21");
    expect(addBlock(empty, "14:00", "   ")).toBe(empty);
  });

  it("offers the hour itself when the hour is free", () => {
    expect(slotFor(day("2026-09-21"), "14:00")).toBe("14:00");
  });
});

describe("writing into a cell of the week", () => {
  const now = new Date("2026-09-23T10:00:00.000Z");

  it("makes a block that is only a booking", () => {
    const next = addEntry(day("2026-09-23"), "11:00", "write the brief", "block", now);

    expect(next.scheduleItems.map((i) => [i.time, i.text])).toEqual([["11:00", "write the brief"]]);
    // A block is not a task, so it does not join the action list.
    expect(next.actions).toEqual([]);
  });

  it("makes a task a real action, and points the schedule at it", () => {
    const next = addEntry(day("2026-09-23"), "14:00", "call the supplier", "task", now);
    const action = next.actions[0];

    /*
     * One record, in the list Daily, the carry forward and the quarter all
     * read from. The schedule row references it rather than holding a second
     * copy of the words, so renaming it anywhere renames it everywhere.
     */
    expect([action.text, action.bucket]).toEqual(["call the supplier", "task"]);
    expect(next.scheduleItems[0].link).toEqual({ kind: "action", actionId: action.id });
    expect(next.scheduleItems[0].time).toBe("14:00");
  });

  it("keeps a quick tick in its own bucket", () => {
    const next = addEntry(day("2026-09-23"), "09:00", "reply to Sam", "quickTick", now);

    expect(next.actions[0].bucket).toBe("quickTick");
  });

  it("sits an entry beside what the hour already holds", () => {
    const start = day("2026-09-23", at("a", "14:00"));
    const next = addEntry(start, "14:00", "second thing", "block", now);

    expect(next.scheduleItems.map((i) => i.time)).toEqual(["14:00", "14:15"]);
  });

  it("refuses a blank one rather than booking an empty row", () => {
    const start = day("2026-09-23");

    expect(addEntry(start, "09:00", "   ", "task", now)).toBe(start);
  });
});

describe("moving something off the day it is on", () => {
  it("takes a block to another day at the time it already had", () => {
    const from = day("2026-10-05", at("a", "18:00"), at("b", "09:00"));
    const moved = moveBlockToDay(from, day("2026-10-06"), "a")!;

    expect(moved.to.scheduleItems.map((i) => [i.id, i.time])).toEqual([["a", "18:00"]]);
    expect(moved.from.scheduleItems.map((i) => i.id)).toEqual(["b"]);
  });

  it("steps aside when that time is already taken on the new day", () => {
    const from = day("2026-10-05", at("a", "18:00"));
    const to = day("2026-10-06", at("x", "18:00"));

    expect(moveBlockToDay(from, to, "a")!.to.scheduleItems.map((i) => i.time).sort()).toEqual([
      "18:00",
      "18:15",
    ]);
  });

  it("refuses a move to the day it is already on", () => {
    const from = day("2026-10-05", at("a", "18:00"));

    // Nothing to write, and writing it would mean removing and re-adding the
    // same record on the same day.
    expect(moveBlockToDay(from, from, "a")).toBeNull();
  });

  it("carries an action across, keeping where it was first written down", () => {
    const from: Day = {
      ...day("2026-10-05"),
      actions: [
        { id: "a1", text: "Content day", bucket: "project", done: false, createdAt: "x", originDayId: "2026-10-05" },
      ],
    };

    const moved = moveActionToDay(from, day("2026-10-06"), "a1")!;
    expect(moved.from.actions).toEqual([]);
    // originDayId is a fact about its history, not about where it sits now.
    expect(moved.to.actions[0].originDayId).toBe("2026-10-05");
  });
});

describe("letting something go from the calendar", () => {
  it("removes a booking and nothing else", () => {
    const start = day("2026-10-05", at("a", "09:00"), at("b", "10:00"));

    expect(removeBlock(start, "a").scheduleItems.map((i) => i.id)).toEqual(["b"]);
    expect(removeBlock(start, "nope")).toBe(start);
  });

  it("takes the booking with the action it pointed at", () => {
    const start: Day = {
      ...day("2026-10-05"),
      actions: [{ id: "a1", text: "Content day", bucket: "project", done: false, createdAt: "x" }],
      scheduleItems: [
        { id: "s1", time: "10:00", text: "Content day", link: { kind: "action", actionId: "a1" }, done: false },
        at("other", "11:00"),
      ],
    };

    // Otherwise the schedule keeps a row pointing at a record that is gone.
    const next = removeAction(start, "a1");
    expect(next.actions).toEqual([]);
    expect(next.scheduleItems.map((i) => i.id)).toEqual(["other"]);
  });

  it("leaves the record alone when only the booking is removed", () => {
    const start: Day = {
      ...day("2026-10-05"),
      actions: [{ id: "a1", text: "Content day", bucket: "project", done: false, createdAt: "x" }],
      scheduleItems: [
        { id: "s1", time: "10:00", text: "Content day", link: { kind: "action", actionId: "a1" }, done: false },
      ],
    };

    // "Not at ten o'clock after all" is not "not at all".
    expect(removeBlock(start, "s1").actions).toHaveLength(1);
  });
});

describe("ticking from the calendar", () => {
  it("turns an action over and back", () => {
    const start: Day = {
      ...day("2026-10-05"),
      actions: [{ id: "a1", text: "Content day", bucket: "project", done: false, createdAt: "x" }],
    };

    const ticked = toggleAction(start, "a1");
    expect(ticked.actions[0].done).toBe(true);
    expect(toggleAction(ticked, "a1").actions[0].done).toBe(false);
  });
});
