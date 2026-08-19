/**
 * Private cycle awareness.
 *
 * Everything here is arithmetic on the user's *own* logged dates and nothing
 * else. There is no model, no population average and no inference: an estimate
 * is the median of the gaps this person has actually recorded, labelled as an
 * estimate, and withheld entirely until there is enough history to mean
 * anything.
 *
 * Deliberately absent, and to stay absent: any medical, fertility,
 * contraception, pregnancy, diagnostic, nutrition, supplement or
 * symptom-treatment interpretation — and any suggestion that a phase should
 * change what someone works on.
 */

import { addDays, differenceInCalendarDays } from "date-fns";

import { formatDayId, parseDayId } from "./dates";
import type { CycleEntry, CycleState, ISODate } from "./types";

/** Below this there is no history to speak from, so nothing is estimated. */
export const MIN_ENTRIES_FOR_ESTIMATE = 3;

/** Gaps outside this range are left out of the estimate as likely mis-logs. */
const PLAUSIBLE_GAP = { min: 15, max: 60 };

export function sortedEntries(cycle: CycleState): CycleEntry[] {
  return Object.values(cycle.entries).sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** The day counts between consecutive logged starts, oldest first. */
export function gaps(entries: CycleEntry[]): number[] {
  const result: number[] = [];
  for (let i = 1; i < entries.length; i += 1) {
    result.push(
      differenceInCalendarDays(
        parseDayId(entries[i].startDate),
        parseDayId(entries[i - 1].startDate),
      ),
    );
  }
  return result;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

export type CycleEstimate = {
  /** The user's own median gap, in days. */
  typicalGap: number;
  nextStart: ISODate;
  /** How many gaps the estimate was drawn from — shown, not hidden. */
  basedOn: number;
};

/**
 * Null whenever there is not enough of the user's own history to say anything.
 * A median is used rather than a mean so one unusual month does not drag the
 * estimate around.
 */
export function estimateNext(cycle: CycleState): CycleEstimate | null {
  const entries = sortedEntries(cycle);
  if (entries.length < MIN_ENTRIES_FOR_ESTIMATE) return null;

  const usable = gaps(entries).filter(
    (gap) => gap >= PLAUSIBLE_GAP.min && gap <= PLAUSIBLE_GAP.max,
  );
  if (usable.length === 0) return null;

  const typicalGap = median(usable);
  const last = entries[entries.length - 1];

  return {
    typicalGap,
    nextStart: formatDayId(addDays(parseDayId(last.startDate), typicalGap)),
    basedOn: usable.length,
  };
}

/** True when the day is a logged start. Used only to mark the calendar. */
export function isLoggedStart(cycle: CycleState, dayId: ISODate): boolean {
  return Object.values(cycle.entries).some((entry) => entry.startDate === dayId);
}

export function entryOn(cycle: CycleState, dayId: ISODate): CycleEntry | null {
  return Object.values(cycle.entries).find((entry) => entry.startDate === dayId) ?? null;
}
