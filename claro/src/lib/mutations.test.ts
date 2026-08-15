import { describe, expect, it } from "vitest";

import { addCapped, removeById, toggleById, updateById } from "./mutations";

type Item = { id: string; text: string; done: boolean };

const item = (id: string, text = id, done = false): Item => ({ id, text, done });

describe("addCapped", () => {
  it("appends below the cap", () => {
    expect(addCapped([item("a")], item("b"), 3).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("refuses to add at the cap", () => {
    const full = [item("a"), item("b"), item("c")];
    expect(addCapped(full, item("d"), 3)).toHaveLength(3);
  });

  it("returns the original array reference when capped, so React skips the update", () => {
    const full = [item("a"), item("b"), item("c")];
    expect(addCapped(full, item("d"), 3)).toBe(full);
  });

  it("does not mutate the input", () => {
    const list = [item("a")];
    addCapped(list, item("b"), 3);
    expect(list).toHaveLength(1);
  });
});

describe("updateById", () => {
  it("patches only the matching item", () => {
    const list = [item("a"), item("b")];
    const next = updateById(list, "b", { text: "changed" });
    expect(next[0].text).toBe("a");
    expect(next[1].text).toBe("changed");
  });

  it("preserves unpatched fields", () => {
    const next = updateById([item("a", "a", true)], "a", { text: "x" });
    expect(next[0].done).toBe(true);
  });

  it("is a no-op for an unknown id", () => {
    const list = [item("a")];
    expect(updateById(list, "nope", { text: "x" })).toEqual(list);
  });

  it("does not mutate the original items", () => {
    const list = [item("a")];
    updateById(list, "a", { text: "changed" });
    expect(list[0].text).toBe("a");
  });
});

describe("removeById", () => {
  it("removes the matching item and preserves order", () => {
    const list = [item("a"), item("b"), item("c")];
    expect(removeById(list, "b").map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("is a no-op for an unknown id", () => {
    expect(removeById([item("a")], "nope")).toHaveLength(1);
  });
});

describe("toggleById", () => {
  it("flips done in both directions", () => {
    const once = toggleById([item("a")], "a");
    expect(once[0].done).toBe(true);
    expect(toggleById(once, "a")[0].done).toBe(false);
  });

  it("leaves other items untouched", () => {
    const next = toggleById([item("a"), item("b")], "a");
    expect(next[1].done).toBe(false);
  });
});

describe("cap enforcement end-to-end", () => {
  // Mirrors how the Quarter and Week views enforce their three-item limits.
  it("never exceeds the cap however many adds are attempted", () => {
    let list: Item[] = [];
    for (let i = 0; i < 10; i++) list = addCapped(list, item(`i${i}`), 3);
    expect(list).toHaveLength(3);
    expect(list.map((i) => i.id)).toEqual(["i0", "i1", "i2"]);
  });

  it("frees a slot after a removal", () => {
    let list = [item("a"), item("b"), item("c")];
    list = removeById(list, "b");
    list = addCapped(list, item("d"), 3);
    expect(list.map((i) => i.id)).toEqual(["a", "c", "d"]);
  });
});
