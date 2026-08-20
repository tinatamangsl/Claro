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

import { addDays } from "date-fns";

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
  /** Estimated next-period day. Never true where `period` is true. */
  estimated: boolean;
  estimatedStart: boolean;
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

  const history = durationHistory(cycle);
  const length = history ? history.typical : 1;

  return {
    from: estimate.nextStart,
    to: formatDayId(addDays(parseDayId(estimate.nextStart), length - 1)),
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

  const window = estimatedWindow(cycle);
  const estimated = window !== null && dayId >= window.from && dayId <= window.to;

  return {
    ...BLANK,
    dayId,
    note,
    estimated,
    estimatedStart: estimated && dayId === window.from,
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
