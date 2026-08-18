import { describe, expect, it } from "vitest";

import { writePriority } from "./priorities";
import { blankPriority } from "./storage";
import type { Priority } from "./types";

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
