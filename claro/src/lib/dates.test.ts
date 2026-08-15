import { describe, expect, it } from "vitest";

import {
  SCHEDULE_HOURS,
  formatDayDate,
  formatDayId,
  formatDayWeekday,
  formatHourLabel,
  formatQuarterId,
  formatQuarterMonths,
  formatQuarterShort,
  formatWeekId,
  formatWeekNumber,
  formatWeekRange,
  parseDayId,
  parseQuarterId,
  parseWeekId,
  quarterOfDay,
  quarterOfWeek,
  quarterRange,
  shiftDayId,
  shiftQuarterId,
  shiftWeekId,
  weekDayIds,
  weekOfDay,
  weekRange,
} from "./dates";

describe("id formatting", () => {
  it("formats a day id", () => {
    expect(formatDayId(new Date(2026, 7, 15))).toBe("2026-08-15");
  });

  it("formats quarter ids across all four quarters", () => {
    expect(formatQuarterId(new Date(2026, 0, 1))).toBe("2026-Q1");
    expect(formatQuarterId(new Date(2026, 4, 20))).toBe("2026-Q2");
    expect(formatQuarterId(new Date(2026, 7, 15))).toBe("2026-Q3");
    expect(formatQuarterId(new Date(2026, 11, 31))).toBe("2026-Q4");
  });

  it("zero-pads week numbers", () => {
    expect(formatWeekId(new Date(2026, 0, 1))).toBe("2026-W01");
  });
});

describe("ISO week-year boundaries", () => {
  // The classic off-by-one: using getYear() instead of getISOWeekYear() puts
  // these in the wrong year entirely.
  it("puts 2027-01-01 in week 53 of week-year 2026", () => {
    expect(formatWeekId(new Date(2027, 0, 1))).toBe("2026-W53");
  });

  it("puts late December 2025 in week 1 of 2026", () => {
    expect(formatWeekId(new Date(2025, 11, 29))).toBe("2026-W01");
  });

  it("round-trips a week id through its Monday", () => {
    expect(formatDayId(parseWeekId("2026-W33"))).toBe("2026-08-10");
    expect(formatWeekId(parseWeekId("2026-W33"))).toBe("2026-W33");
  });

  it("resolves week 1 to a Monday in the previous calendar year", () => {
    expect(formatDayId(parseWeekId("2026-W01"))).toBe("2025-12-29");
  });
});

describe("parsing", () => {
  it("parses a day id as local midnight, not UTC", () => {
    const d = parseDayId("2026-08-15");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(15); // would be the 14th if parsed as UTC
  });

  it("parses a quarter id to its first day", () => {
    expect(formatDayId(parseQuarterId("2026-Q3"))).toBe("2026-07-01");
    expect(formatDayId(parseQuarterId("2026-Q1"))).toBe("2026-01-01");
  });
});

describe("quarterOfWeek — resolves via the week's Thursday", () => {
  // A week straddling a boundary must belong to the quarter owning most of it.
  // Thursday is the 4th of 7 days, so it is always on the majority side.
  it("assigns a straddling week to the majority quarter", () => {
    // 2026-W14 runs Mar 30 (Mon, Q1) – Apr 5 (Sun, Q2): 5 of 7 days in Q2.
    expect(formatDayId(parseWeekId("2026-W14"))).toBe("2026-03-30");
    expect(quarterOfWeek("2026-W14")).toBe("2026-Q2");
  });

  it("would be wrong if it used Monday", () => {
    // Guards the rule itself: Monday's quarter differs from the answer.
    expect(formatQuarterId(parseWeekId("2026-W14"))).toBe("2026-Q1");
    expect(quarterOfWeek("2026-W14")).not.toBe("2026-Q1");
  });

  it("keeps a year-straddling week in the outgoing quarter", () => {
    // 2026-W53 runs Dec 28 2026 – Jan 3 2027; Thursday is Dec 31.
    expect(quarterOfWeek("2026-W53")).toBe("2026-Q4");
  });
});

