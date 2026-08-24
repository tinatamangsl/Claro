/**
 * Estimated phases, projected across the calendar.
 *
 * Two things are true at once here and both have to stay visible in the
 * interface. A phase drawn on a calendar is **arithmetic on the dates the user
 * logged**, using the ordinary convention that the luteal phase runs about
 * fourteen days: it is not a measurement, and a body does not read a calendar.
 * And a phase is still the most useful shape most people have for planning
 * around their own cycle, which is why it is drawn at all.
 *
 * What this module will not do is turn the ovulation band into a fertility
 * prediction. There is no fertile window, no chance of conception, no best time
 * to try and no pregnancy language anywhere in it or in anything that reads it.
 * A calendar cannot confirm that ovulation happened, let alone when, and the
 * interface says so wherever the band appears.
 */

import { differenceInCalendarDays } from "date-fns";

import { durationHistory, estimateNext, sortedEntries } from "./cycle";
import { parseDayId } from "./dates";
import type { CycleState, ISODate } from "./types";

export type CyclePhase = "menstrual" | "follicular" | "ovulation" | "luteal";

export const CYCLE_PHASES: CyclePhase[] = ["menstrual", "follicular", "ovulation", "luteal"];

export const PHASE_META: Record<CyclePhase, { label: string; short: string }> = {
  menstrual: { label: "Menstrual", short: "Period" },
  follicular: { label: "Follicular", short: "Follicular" },
  ovulation: { label: "Ovulation", short: "Ovulation" },
  luteal: { label: "Luteal", short: "Luteal" },
};

/**
 * The convention this rests on: the stretch after ovulation is roughly constant
 * at about fourteen days, and the variation between people sits before it. It
 * is the standard calendar method, and it is an approximation.
 */
export const LUTEAL_DAYS = 14;

/** Without recorded durations, the bleeding band is left at a nominal length. */
const FALLBACK_PERIOD_DAYS = 5;

/** Ovulation is drawn as a short band rather than a point, because a date cannot be pinned. */
const OVULATION_SPREAD = 1;

export type PhaseBands = {
  /** The cycle length the bands were divided from. */
  length: number;
  menstrual: { from: number; to: number };
  follicular: { from: number; to: number } | null;
  ovulation: { from: number; to: number };
  luteal: { from: number; to: number } | null;
};

/**
 * Where the bands fall for one person's own cycle length.
 *
 * Short cycles squeeze the follicular phase to nothing, which the arithmetic
 * has to survive rather than produce a band that runs backwards.
 */
export function phaseBands(cycle: CycleState): PhaseBands | null {
  const estimate = estimateNext(cycle);
  if (!estimate) return null;

  const length = estimate.typicalGap;
  const durations = durationHistory(cycle);
  const period = Math.min(durations?.typical ?? FALLBACK_PERIOD_DAYS, length);

  const ovulationDay = Math.max(period + 1, length - LUTEAL_DAYS);
  const ovulation = {
    from: Math.max(period + 1, ovulationDay - OVULATION_SPREAD),
    to: Math.min(length, ovulationDay + OVULATION_SPREAD),
  };

  return {
    length,
    menstrual: { from: 1, to: period },
    follicular: ovulation.from > period + 1 ? { from: period + 1, to: ovulation.from - 1 } : null,
    ovulation,
    luteal: ovulation.to < length ? { from: ovulation.to + 1, to: length } : null,
  };
}

export function phaseForDay(bands: PhaseBands, day: number): CyclePhase {
  if (day <= bands.menstrual.to) return "menstrual";
  if (day >= bands.ovulation.from && day <= bands.ovulation.to) return "ovulation";
  if (day < bands.ovulation.from) return "follicular";
  return "luteal";
}

export type ProjectedDay = {
  /** Estimated day of the cycle, counting the logged start as day 1. */
  day: number;
  phase: CyclePhase;
  length: number;
  /**
   * True once the count has run past the last logged start into cycles that
   * have not happened. Everything after that is projection, and is drawn more
   * faintly for exactly that reason.
   */
  projected: boolean;
};

/**
 * Which cycle day a date falls on, projecting forward as far as asked.
 *
 * Forward only. Counting backwards past the first logged start would invent
 * cycles nobody recorded, and the whole point of the projection is that it
 * rests on dates that exist.
 */
export function projectedDay(cycle: CycleState, dayId: ISODate): ProjectedDay | null {
  const bands = phaseBands(cycle);
  if (!bands) return null;

  const previous = sortedEntries(cycle)
    .filter((entry) => entry.startDate <= dayId)
    .at(-1);
  if (!previous) return null;

  const elapsed = differenceInCalendarDays(parseDayId(dayId), parseDayId(previous.startDate));
  if (elapsed < 0) return null;

  const day = (elapsed % bands.length) + 1;

  return {
    day,
    phase: phaseForDay(bands, day),
    length: bands.length,
    projected: elapsed >= bands.length,
  };
}

/**
 * The caveat that travels with every phase Claro draws.
 *
 * It is repeated rather than said once, because a colour on a calendar reads as
 * a fact and this one is not.
 */
export const PHASE_ESTIMATE_NOTE =
  "Phases are estimated from the dates you logged, using the usual calendar method. They are not a measurement, and your body does not follow a calendar.";

/**
 * Shown wherever the ovulation band appears.
 *
 * The band is the one place a cycle calendar turns into a fertility product,
 * and this is the sentence that stops it.
 */
export const OVULATION_NOTE =
  "A calendar cannot confirm whether or when ovulation happened. Claro does not show a fertile window or estimate a chance of pregnancy. If you are trying to conceive or to avoid it, please talk to a doctor, nurse or pharmacist.";
