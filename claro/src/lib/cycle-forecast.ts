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
import { notesInPhase, positionOn } from "./cycle-timeline";
import type { CyclePhase } from "./cycle-phases";
import { shiftDayId } from "./dates";
import type { CycleCheckIn, CycleState, EnergyLevel, Feeling, ISODate } from "./types";

export type ForecastDay = {
  dayId: ISODate;
  /** Estimated day of the cycle, or null without enough history. */
  cycleDay: number | null;
  phase: CyclePhase | null;
  /** A day the user actually logged a period on. */
  isPeriod: boolean;
  /** Inside the estimated next-period window. Never both. */
  isEstimated: boolean;
  /** The user wrote something around this point in a past cycle. */
  hasPastNotes: boolean;
  /**
   * What the user recorded on this day, if anything.
   *
   * Deliberately **logged**, never predicted. There is no `energyPrediction`
   * beside it and there must not be: a strip that tells somebody on Monday what
   * Thursday will feel like is guessing, and the guess shapes the day.
   */
  loggedEnergy: EnergyLevel | null;
  feeling: Feeling | null;
  isToday: boolean;
  /** Days from today. Negative is the past, which cannot be logged forward. */
  offset: number;
};

/** Three back, today, three ahead. */
export const FORECAST_BACK = 3;
export const FORECAST_AHEAD = 3;
export const FORECAST_DAYS = FORECAST_BACK + 1 + FORECAST_AHEAD;

export function forecast(
  cycle: CycleState,
  todayId: ISODate,
  back = FORECAST_BACK,
  ahead = FORECAST_AHEAD,
): ForecastDay[] {
  const window = estimatedWindow(cycle);

  return Array.from({ length: back + 1 + ahead }, (_, i) => {
    const offset = i - back;
    const dayId = shiftDayId(todayId, offset);
    const position = positionOn(cycle, dayId);
    const isPeriod = isPeriodDay(cycle, dayId, todayId);
    const note = cycle.checkIns[dayId] ?? null;

    return {
      dayId,
      cycleDay: position?.day ?? null,
      phase: position?.phase ?? null,
      isPeriod,
      // A confirmed day is never also an estimate, exactly as on the calendar.
      isEstimated: !isPeriod && window !== null && dayId >= window.from && dayId <= window.to,
      hasPastNotes: notesInPhase(cycle, dayId, 1).length > 0,
      loggedEnergy: note?.energy ?? null,
      feeling: note?.feeling ?? null,
      isToday: dayId === todayId,
      offset,
    };
  });
}

/** Where today sits in the strip, which is the card to open on. */
export function todayIndex(days: ForecastDay[]): number {
  const found = days.findIndex((day) => day.isToday);
  return found === -1 ? 0 : found;
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
  for (const note of notesInPhase(cycle, dayId, limit * 6)) {
    const anchor = positionOn(cycle, note.dayId)?.since;
    if (!anchor || seen.has(anchor)) continue;
    seen.add(anchor);
    picked.push(note);
    if (picked.length === limit) break;
  }

  return picked;
}