describe("hierarchy resolution", () => {
  it("maps a day to its week and quarter", () => {
    expect(weekOfDay("2026-08-15")).toBe("2026-W33");
    expect(quarterOfDay("2026-08-15")).toBe("2026-Q3");
  });

  it("maps a boundary day through its week, not its own date", () => {
    // Mar 30 is in Q1 by date, but its week belongs to Q2 — the day follows
    // its week, so Today and Week never disagree about the parent quarter.
    expect(formatQuarterId(parseDayId("2026-03-30"))).toBe("2026-Q1");
    expect(quarterOfDay("2026-03-30")).toBe("2026-Q2");
  });
});

describe("navigation", () => {
  it("shifts days across a month boundary", () => {
    expect(shiftDayId("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftDayId("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("shifts weeks across a year boundary", () => {
    expect(shiftWeekId("2026-W33", 1)).toBe("2026-W34");
    expect(shiftWeekId("2026-W53", 1)).toBe("2027-W01");
    expect(shiftWeekId("2026-W01", -1)).toBe("2025-W52");
  });

  it("shifts quarters across a year boundary", () => {
    expect(shiftQuarterId("2026-Q3", 1)).toBe("2026-Q4");
    expect(shiftQuarterId("2026-Q4", 1)).toBe("2027-Q1");
    expect(shiftQuarterId("2026-Q1", -1)).toBe("2025-Q4");
  });

  it("returns to the origin after shifting out and back", () => {
    expect(shiftWeekId(shiftWeekId("2026-W01", -3), 3)).toBe("2026-W01");
    expect(shiftQuarterId(shiftQuarterId("2026-Q1", -5), 5)).toBe("2026-Q1");
  });
});

describe("ranges", () => {
  it("returns Monday–Sunday for a week", () => {
    const { start, end } = weekRange("2026-W33");
    expect(formatDayId(start)).toBe("2026-08-10");
    expect(formatDayId(end)).toBe("2026-08-16");
  });

  it("returns seven consecutive day ids, Monday first", () => {
    const days = weekDayIds("2026-W33");
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-08-10");
    expect(days[6]).toBe("2026-08-16");
    expect(new Set(days).size).toBe(7);
  });

  it("returns the first and last day of a quarter", () => {
    const { start, end } = quarterRange("2026-Q3");
    expect(formatDayId(start)).toBe("2026-07-01");
    expect(formatDayId(end)).toBe("2026-09-30");
  });
});

describe("labels", () => {
  it("labels days, weeks and quarters", () => {
    expect(formatDayWeekday("2026-08-15")).toBe("Saturday");
    expect(formatDayDate("2026-08-15")).toBe("15 August 2026");
    expect(formatWeekNumber("2026-W33")).toBe("Week 33");
    expect(formatWeekNumber("2026-W01")).toBe("Week 1"); // no leading zero on display
    expect(formatQuarterShort("2026-Q3")).toBe("Q3 2026");
    expect(formatQuarterMonths("2026-Q3")).toBe("July – September");
  });

  it("collapses the month when a week sits inside one", () => {
    expect(formatWeekRange("2026-W33")).toBe("10 – 16 August 2026");
  });

  it("shows both months when a week spans two", () => {
    expect(formatWeekRange("2026-W14")).toBe("30 Mar – 5 Apr 2026");
  });
});

describe("schedule grid", () => {
  it("covers 05:00 to 22:00 inclusive", () => {
    expect(SCHEDULE_HOURS).toHaveLength(18);
    expect(SCHEDULE_HOURS[0]).toBe("05:00");
    expect(SCHEDULE_HOURS[17]).toBe("22:00");
  });

  it("renders 12-hour labels with correct noon and midnight handling", () => {
    expect(formatHourLabel("05:00")).toBe("5 AM");
    expect(formatHourLabel("11:00")).toBe("11 AM");
    expect(formatHourLabel("12:00")).toBe("12 PM"); // not "0 PM"
    expect(formatHourLabel("13:00")).toBe("1 PM");
    expect(formatHourLabel("22:00")).toBe("10 PM");
  });
});
