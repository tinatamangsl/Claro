import { describe, expect, it } from "vitest";

import { FORECAST_DAYS, forecast, pastNotesFor, todayIndex } from "./cycle-forecast";
import { blankCycle } from "./storage";
import type { CycleCheckIn, CycleState, ISODate } from "./types";

type Spec = ISODate | [ISODate, ISODate | null];

const cycleWith = (...specs: Spec[]): CycleState => ({
  ...blankCycle(),
  settings: { enabled: true, optedInAt: "2026-01-01T09:00:00.000Z", cycleLength: null, syncConsentAt: null },
  entries: Object.fromEntries(
    specs.map((spec, i) => {
      const [startDate, endDate] = Array.isArray(spec) ? spec : [spec, null];
      return [`e${i}`, { id: `e${i}`, startDate, endDate, loggedAt: "x" }];
    }),
  ),
});

const note = (dayId: ISODate, patch: Partial<CycleCheckIn> = {}): CycleCheckIn => ({
  dayId,
  energy: 2,
  mood: null,
  stress: null,
  feeling: null,
  flow: null,
  note: "",
  evening: null,
  noticed: "",
  journal: "",
  updatedAt: "x",
  ...patch,
});

const TODAY: ISODate = "2026-08-21";

describe("the next seven days", () => {
  it("centres on today: three back, today, three ahead", () => {
    const days = forecast(cycleWith(), TODAY);

    expect(days).toHaveLength(FORECAST_DAYS);
    expect(days[0].dayId).toBe("2026-08-18");
    expect(days[3].dayId).toBe(TODAY);
    expect(days[6].dayId).toBe("2026-08-24");
    expect(days.filter((d) => d.isToday)).toHaveLength(1);
  });

  it("opens on today's card, wherever today falls in the run", () => {
    const days = forecast(cycleWith(), TODAY);

    expect(todayIndex(days)).toBe(3);
    expect(days[todayIndex(days)].isToday).toBe(true);
  });

  it("signs the offset, so the past cannot be mistaken for the days ahead", () => {
    const days = forecast(cycleWith(), TODAY);

    expect(days.map((d) => d.offset)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
  });

  it("counts the estimated cycle day forward across the strip", () => {
    // Starts 28 days apart, the most recent 5 days before today.
    const cycle = cycleWith("2026-06-21", "2026-07-19", "2026-08-16");
    const days = forecast(cycle, TODAY);

    // Today is day 6, so the run reads day 3 through day 9.
    expect(days.map((d) => d.cycleDay)).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(days[3].cycleDay).toBe(6);
    // Three days back from day 6 is day 3, still bleeding.
    expect(days[0].phase).toBe("menstrual");
    expect(days[3].phase).toBe("follicular");
  });

  it("says nothing about a cycle day without enough history to count from", () => {
    const days = forecast(cycleWith("2026-08-16"), TODAY);

    expect(days.every((d) => d.cycleDay === null && d.phase === null)).toBe(true);
  });

  it("marks a logged period day, and never marks it as an estimate too", () => {
    const cycle = cycleWith("2026-06-21", "2026-07-19", ["2026-08-20", "2026-08-23"]);
    const days = forecast(cycle, TODAY);

    const marked = days.filter((d) => d.isPeriod).map((d) => d.dayId);
    expect(marked).toEqual(["2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23"]);
    expect(days.every((d) => !(d.isPeriod && d.isEstimated))).toBe(true);
  });

  it("marks the estimated next-period days in the window and nowhere else", () => {
    // Median gap 28 from a last start of 2026-08-16, so the estimate is 13 Sep,
    // well outside a strip that ends on the 27th.
    const near = cycleWith("2026-07-01", "2026-07-29", "2026-08-26");
    const days = forecast(near, TODAY);

    // Last start 26 Aug, gap 28, estimate 23 Sep: still nothing inside 7 days.
    expect(days.some((d) => d.isEstimated)).toBe(false);
  });

  it("flags a day the user has written about at this point before", () => {
    const cycle: CycleState = {
      ...cycleWith("2026-06-21", "2026-07-19", "2026-08-16"),
      checkIns: {
        // Day 6 of the previous cycle, the same band as today.
        "2026-07-24": note("2026-07-24"),
      },
    };

    const days = forecast(cycle, TODAY);
    // The note is from the same phase as today, not as the day three back.
    expect(days[todayIndex(days)].hasPastNotes).toBe(true);
    expect(pastNotesFor(cycle, TODAY).map((n) => n.dayId)).toEqual(["2026-07-24"]);
  });

  it("predicts no energy, no capacity and no instruction anywhere in its output", () => {
    const cycle = cycleWith("2026-06-21", "2026-07-19", "2026-08-16");
    const keys = new Set(Object.keys(forecast(cycle, TODAY)[0]));

    // The shape is the guarantee: there is nowhere for a forecast to live.
    expect(keys).toEqual(
      new Set([
        "dayId",
        "cycleDay",
        "phase",
        "isPeriod",
        "isEstimated",
        "hasPastNotes",
        "loggedEnergy",
        "feeling",
        "isToday",
        "offset",
      ]),
    );
    expect(keys.has("energyPrediction")).toBe(false);
    expect(keys.has("descriptor")).toBe(false);
  });

  it("carries the energy the user logged, and nothing for a day they did not", () => {
    const cycle: CycleState = {
      ...cycleWith("2026-06-21", "2026-07-19", "2026-08-16"),
      checkIns: { [TODAY]: note(TODAY, { energy: 4, feeling: "motivated" }) },
    };

    const days = forecast(cycle, TODAY);
    const today = days[todayIndex(days)];

    expect(today.loggedEnergy).toBe(4);
    expect(today.feeling).toBe("motivated");
    // Tomorrow has not been lived, so there is nothing to show for it.
    expect(days[todayIndex(days) + 1].loggedEnergy).toBeNull();
    expect(days[todayIndex(days) + 1].feeling).toBeNull();
  });
});

describe("past notes on the guide", () => {
  const seeded = (): CycleState => ({
    ...cycleWith("2026-06-21", "2026-07-19", "2026-08-16"),
    checkIns: Object.fromEntries(
      // Two consecutive days of one past cycle, one day of another.
      ["2026-07-24", "2026-07-25", "2026-06-26"].map((dayId) => [dayId, note(dayId as ISODate)]),
    ),
  });

  it("shows at most one note per past cycle, so it is not the same day twice", () => {
    const shown = pastNotesFor(seeded(), TODAY, 3);

    expect(shown.map((n) => n.dayId)).toEqual(["2026-07-25", "2026-06-26"]);
  });

  it("honours the limit in cycles, not in notes", () => {
    expect(pastNotesFor(seeded(), TODAY, 1).map((n) => n.dayId)).toEqual(["2026-07-25"]);
  });

  it("returns nothing when there is no position to compare against", () => {
    expect(pastNotesFor(cycleWith("2026-08-16"), TODAY)).toEqual([]);
  });
});
