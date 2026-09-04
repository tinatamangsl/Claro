import { describe, expect, it } from "vitest";

import {
  CYCLE_PHASES,
  LUTEAL_DAYS,
  OVULATION_NOTE,
  PHASE_ESTIMATE_NOTE,
  PHASE_META,
  phaseBands,
  phaseForDay,
  projectedDay,
} from "./cycle-phases";
import { blankCycle } from "./storage";
import type { CycleState, ISODate } from "./types";

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

/** Three starts 28 days apart, each period five days long. */
const REGULAR = () =>
  cycleWith(
    ["2026-06-01", "2026-06-05"],
    ["2026-06-29", "2026-07-03"],
    ["2026-07-27", "2026-07-31"],
  );

describe("dividing a cycle into phases", () => {
  it("says nothing at all without enough history to divide", () => {
    expect(phaseBands(blankCycle())).toBeNull();
    expect(phaseBands(cycleWith("2026-06-01"))).toBeNull();
    expect(projectedDay(blankCycle(), "2026-08-24")).toBeNull();
  });

  it("puts the bleeding days at the front, from the user's own durations", () => {
    const bands = phaseBands(REGULAR())!;

    expect(bands.length).toBe(28);
    expect(bands.menstrual).toEqual({ from: 1, to: 5 });
  });

  it("places ovulation by the usual convention, and says it is a band not a day", () => {
    const bands = phaseBands(REGULAR())!;

    // 28 minus a luteal phase of about 14 puts it around day 14.
    expect(bands.ovulation.from).toBe(28 - LUTEAL_DAYS - 1);
    expect(bands.ovulation.to).toBe(28 - LUTEAL_DAYS + 1);
    expect(bands.ovulation.to).toBeGreaterThan(bands.ovulation.from);
  });

  it("fills the gaps with follicular before and luteal after, leaving no unclaimed day", () => {
    const bands = phaseBands(REGULAR())!;

    const seen = new Set<string>();
    for (let day = 1; day <= bands.length; day += 1) seen.add(phaseForDay(bands, day));
    expect([...seen].sort()).toEqual([...CYCLE_PHASES].sort());

    // Ovulation sits at 13 to 15, so the two long bands close around it.
    expect(bands.follicular).toEqual({ from: 6, to: 12 });
    expect(bands.luteal).toEqual({ from: 16, to: 28 });
  });

  it("survives a short cycle rather than producing a band that runs backwards", () => {
    // 21 days with a 5 day period leaves almost nothing before ovulation.
    const short = cycleWith(
      ["2026-06-01", "2026-06-05"],
      ["2026-06-22", "2026-06-26"],
      ["2026-07-13", "2026-07-17"],
    );
    const bands = phaseBands(short)!;

    expect(bands.length).toBe(21);
    for (const band of [bands.menstrual, bands.ovulation, bands.follicular, bands.luteal]) {
      if (band) expect(band.to).toBeGreaterThanOrEqual(band.from);
    }
  });

  it("uses a nominal bleeding length only when the user has recorded none", () => {
    const noEnds = cycleWith("2026-06-01", "2026-06-29", "2026-07-27");

    expect(phaseBands(noEnds)!.menstrual).toEqual({ from: 1, to: 5 });
    // With real durations it uses theirs instead.
    const longer = cycleWith(
      ["2026-06-01", "2026-06-07"],
      ["2026-06-29", "2026-07-05"],
      ["2026-07-27", "2026-08-02"],
    );
    expect(phaseBands(longer)!.menstrual).toEqual({ from: 1, to: 7 });
  });
});

describe("projecting across the calendar", () => {
  it("counts from the most recent logged start", () => {
    const day = projectedDay(REGULAR(), "2026-07-31")!;

    expect(day.day).toBe(5);
    expect(day.phase).toBe("menstrual");
    expect(day.projected).toBe(false);
  });

  it("carries on into cycles that have not happened, so a year can be planned", () => {
    // Six months past the last logged start.
    const day = projectedDay(REGULAR(), "2027-01-19")!;

    expect(day.day).toBeGreaterThanOrEqual(1);
    expect(day.day).toBeLessThanOrEqual(28);
    expect(day.projected).toBe(true);
  });

  it("marks anything past the current cycle as projection, not record", () => {
    expect(projectedDay(REGULAR(), "2026-08-23")!.projected).toBe(false);
    // Day 29 onwards is a cycle nobody has logged yet.
    expect(projectedDay(REGULAR(), "2026-08-24")!.projected).toBe(true);
  });

  it("repeats on the cycle length, so the same day number comes round again", () => {
    const first = projectedDay(REGULAR(), "2026-08-10")!;
    const next = projectedDay(REGULAR(), "2026-09-07")!;

    expect(next.day).toBe(first.day);
    expect(next.phase).toBe(first.phase);
  });

  it("will not count backwards into cycles nobody logged", () => {
    expect(projectedDay(REGULAR(), "2026-05-01")).toBeNull();
  });
});

describe("what the phases are never allowed to say", () => {
  it("carries an estimate caveat wherever they are drawn", () => {
    expect(PHASE_ESTIMATE_NOTE).toContain("estimated from the dates you logged");
    expect(PHASE_ESTIMATE_NOTE).toContain("not a measurement");
  });

  it("refuses the fertility reading of the ovulation band", () => {
    expect(OVULATION_NOTE).toContain("cannot confirm");
    expect(OVULATION_NOTE.toLowerCase()).toContain("does not show a fertile window");
    expect(OVULATION_NOTE.toLowerCase()).toContain("chance of pregnancy");
  });

  it("keeps the labels to the phase names, with nothing about capability", () => {
    const labels = CYCLE_PHASES.flatMap((p) => [PHASE_META[p].label, PHASE_META[p].short])
      .join(" ")
      .toLowerCase();

    for (const banned of ["fertile", "pregnan", "energy", "productive", "best time"]) {
      expect(labels).not.toContain(banned);
    }
  });

  it("mentions fertility only to rule it out, never as something offered", () => {
    // The words have to be allowed in the refusal, or the sentence that stops
    // the feature becoming a fertility product could not be written.
    const sentences = [PHASE_ESTIMATE_NOTE, OVULATION_NOTE]
      .join(" ")
      .toLowerCase()
      .split(/(?<=[.?!])\s+/);

    for (const sentence of sentences) {
      for (const phrase of ["fertile window", "chance of pregnancy", "most fertile"]) {
        if (!sentence.includes(phrase)) continue;
        expect(sentence).toMatch(/\bnot\b|\bcannot\b|\bnever\b|does not/);
      }
    }
  });

  it("uses no em dashes or double hyphens", () => {
    for (const line of [PHASE_ESTIMATE_NOTE, OVULATION_NOTE]) {
      expect(line).not.toContain("—");
      expect(line).not.toContain("--");
    }
  });
});
