/**
 * What each day on the cycle calendar is, and how it may be drawn.
 *
 * The whole point of this module is one distinction: a **confirmed** day is one
 * the user logged, and an **estimated** day is arithmetic. They must never be
 * shown as the same thing, and they can never be the same day — `estimated` is
 * refused outright on any day that is already confirmed, so a colour can only
 * ever mean one of them.
 *
 * Nothing here predicts fertility, ovulation or pregnancy, and nothing draws a
 * window Claro has not been given the dates for.
 */

import { addDays, differenceInCalendarDays } from "date-fns";

import {
  confirmedRange,
  durationHistory,
  estimateNext,
  hasCheckIn,
  isOngoing,
  periodEntryOn,
  type DayRange,
} from "./cycle";
import { formatDayId, parseDayId } from "./dates";
import type { CycleState, ISODate } from "./types";

export type CycleDayMark = {
  dayId: ISODate;
  /** Logged by the user. The only kind of day that is coloured solidly. */
  period: boolean;
  /** First and last confirmed day of that period, for drawing the ends. */
  isStart: boolean;
  isEnd: boolean;
  /** True while that period has no end date yet. */
  ongoing: boolean;
  /** An estimated period day. Never true where `period` is true. */
  estimated: boolean;
  estimatedStart: boolean;
  /**
   * How many cycles ahead this estimate is: 0 is the next period, 1 the one
   * after, and so on. Later ones are drawn fainter, because an estimate five
   * cycles out rests on the same handful of dates as the first and should not
   * look as though it rests on more.
   */
  estimatedAhead: number;
  /** The user wrote a private note on this day. */
  note: boolean;
};

const BLANK: Omit<CycleDayMark, "dayId"> = {
  period: false,
  isStart: false,
  isEnd: false,
  ongoing: false,
  estimated: false,
  estimatedStart: false,
  estimatedAhead: 0,
  note: false,
};

/**
 * The days the next period is estimated to cover.
 *
 * Its length comes from the user's own completed periods. With none recorded,
 * the window is the single estimated start day — Claro will not guess how long
 * a period lasts for someone who has never told it.
 */
export function estimatedWindow(cycle: CycleState): DayRange | null {
  const estimate = estimateNext(cycle);
  if (!estimate) return null;

  return {
    from: estimate.nextStart,
    to: formatDayId(addDays(parseDayId(estimate.nextStart), estimatedPeriodLength(cycle) - 1)),
  };
}

/**
 * How long an estimated period is drawn for.
 *
 * The user's own median where they have closed a period, and a single day where
 * they have not: Claro will not guess how long somebody bleeds for.
 */
export function estimatedPeriodLength(cycle: CycleState): number {
  return durationHistory(cycle)?.typical ?? 1;
}

export type EstimatedDay = { inWindow: boolean; isStart: boolean; ahead: number };

const NOT_ESTIMATED: EstimatedDay = { inWindow: false, isStart: false, ahead: 0 };

/**
 * Whether a day falls in *any* estimated period, however far ahead.
 *
 * A calendar somebody scrolls through to plan a year needs every projected
 * period on it, not only the next one. Worked out with modular arithmetic
 * rather than by building a list, so marking a day in 2029 costs the same as
 * marking tomorrow.
 *
 * Forward only: the estimate is projected from the last logged start, and
 * running it backwards would draw periods over months the user actually lived
 * and may have logged differently.
 */
export function estimatedPeriodOn(cycle: CycleState, dayId: ISODate): EstimatedDay {
  const estimate = estimateNext(cycle);
  if (!estimate) return NOT_ESTIMATED;

  const delta = differenceInCalendarDays(parseDayId(dayId), parseDayId(estimate.nextStart));
  if (delta < 0) return NOT_ESTIMATED;

  const offset = delta % estimate.typicalGap;
  return {
    inWindow: offset < estimatedPeriodLength(cycle),
    isStart: offset === 0,
    ahead: Math.floor(delta / estimate.typicalGap),
  };
}

export function markFor(cycle: CycleState, dayId: ISODate, todayId: ISODate): CycleDayMark {
  const entry = periodEntryOn(cycle, dayId, todayId);
  const note = hasCheckIn(cycle, dayId);

  if (entry) {
    const range = confirmedRange(cycle, entry, todayId);
    return {
      ...BLANK,
      dayId,
      note,
      period: true,
      isStart: dayId === range.from,
      isEnd: dayId === range.to,
      ongoing: isOngoing(cycle, entry),
    };
  }

  const ahead = estimatedPeriodOn(cycle, dayId);

  return {
    ...BLANK,
    dayId,
    note,
    estimated: ahead.inWindow,
    estimatedStart: ahead.inWindow && ahead.isStart,
    estimatedAhead: ahead.ahead,
  };
}

/** One mark per day, for a month grid or any other run of days. */
export function monthMarks(
  cycle: CycleState,
  dayIds: ISODate[],
  todayId: ISODate,
): Map<ISODate, CycleDayMark> {
  return new Map(dayIds.map((dayId) => [dayId, markFor(cycle, dayId, todayId)]));
}

/** True when a mark carries nothing worth drawing. */
export function isBlankMark(mark: CycleDayMark): boolean {
  return !mark.period && !mark.estimated && !mark.note;
}
