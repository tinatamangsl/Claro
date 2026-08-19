import { describe, expect, it } from "vitest";

import { settleHours } from "./schedule";
import type { ScheduleItem } from "./types";

const at = (id: string, time: string, text = id): ScheduleItem => ({ id, time, text });

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
