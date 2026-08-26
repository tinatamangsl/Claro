import { describe, expect, it } from "vitest";

import {
  estimatedPeriodOn,
  estimatedWindow,
  isBlankMark,
  markFor,
  monthMarks,
} from "./cycle-calendar";
import { monthDayIds } from "./calendar";
import { blankCycle } from "./storage";
import type { CycleState, ISODate } from "./types";

type Spec = ISODate | [ISODate, ISODate | null];

const cycleWith = (...specs: Spec[]): CycleState => ({
  settings: { enabled: true, optedInAt: "2026-01-01T09:00:00.000Z", cycleLength: null },
  entries: Object.fromEntries(
    specs.map((spec, i) => {
      const [startDate, endDate] = Array.isArray(spec) ? spec : [spec, null];
      return [
        `e${i}`,
        { id: `e${i}`, startDate, endDate, loggedAt: `${startDate}T09:00:00.000Z` },
      ];
    }),
  ),
  checkIns: {},
  lastSeen: null,
  guidanceMatches: {},
});

const TODAY: ISODate = "2026-08-19";

describe("colouring a confirmed period", () => {
  it("marks every day from start through end as one range", () => {
    const cycle = cycleWith(["2026-08-03", "2026-08-06"]);

    const days: ISODate[] = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06"];
    for (const day of days) {
      expect(markFor(cycle, day, TODAY).period).toBe(true);
    }

    expect(markFor(cycle, "2026-08-02", TODAY).period).toBe(false);
    expect(markFor(cycle, "2026-08-07", TODAY).period).toBe(false);
  });

  it("rounds only the true ends of the range, so the middle draws continuously", () => {
    const cycle = cycleWith(["2026-08-03", "2026-08-06"]);

    expect(markFor(cycle, "2026-08-03", TODAY)).toMatchObject({ isStart: true, isEnd: false });
    expect(markFor(cycle, "2026-08-04", TODAY)).toMatchObject({ isStart: false, isEnd: false });
    expect(markFor(cycle, "2026-08-05", TODAY)).toMatchObject({ isStart: false, isEnd: false });
    expect(markFor(cycle, "2026-08-06", TODAY)).toMatchObject({ isStart: false, isEnd: true });
  });

  it("marks a one day period as both the start and the end", () => {
    const cycle = cycleWith(["2026-08-03", "2026-08-03"]);

    expect(markFor(cycle, "2026-08-03", TODAY)).toMatchObject({ isStart: true, isEnd: true });
  });

  it("stops an ongoing period at today and flags it as unfinished", () => {
    const cycle = cycleWith("2026-08-17");

    expect(markFor(cycle, "2026-08-18", TODAY)).toMatchObject({ period: true, ongoing: true });
    expect(markFor(cycle, TODAY, TODAY)).toMatchObject({ period: true, isEnd: true, ongoing: true });
    expect(markFor(cycle, "2026-08-20", TODAY).period).toBe(false);
  });
});

describe("the estimated window", () => {
  it("starts where the user's own median gap puts it", () => {
    const cycle = cycleWith("2026-06-01", "2026-06-29", "2026-07-27");

    expect(estimatedWindow(cycle)).toEqual({ from: "2026-08-24", to: "2026-08-24" });
  });

  it("is as long as the user's own recorded durations, once there are any", () => {
    const cycle = cycleWith(
      ["2026-06-01", "2026-06-04"],
      ["2026-06-29", "2026-07-02"],
      ["2026-07-27", "2026-07-30"],
    );

    // Four day periods, so a four day window: 24th through 27th.
    expect(estimatedWindow(cycle)).toEqual({ from: "2026-08-24", to: "2026-08-27" });
  });

  it("is nothing at all until there is enough history to estimate from", () => {
    expect(estimatedWindow(blankCycle())).toBeNull();
    expect(estimatedWindow(cycleWith("2026-06-01", "2026-06-29"))).toBeNull();
  });

  it("marks its own first day, so the calendar can draw an opening edge", () => {
    const cycle = cycleWith(
      ["2026-06-01", "2026-06-04"],
      ["2026-06-29", "2026-07-02"],
      ["2026-07-27", "2026-07-30"],
    );

    expect(markFor(cycle, "2026-08-24", TODAY)).toMatchObject({
      estimated: true,
      estimatedStart: true,
      period: false,
    });
    expect(markFor(cycle, "2026-08-25", TODAY)).toMatchObject({
      estimated: true,
      estimatedStart: false,
    });
    expect(markFor(cycle, "2026-08-28", TODAY).estimated).toBe(false);
  });
});

