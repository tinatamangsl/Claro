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
import type { CycleCheckIn, CycleEntry, CycleState, ISODate } from "./types";

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

// ------------------------------------------------------------- check-ins

/**
 * The optional private note for a day, or a blank one.
 *
 * Reading never creates a record: a day only gains a note when the user
 * actually writes one, which keeps "delete all" honest about what existed.
 */
export function checkInOn(cycle: CycleState, dayId: ISODate): CycleCheckIn {
  return (
    cycle.checkIns[dayId] ?? {
      dayId,
      energy: null,
      mood: null,
      stress: null,
      note: "",
      updatedAt: "",
    }
  );
}

export function hasCheckIn(cycle: CycleState, dayId: ISODate): boolean {
  const note = cycle.checkIns[dayId];
  if (!note) return false;
  return (
    note.energy !== null ||
    note.mood !== null ||
    note.stress !== null ||
    note.note.trim() !== ""
  );
}

/** Every note the user has written, most recent first. */
export function recentCheckIns(cycle: CycleState, limit = 14): CycleCheckIn[] {
  return Object.values(cycle.checkIns)
    .filter(
      (note) =>
        note.energy !== null ||
        note.mood !== null ||
        note.stress !== null ||
        note.note.trim() !== "",
    )
    .sort((a, b) => b.dayId.localeCompare(a.dayId))
    .slice(0, limit);
}

/** True when there is anything at all that "delete all" would remove. */
export function hasAnyCycleData(cycle: CycleState): boolean {
  return (
    cycle.settings.enabled ||
    cycle.settings.optedInAt !== null ||
    Object.keys(cycle.entries).length > 0 ||
    Object.keys(cycle.checkIns).length > 0
  );
}

/**
 * The days covered by a logged period start, for marking the calendar.
 *
 * This is only the days the user recorded, extended by nothing. Claro does not
 * infer a length, a phase, a window, or anything else about a body.
 */
export function loggedStartDays(cycle: CycleState): Set<ISODate> {
  return new Set(Object.values(cycle.entries).map((entry) => entry.startDate));
}

// ------------------------------------------------- editing logged starts

/** Two entries on the same date would double-count a gap and skew the estimate. */
export function hasStartOn(cycle: CycleState, startDate: ISODate, ignoreId?: string): boolean {
  return Object.values(cycle.entries).some(
    (entry) => entry.startDate === startDate && entry.id !== ignoreId,
  );
}

export type LogResult =
  | { ok: true; entries: Record<string, CycleEntry> }
  | { ok: false; reason: "duplicate" | "future" | "invalid" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Adds a logged start.
 *
 * Refuses a duplicate rather than silently merging it, and refuses a future
 * date because a start that has not happened cannot be recorded as one. Both
 * refusals are reported so the interface can explain gently.
 */
export function addStart(
  cycle: CycleState,
  startDate: ISODate,
  id: string,
  now: Date,
  todayId: ISODate,
): LogResult {
  if (!ISO_DATE.test(startDate)) return { ok: false, reason: "invalid" };
  if (startDate > todayId) return { ok: false, reason: "future" };
  if (hasStartOn(cycle, startDate)) return { ok: false, reason: "duplicate" };

  return {
    ok: true,
    entries: { ...cycle.entries, [id]: { id, startDate, loggedAt: now.toISOString() } },
  };
}

/** Moves an existing entry to another date, under the same rules. */
export function editStart(
  cycle: CycleState,
  id: string,
  startDate: ISODate,
  todayId: ISODate,
): LogResult {
  const existing = cycle.entries[id];
  if (!existing) return { ok: false, reason: "invalid" };
  if (!ISO_DATE.test(startDate)) return { ok: false, reason: "invalid" };
  if (startDate > todayId) return { ok: false, reason: "future" };
  if (hasStartOn(cycle, startDate, id)) return { ok: false, reason: "duplicate" };

  return { ok: true, entries: { ...cycle.entries, [id]: { ...existing, startDate } } };
}

export const LOG_REFUSAL: Record<Exclude<LogResult, { ok: true }>["reason"], string> = {
  duplicate: "That date is already logged.",
  future: "That date has not happened yet.",
  invalid: "That does not look like a date.",
};
