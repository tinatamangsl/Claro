import { describe, expect, it } from "vitest";

import { applyOrder, moveAcrossGroups, moveById, moveItem, nudgeById } from "./reorder";

const item = (id: string, bucket = "task") => ({ id, bucket });
const ids = <T extends { id: string }>(list: T[]) => list.map((i) => i.id);

describe("moveItem", () => {
  it("moves an item down", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("moves an item up", () => {
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("returns the same list when nothing moves", () => {
    const list = ["a", "b", "c"];
    expect(moveItem(list, 1, 1)).toBe(list);
  });

  it("clamps rather than dropping an item off either end", () => {
    expect(moveItem(["a", "b", "c"], 1, 99)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b", "c"], 1, -99)).toEqual(["b", "a", "c"]);
    // Clamping back onto the item's own index is a no-op, not a rebuild.
    const list = ["a", "b", "c"];
    expect(moveItem(list, 0, -5)).toBe(list);
    expect(moveItem(list, 2, 99)).toBe(list);
  });

  it("ignores an index that is not in the list", () => {
    const list = ["a", "b"];
    expect(moveItem(list, 7, 0)).toBe(list);
  });

  it("never loses or duplicates an item", () => {
    const list = ["a", "b", "c", "d"];
    for (let from = 0; from < 4; from += 1) {
      for (let to = 0; to < 4; to += 1) {
        expect([...moveItem(list, from, to)].sort()).toEqual(["a", "b", "c", "d"]);
      }
    }
  });
});

describe("moveById and nudgeById", () => {
  const list = [item("a"), item("b"), item("c")];

  it("moves by id", () => {
    expect(ids(moveById(list, "c", 0))).toEqual(["c", "a", "b"]);
  });

  it("nudges one step", () => {
    expect(ids(nudgeById(list, "b", -1))).toEqual(["b", "a", "c"]);
    expect(ids(nudgeById(list, "b", 1))).toEqual(["a", "c", "b"]);
  });

  it("stays put at the ends rather than wrapping around", () => {
    expect(nudgeById(list, "a", -1)).toBe(list);
    expect(nudgeById(list, "c", 1)).toBe(list);
  });

  it("ignores an unknown id", () => {
    expect(moveById(list, "nope", 0)).toBe(list);
  });
});

describe("applyOrder", () => {
  const list = [item("a"), item("b"), item("c")];

  it("re-materialises the list in the given order", () => {
    expect(ids(applyOrder(list, ["c", "a", "b"]))).toEqual(["c", "a", "b"]);
  });

  it("keeps items a stale order forgot, rather than dropping them", () => {
    expect(ids(applyOrder(list, ["c"]))).toEqual(["c", "a", "b"]);
  });

  it("ignores ids that are no longer in the list", () => {
    expect(ids(applyOrder(list, ["gone", "b", "a", "c"]))).toEqual(["b", "a", "c"]);
  });
});

describe("moveAcrossGroups", () => {
  const getGroup = (i: { bucket: string }) => i.bucket;
  const setGroup = (i: { id: string; bucket: string }, bucket: string) => ({ ...i, bucket });

  const list = [
    item("t1", "task"),
    item("t2", "task"),
    item("p1", "project"),
    item("p2", "project"),
  ];

  it("changes the item's group", () => {
    const next = moveAcrossGroups(list, "t1", "project", 0, getGroup, setGroup);

    expect(next.find((i) => i.id === "t1")?.bucket).toBe("project");
  });

  it("lands it at the requested position within the destination", () => {
    const next = moveAcrossGroups(list, "t1", "project", 1, getGroup, setGroup);
    const projects = next.filter((i) => i.bucket === "project").map((i) => i.id);

    expect(projects).toEqual(["p1", "t1", "p2"]);
  });

  it("appends when the position is past the end", () => {
    const next = moveAcrossGroups(list, "t1", "project", 9, getGroup, setGroup);

    expect(next.filter((i) => i.bucket === "project").map((i) => i.id)).toEqual([
      "p1",
      "p2",
      "t1",
    ]);
  });

  it("leaves the other group's order alone", () => {
    const next = moveAcrossGroups(list, "t1", "project", 0, getGroup, setGroup);

    expect(next.filter((i) => i.bucket === "task").map((i) => i.id)).toEqual(["t2"]);
  });

  it("reorders within one group when the group does not change", () => {
    const next = moveAcrossGroups(list, "t2", "task", 0, getGroup, setGroup);

    expect(next.filter((i) => i.bucket === "task").map((i) => i.id)).toEqual(["t2", "t1"]);
  });

  it("never loses an item", () => {
    const next = moveAcrossGroups(list, "p2", "task", 0, getGroup, setGroup);

    expect(next).toHaveLength(4);
    expect(ids(next).sort()).toEqual(["p1", "p2", "t1", "t2"]);
  });

  it("ignores an unknown id", () => {
    expect(moveAcrossGroups(list, "nope", "task", 0, getGroup, setGroup)).toBe(list);
  });
});