describe("an estimate is never confused with a logged day", () => {
  /**
   * The overlap is real, not contrived: a period still ongoing after more days
   * than the user's typical gap puts the estimated start inside it.
   */
  const overlapping = cycleWith("2026-04-06", "2026-05-04", "2026-06-01");
  const LATER: ISODate = "2026-07-05";

  it("puts the estimate inside a still ongoing period, which is the hard case", () => {
    expect(estimatedWindow(overlapping)).toEqual({ from: "2026-06-29", to: "2026-06-29" });
    expect(markFor(overlapping, "2026-06-29", LATER).period).toBe(true);
  });

  it("resolves it as confirmed, never as both", () => {
    const mark = markFor(overlapping, "2026-06-29", LATER);

    expect(mark.period).toBe(true);
    expect(mark.estimated).toBe(false);
  });

  it("holds for every day of a whole month", () => {
    for (const dayId of monthDayIds("2026-06")) {
      const mark = markFor(overlapping, dayId, LATER);
      expect(mark.period && mark.estimated).toBe(false);
    }
  });
});

describe("marks for a run of days", () => {
  it("returns one mark per day asked for", () => {
    const cycle = cycleWith(["2026-08-03", "2026-08-06"]);
    const days = monthDayIds("2026-08");

    const marks = monthMarks(cycle, days, TODAY);

    expect(marks.size).toBe(days.length);
    expect(marks.get("2026-08-04")?.period).toBe(true);
    expect(isBlankMark(marks.get("2026-08-20")!)).toBe(true);
  });

  it("carries the days the user wrote a note on", () => {
    const cycle: CycleState = {
      ...cycleWith("2026-08-03"),
      checkIns: {
        "2026-08-14": {
          dayId: "2026-08-14",
          energy: 2,
          mood: null,
          stress: null,
          feeling: null,
          flow: null,
          note: "",
          evening: null,
  noticed: "",
          updatedAt: "2026-08-14T20:00:00.000Z",
        },
      },
    };

    expect(markFor(cycle, "2026-08-14", TODAY).note).toBe(true);
    expect(markFor(cycle, "2026-08-15", TODAY).note).toBe(false);
  });
});

describe("estimating every future period, not only the next", () => {
  const REGULAR = () =>
    cycleWith(
      ["2026-06-01", "2026-06-04"],
      ["2026-06-29", "2026-07-02"],
      ["2026-07-27", "2026-07-30"],
    );

  it("repeats on the user's own gap, as far ahead as asked", () => {
    // Next start 24 Aug, then every 28 days.
    expect(estimatedPeriodOn(REGULAR(), "2026-08-24")).toMatchObject({
      inWindow: true,
      isStart: true,
      ahead: 0,
    });
    expect(estimatedPeriodOn(REGULAR(), "2026-09-21")).toMatchObject({
      inWindow: true,
      isStart: true,
      ahead: 1,
    });
    expect(estimatedPeriodOn(REGULAR(), "2027-05-31")).toMatchObject({
      inWindow: true,
      isStart: true,
    });
  });

  it("covers the whole estimated period, not just its first day", () => {
    for (const day of ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"] as ISODate[]) {
      expect(estimatedPeriodOn(REGULAR(), day).inWindow).toBe(true);
    }
    expect(estimatedPeriodOn(REGULAR(), "2026-09-25").inWindow).toBe(false);
  });

  it("counts how many cycles ahead it is, so later ones can be drawn fainter", () => {
    expect(estimatedPeriodOn(REGULAR(), "2026-08-24").ahead).toBe(0);
    expect(estimatedPeriodOn(REGULAR(), "2026-10-19").ahead).toBe(2);
  });

  it("projects forward only, never back over months the user lived", () => {
    expect(estimatedPeriodOn(REGULAR(), "2026-08-23").inWindow).toBe(false);
    expect(estimatedPeriodOn(REGULAR(), "2026-01-01").inWindow).toBe(false);
  });

  it("says nothing at all without enough history to project from", () => {
    expect(estimatedPeriodOn(blankCycle(), "2026-09-21").inWindow).toBe(false);
    expect(estimatedPeriodOn(cycleWith("2026-08-16"), "2026-09-21").inWindow).toBe(false);
  });

  it("never marks a logged day as an estimate, however far ahead", () => {
    const cycle = cycleWith(
      ["2026-06-01", "2026-06-04"],
      ["2026-06-29", "2026-07-02"],
      ["2026-07-27", "2026-07-30"],
      ["2026-08-24", "2026-08-27"],
    );

    // The 24th is now logged, so it is a record rather than a projection.
    expect(markFor(cycle, "2026-08-24", "2026-08-30")).toMatchObject({
      period: true,
      estimated: false,
    });
  });
});
