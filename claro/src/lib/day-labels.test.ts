import { describe, expect, it } from "vitest";

import { addLabel, labelsOf, removeSpan, renameSpan, spansOf } from "./day-labels";
import { blankDay } from "./storage";
import type { Day, DayLabel, ISODate } from "./types";

const day = (id: string) => blankDay(id);

describe("labelling a day", () => {
  it("keeps the words and the span it belongs to", () => {
    const next = addLabel(day("2026-09-21"), "Office day", "s1");

    expect(labelsOf(next).map((l) => [l.text, l.spanId])).toEqual([["Office day", "s1"]]);
  });

  it("trims, and refuses a blank one", () => {
    expect(labelsOf(addLabel(day("2026-09-21"), "  Office day  ", "s1"))[0].text).toBe("Office day");

    const start = day("2026-09-21");
    expect(addLabel(start, "   ", "s1")).toBe(start);
  });

  it("reads a day written before labels existed", () => {
    // Additive field: an old record simply has none, and must not throw.
    const legacy = { ...day("2026-09-21"), dayLabels: undefined } as unknown as Day;

    expect(labelsOf(legacy)).toEqual([]);
  });

  it("holds more than one, because a day can be two things", () => {
    const next = addLabel(addLabel(day("2026-09-21"), "Annual leave", "s1"), "Dentist", "s2");

    expect(labelsOf(next).map((l) => l.text)).toEqual(["Annual leave", "Dentist"]);
  });
});

describe("changing a stretch", () => {
  const leave = () => addLabel(addLabel(day("2026-09-21"), "Leve", "s1"), "Dentist", "s2");

  it("renames only its own span", () => {
    const next = renameSpan(leave(), "s1", "Leave");

    expect(labelsOf(next).map((l) => l.text)).toEqual(["Leave", "Dentist"]);
  });

  it("treats emptying it as removing it", () => {
    /*
     * A label with nothing in it is not a label, and sending somebody to find
     * a separate delete control for something they have already cleared is how
     * stray rows get left behind.
     */
    const next = renameSpan(leave(), "s1", "   ");

    expect(labelsOf(next).map((l) => l.text)).toEqual(["Dentist"]);
  });

  it("leaves a day that was never part of the stretch alone", () => {
    const other = leave();
    expect(renameSpan(other, "nope", "Leave")).toBe(other);
    expect(removeSpan(other, "nope")).toBe(other);
  });
});

// ------------------------------------------------------------------ the band

const week: ISODate[] = [
  "2026-09-21",
  "2026-09-22",
  "2026-09-23",
  "2026-09-24",
  "2026-09-25",
  "2026-09-26",
  "2026-09-27",
];

const label = (text: string, spanId: string): DayLabel => ({ id: `${spanId}-x`, text, spanId });

const from = (byDay: Record<string, DayLabel[]>) => (dayId: ISODate) => byDay[dayId] ?? [];

describe("drawing the stretches across a week", () => {
  it("joins the days of one span into a single bar", () => {
    const leave = label("Annual leave", "s1");
    const lanes = spansOf(
      week,
      from({ "2026-09-22": [leave], "2026-09-23": [leave], "2026-09-24": [leave] }),
    );

    expect(lanes).toEqual([[{ spanId: "s1", text: "Annual leave", from: 1, to: 3 }]]);
  });

  it("breaks a stretch that has a day missing out of the middle", () => {
    const leave = label("Annual leave", "s1");
    const lanes = spansOf(week, from({ "2026-09-21": [leave], "2026-09-23": [leave] }));

    // Two pieces, because that is what is actually left. One bar papering over
    // Tuesday would say she was off on a day she was not.
    expect(lanes[0].map((s) => [s.from, s.to])).toEqual([
      [0, 0],
      [2, 2],
    ]);
  });

  it("keeps two spans apart even when they read the same", () => {
    const first = label("London", "s1");
    const second = label("London", "s2");
    const lanes = spansOf(week, from({ "2026-09-21": [first], "2026-09-22": [second] }));

    // Contiguity is by span, not by matching words: two separate trips.
    expect(lanes[0].map((s) => [s.spanId, s.from, s.to])).toEqual([
      ["s1", 0, 0],
      ["s2", 1, 1],
    ]);
  });

  it("gives overlapping stretches a lane each, so neither is hidden", () => {
    const leave = label("Annual leave", "s1");
    const trip = label("In Berlin", "s2");
    const lanes = spansOf(
      week,
      from({
        "2026-09-21": [leave],
        "2026-09-22": [leave, trip],
        "2026-09-23": [trip],
      }),
    );

    expect(lanes).toHaveLength(2);
    expect(lanes[0][0]).toMatchObject({ spanId: "s1", from: 0, to: 1 });
    expect(lanes[1][0]).toMatchObject({ spanId: "s2", from: 1, to: 2 });
  });

  it("reuses a lane once the bar in it has finished", () => {
    const early = label("Office day", "s1");
    const late = label("Office day", "s2");
    const lanes = spansOf(week, from({ "2026-09-21": [early], "2026-09-25": [late] }));

    // Two bars, one lane: the band is only as tall as it has to be.
    expect(lanes).toHaveLength(1);
    expect(lanes[0]).toHaveLength(2);
  });

  it("is empty when nothing is labelled", () => {
    expect(spansOf(week, () => [])).toEqual([]);
  });
});
