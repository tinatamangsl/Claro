import { describe, expect, it } from "vitest";

import {
  clearPriority,
  priorityList,
  reorderPriorities,
  resolvePriorityKey,
  writePriority,
} from "./priorities";
import { blankDay, blankPriority } from "./storage";
import type { Day, Priority } from "./types";

const NOW = new Date("2026-08-18T09:00:00.000Z");

describe("writePriority — a slot becomes real by being written in", () => {
  it("stamps an identity the first time words are put in it", () => {
    const written = writePriority(blankPriority(), { text: "Ship the store" }, "2026-08-18", NOW);

    expect(written.id).not.toBeNull();
    expect(written.createdAt).toBe("2026-08-18T09:00:00.000Z");
    expect(written.originDayId).toBe("2026-08-18");
  });

  it("keeps the original identity when the text is edited later", () => {
    const first = writePriority(blankPriority(), { text: "Ship it" }, "2026-08-18", NOW);
    const edited = writePriority(
      first,
      { text: "Ship the store, properly" },
      "2026-08-18",
      new Date("2026-08-18T15:00:00.000Z"),
    );

    expect(edited.id).toBe(first.id);
    expect(edited.createdAt).toBe(first.createdAt);
  });

  it("does not re-stamp carried work with today's date", () => {
    const carried: Priority = {
      ...blankPriority(),
      id: "p-1",
      text: "Ship the store",
      createdAt: "2026-08-14T09:00:00.000Z",
      originDayId: "2026-08-14",
    };

    const ticked = writePriority(carried, { done: true }, "2026-08-18", NOW);

    expect(ticked.originDayId).toBe("2026-08-14");
    expect(ticked.createdAt).toBe("2026-08-14T09:00:00.000Z");
  });

  it("empties the whole slot when the words are removed", () => {
    const written = writePriority(
      blankPriority(),
      { text: "Ship it", done: true, goal: { category: "workMain" } },
      "2026-08-18",
      NOW,
    );

    // A completion mark or a goal link on a slot with no words in it would be
    // a record of nothing.
    expect(writePriority(written, { text: "   " }, "2026-08-18", NOW)).toEqual(blankPriority());
  });

  it("gives two priorities written on the same day different identities", () => {
    const a = writePriority(blankPriority(), { text: "One" }, "2026-08-18", NOW);
    const b = writePriority(blankPriority(), { text: "Two" }, "2026-08-18", NOW);

    expect(a.id).not.toBe(b.id);
  });
});

// --------------------------------------------------- addressing and reorder

const withThree = (): Day => ({
  ...blankDay("2026-08-19"),
  priority1: {
    ...blankPriority(),
    id: "a",
    text: "Cloud Cycle session",
    done: true,
    goal: { category: "workMain" },
    createdAt: "2026-08-14T09:00:00.000Z",
    originDayId: "2026-08-14",
  },
  priority2: {
    ...blankPriority(),
    id: "b",
    text: "Read ten pages",
    goal: { category: "lifeMain" },
    originDayId: "2026-08-19",
  },
  priority3: {
    ...blankPriority(),
    id: "c",
    text: "Plan Claro",
    goal: { category: "workSide", sideQuestId: "s1" },
    originDayId: "2026-08-19",
  },
});

const shape = (day: Day) =>
  priorityList(day).map((p) => [p.id, p.text, p.done, p.goal] as const);

describe("addressing a priority", () => {
  it("finds the slot a written priority currently occupies", () => {
    expect(resolvePriorityKey(withThree(), { id: "b" })).toBe("priority2");
  });

  it("follows the priority after a reorder rather than the position", () => {
    const moved = reorderPriorities(withThree(), ["c", "a", "b"]);

    expect(resolvePriorityKey(moved, { id: "a" })).toBe("priority2");
    expect(resolvePriorityKey(moved, { id: "c" })).toBe("priority1");
  });

  it("addresses a blank slot by rank, because there is nothing to overwrite", () => {
    expect(resolvePriorityKey(blankDay("2026-08-19"), { rank: 2 })).toBe("priority2");
  });

  it("addresses nothing at all for an id that has gone", () => {
    expect(resolvePriorityKey(withThree(), { id: "gone" })).toBeNull();
  });
});

