/**
 * The next seven days, and what Claro can honestly say about them.
 *
 * It can say which estimated cycle day each one falls on, whether it lands in
 * the estimated next-period window, and whether the user has written anything
 * at that point in past cycles. All three are arithmetic on dates they typed.
 *
 * It cannot say how anyone will feel, how much they will be capable of, or what
 * they should do, and it does not try. There is no energy forecast here and
 * there is no descriptor telling somebody to protect anything: a strip that
 * announces Thursday will be hard makes Thursday hard.
 */

import { estimatedWindow } from "./cycle-calendar";
import { isPeriodDay } from "./cycle";
import { notesInBand, positionOn, type CycleBand } from "./cycle-timeline";
import { shiftDayId } from "./dates";
import type { CycleCheckIn, CycleState, ISODate } from "./types";

export type ForecastDay = {
  dayId: ISODate;
  /** Estimated day of the cycle, or null without enough history. */
  cycleDay: number | null;
  band: CycleBand | null;
  /** A day the user actually logged a period on. */
  isPeriod: boolean;
  /** Inside the estimated next-period window. Never both. */
  isEstimated: boolean;
  /** The user wrote something around this point in a past cycle. */
  hasPastNotes: boolean;
  isToday: boolean;
};

export const FORECAST_DAYS = 7;

export function forecast(
  cycle: CycleState,
  todayId: ISODate,
  days = FORECAST_DAYS,
): ForecastDay[] {
  const window = estimatedWindow(cycle);

  return Array.from({ length: days }, (_, i) => {
    const dayId = shiftDayId(todayId, i);
    const position = positionOn(cycle, dayId);
    const isPeriod = isPeriodDay(cycle, dayId, todayId);

    return {
      dayId,
      cycleDay: position?.day ?? null,
      band: position?.band ?? null,
      isPeriod,
      // A confirmed day is never also an estimate, exactly as on the calendar.
      isEstimated: !isPeriod && window !== null && dayId >= window.from && dayId <= window.to,
      hasPastNotes: notesInBand(cycle, dayId, 1).length > 0,
      isToday: dayId === todayId,
    };
  });
}

/**
 * The user's own past notes from the same part of the cycle as a given day, at
 * most one per past cycle.
 *
 * Consecutive days of one cycle are the same occasion twice. Showing "on the
 * 20th you logged low energy" directly above "on the 21st you logged low
 * energy" reads as padding, and buries the second cycle that would actually
 * have been worth seeing.
 */
export function pastNotesFor(cycle: CycleState, dayId: ISODate, limit = 3): CycleCheckIn[] {
  const seen = new Set<string>();
  const picked: CycleCheckIn[] = [];

  // Ask for a wide window, then thin it: the cap is per cycle, not per note.
  for (const note of notesInBand(cycle, dayId, limit * 6)) {
    const anchor = positionOn(cycle, note.dayId)?.since;
    if (!anchor || seen.has(anchor)) continue;
    seen.add(anchor);
    picked.push(note);
    if (picked.length === limit) break;
  }

  return picked;
}