describe("reordering three distinct priorities", () => {
  const original = shape(withThree());

  const orders: [string, string[]][] = [
    ["a,b,c", ["a", "b", "c"]],
    ["a,c,b", ["a", "c", "b"]],
    ["b,a,c", ["b", "a", "c"]],
    ["b,c,a", ["b", "c", "a"]],
    ["c,a,b", ["c", "a", "b"]],
    ["c,b,a", ["c", "b", "a"]],
  ];

  it.each(orders)("puts them in the order %s and changes nothing else", (_name, ids) => {
    const next = reorderPriorities(withThree(), ids);

    expect(priorityList(next).map((p) => p.id)).toEqual(ids);
    // Every original record survives intact, merely in a new position.
    expect([...shape(next)].sort()).toEqual([...original].sort());
  });

  it("never duplicates a priority, in any order", () => {
    for (const [, ids] of orders) {
      const texts = priorityList(reorderPriorities(withThree(), ids)).map((p) => p.text);
      expect(new Set(texts).size).toBe(3);
    }
  });

  it("carries completion, goal link, id and creation date with the priority", () => {
    const next = reorderPriorities(withThree(), ["c", "b", "a"]);

    expect(next.priority3).toEqual(withThree().priority1);
    expect(next.priority3.done).toBe(true);
    expect(next.priority3.goal).toEqual({ category: "workMain" });
    expect(next.priority3.createdAt).toBe("2026-08-14T09:00:00.000Z");
    expect(next.priority3.originDayId).toBe("2026-08-14");
  });

  it("survives being applied repeatedly, as a drag does", () => {
    let day = withThree();
    day = reorderPriorities(day, ["b", "a", "c"]);
    day = reorderPriorities(day, ["c", "b", "a"]);
    day = reorderPriorities(day, ["a", "c", "b"]);

    expect(priorityList(day).map((p) => p.id)).toEqual(["a", "c", "b"]);
    expect([...shape(day)].sort()).toEqual([...original].sort());
  });

  it("leaves the day unchanged rather than losing work on a stale sequence", () => {
    const next = reorderPriorities(withThree(), ["gone", "missing"]);

    expect(shape(next)).toEqual(original);
  });

  it("ignores a sequence that names one priority twice", () => {
    const next = reorderPriorities(withThree(), ["a", "a", "a"]);

    // The repeats address nothing the second time, so the rest simply follow.
    expect(priorityList(next).map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(new Set(priorityList(next).map((p) => p.text)).size).toBe(3);
  });

  it("keeps blank slots as blanks, without inventing identities", () => {
    const oneWritten: Day = {
      ...blankDay("2026-08-19"),
      priority2: { ...blankPriority(), id: "b", text: "Read ten pages" },
    };

    const next = reorderPriorities(oneWritten, ["b"]);
    expect(next.priority1.id).toBe("b");
    expect(next.priority2).toEqual(blankPriority());
    expect(next.priority3).toEqual(blankPriority());
  });

  it("does not touch anything outside the three slots", () => {
    const day: Day = { ...withThree(), notes: "kept", waterGlasses: 4 };
    const next = reorderPriorities(day, ["c", "b", "a"]);

    expect(next.notes).toBe("kept");
    expect(next.waterGlasses).toBe(4);
  });
});

describe("clearing a priority", () => {
  it("empties only the slot that was asked for", () => {
    const next = clearPriority(withThree(), { id: "b" });

    expect(next.priority2).toEqual(blankPriority());
    expect(next.priority1).toEqual(withThree().priority1);
    expect(next.priority3).toEqual(withThree().priority3);
  });

  it("leaves the slot ready for something new", () => {
    const cleared = clearPriority(withThree(), { id: "a" });
    const rewritten = writePriority(cleared.priority1, { text: "Something else" }, "2026-08-19", NOW);

    expect(rewritten.text).toBe("Something else");
    expect(rewritten.id).not.toBe("a");
  });

  it("leaves a scheduled reference alone, so booked time is not deleted with the work", () => {
    const day: Day = {
      ...withThree(),
      scheduleItems: [
        { id: "s1", time: "09:00", text: "Cloud Cycle session", link: { kind: "priority", priorityId: "a" }, done: false },
      ],
    };

    const next = clearPriority(day, { id: "a" });
    expect(next.scheduleItems).toHaveLength(1);
    expect(next.scheduleItems[0].link).toEqual({ kind: "priority", priorityId: "a" });
  });

  it("ignores an id that is not there", () => {
    const day = withThree();
    expect(clearPriority(day, { id: "gone" })).toBe(day);
  });

  it("is a no-op on a slot that is already empty", () => {
    const day = blankDay("2026-08-19");
    expect(clearPriority(day, { rank: 1 })).toBe(day);
  });
});
