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

import { formatDayId, formatDayShort, parseDayId } from "./dates";
import {
  MAX_STATED_CYCLE_DAYS,
  MIN_STATED_CYCLE_DAYS,
  type CycleCheckIn,
  type CycleEntry,
  type CycleState,
  type ISODate,
} from "./types";

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
  /** The length being used, in days. */
  typicalGap: number;
  nextStart: ISODate;
  /** How many gaps the estimate was drawn from — shown, not hidden. */
  basedOn: number;
  /**
   * Where the length came from, so the interface can say which it is.
   *
   * `"logged"` is the median of the user's real gaps. `"stated"` is the figure
   * they typed in, used only until there is enough history to do better.
   */
  source: "logged" | "stated";
};

/**
 * Null whenever there is not enough of the user's own history to say anything.
 * A median is used rather than a mean so one unusual month does not drag the
 * estimate around.
 *
 * **Start dates only.** A cycle is measured from the first day of one period to
 * the first day of the next, so how long a period lasted never enters this
 * calculation. Mixing the two is the classic way to get the number wrong.
 *
 * Falls back to the length the user stated when there is not yet enough history
 * to measure one. That is deliberately second in line: a figure somebody
 * remembers is a way to see something useful on day one, not a better answer
 * than the dates they went on to log.
 */
export function estimateNext(cycle: CycleState): CycleEstimate | null {
  const entries = sortedEntries(cycle);
  if (entries.length === 0) return null;

  const last = entries[entries.length - 1];
  const from = (typicalGap: number, basedOn: number, source: "logged" | "stated") => ({
    typicalGap,
    nextStart: formatDayId(addDays(parseDayId(last.startDate), typicalGap)),
    basedOn,
    source,
  });

  if (entries.length >= MIN_ENTRIES_FOR_ESTIMATE) {
    const usable = gaps(entries).filter(
      (gap) => gap >= PLAUSIBLE_GAP.min && gap <= PLAUSIBLE_GAP.max,
    );
    if (usable.length > 0) return from(median(usable), usable.length, "logged");
  }

  const stated = cycle.settings.cycleLength;
  if (stated !== null && stated >= MIN_STATED_CYCLE_DAYS && stated <= MAX_STATED_CYCLE_DAYS) {
    return from(stated, 0, "stated");
  }

  return null;
}

/** "3 weeks and 4 days" back into days, for a field that accepts either. */
export function clampStatedCycleLength(days: number): number | null {
  if (!Number.isFinite(days)) return null;
  const rounded = Math.round(days);
  if (rounded < MIN_STATED_CYCLE_DAYS || rounded > MAX_STATED_CYCLE_DAYS) return null;
  return rounded;
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
      feeling: null,
      flow: null,
      note: "",
      evening: null,
      // Every field of a blank note has to be here. A missing one arrives as
      // `undefined`, which is not `null` and not `""`, and anything asking
      // "has this been filled in?" then answers yes for a note nobody wrote.
      noticed: "",
      journal: "",
      // Read during render, so no clock is touched here. A blank note has never
      // been written and carries no time.
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
 * Every first day of a logged period. For marking a start specifically — the
 * full confirmed range is `confirmedRange`.
 */
export function loggedStartDays(cycle: CycleState): Set<ISODate> {
  return new Set(Object.values(cycle.entries).map((entry) => entry.startDate));
}

// ---------------------------------------------------------- period ranges

/**
 * A period is a **range**, and an end date is a fact only the person living it
 * can supply. So `endDate: null` is never filled in by Claro.
 *
 * Null has two honest readings, and they are told apart by whether anything was
 * logged afterwards:
 *
 * - the newest open period is **ongoing** — started, not yet ended;
 * - an older open period simply had **no end recorded**, because it was logged
 *   before Claro held ranges, or the user never came back to close it.
 *
 * Neither is invented into a length. An ongoing period is only ever confirmed
 * as far as today; a superseded open one is confirmed only for its first day.
 */
export function isOpen(entry: CycleEntry): boolean {
  return entry.endDate === null;
}

/** The newest open period, which is the only one that can still be running. */
export function ongoingPeriod(cycle: CycleState): CycleEntry | null {
  const newest = sortedEntries(cycle).at(-1);
  return newest && isOpen(newest) ? newest : null;
}

export function isOngoing(cycle: CycleState, entry: CycleEntry): boolean {
  return ongoingPeriod(cycle)?.id === entry.id;
}

export type DayRange = { from: ISODate; to: ISODate };

/**
 * The days this period is **confirmed** to cover, and not one day more.
 *
 * An ongoing period stops at today: tomorrow has not happened, so it cannot be
 * coloured in. An open period that has been superseded covers only its start,
 * because that is the only day anybody recorded.
 */
export function confirmedRange(cycle: CycleState, entry: CycleEntry, todayId: ISODate): DayRange {
  if (entry.endDate !== null) return { from: entry.startDate, to: entry.endDate };
  if (!isOngoing(cycle, entry)) return { from: entry.startDate, to: entry.startDate };
  return { from: entry.startDate, to: todayId < entry.startDate ? entry.startDate : todayId };
}

/** Inclusive day count: a period that starts and ends on one day lasted 1 day. */
export function rangeLength(range: DayRange): number {
  return differenceInCalendarDays(parseDayId(range.to), parseDayId(range.from)) + 1;
}

/**
 * How long a period lasted, in days.
 *
 * For an ongoing one this is how many days are confirmed **so far**, which is
 * why the interface says "so far" wherever it shows the number.
 */
export function durationOf(cycle: CycleState, entry: CycleEntry, todayId: ISODate): number {
  return rangeLength(confirmedRange(cycle, entry, todayId));
}

/** Only periods the user actually closed. An open one has no final length. */
export function completedPeriods(cycle: CycleState): CycleEntry[] {
  return sortedEntries(cycle).filter((entry) => entry.endDate !== null);
}

export type DurationHistory = {
  /** The most recently completed period. */
  last: number;
  min: number;
  max: number;
  /** The user's own median, used where a single number is needed. */
  typical: number;
  of: number;
};

/**
 * A description of the durations this person recorded, and nothing else.
 *
 * There is no comparison with anyone, no range that counts as usual, and no
 * judgement about a period being short or long. The numbers are read back the
 * way they were entered.
 */
export function durationHistory(cycle: CycleState): DurationHistory | null {
  const completed = completedPeriods(cycle);
  if (completed.length === 0) return null;

  const lengths = completed.map((entry) =>
    rangeLength({ from: entry.startDate, to: entry.endDate as ISODate }),
  );

  return {
    last: lengths[lengths.length - 1],
    min: Math.min(...lengths),
    max: Math.max(...lengths),
    typical: median(lengths),
    of: lengths.length,
  };
}

/** The logged period covering a day, if any. Confirmed days only. */
export function periodEntryOn(
  cycle: CycleState,
  dayId: ISODate,
  todayId: ISODate,
): CycleEntry | null {
  for (const entry of sortedEntries(cycle)) {
    const range = confirmedRange(cycle, entry, todayId);
    if (dayId >= range.from && dayId <= range.to) return entry;
  }
  return null;
}

export function isPeriodDay(cycle: CycleState, dayId: ISODate, todayId: ISODate): boolean {
  return periodEntryOn(cycle, dayId, todayId) !== null;
}

// --------------------------------------------------------------- overlaps

function rangesOverlap(a: DayRange, b: DayRange): boolean {
  return a.from <= b.to && b.from <= a.to;
}

/**
 * The first logged period a proposed range would collide with.
 *
 * Two periods cannot cover the same day: one of them would have to be wrong,
 * and silently keeping both would corrupt every duration and every gap drawn
 * from them. The colliding period is returned rather than a bare `false`, so
 * the interface can name the dates it clashes with instead of just refusing.
 */
export function overlapping(
  cycle: CycleState,
  range: DayRange,
  todayId: ISODate,
  ignoreId?: string,
): CycleEntry | null {
  for (const entry of sortedEntries(cycle)) {
    if (entry.id === ignoreId) continue;
    if (rangesOverlap(range, confirmedRange(cycle, entry, todayId))) return entry;
  }
  return null;
}

// ------------------------------------------------- adding and editing

/** Two entries on the same date would double-count a gap and skew the estimate. */
export function hasStartOn(cycle: CycleState, startDate: ISODate, ignoreId?: string): boolean {
  return Object.values(cycle.entries).some(
    (entry) => entry.startDate === startDate && entry.id !== ignoreId,
  );
}

export type PeriodInput = { startDate: ISODate; endDate: ISODate | null };

export type LogRefusal = "duplicate" | "future" | "invalid" | "backwards" | "overlap";

export type LogResult =
  | { ok: true; entries: Record<string, CycleEntry> }
  | { ok: false; reason: LogRefusal; conflict?: CycleEntry };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Every rule a proposed range has to pass, in the order that produces the most
 * useful explanation. Duplicate is checked before overlap because "that date is
 * already logged" says more than "that range overlaps another".
 */
function check(
  cycle: CycleState,
  input: PeriodInput,
  todayId: ISODate,
  ignoreId?: string,
): Extract<LogResult, { ok: false }> | null {
  if (!ISO_DATE.test(input.startDate)) return { ok: false, reason: "invalid" };
  if (input.endDate !== null && !ISO_DATE.test(input.endDate)) return { ok: false, reason: "invalid" };
  if (input.startDate > todayId) return { ok: false, reason: "future" };
  if (input.endDate !== null && input.endDate > todayId) return { ok: false, reason: "future" };
  if (input.endDate !== null && input.endDate < input.startDate) {
    return { ok: false, reason: "backwards" };
  }
  if (hasStartOn(cycle, input.startDate, ignoreId)) return { ok: false, reason: "duplicate" };

  const range: DayRange = { from: input.startDate, to: input.endDate ?? input.startDate };
  const conflict = overlapping(cycle, range, todayId, ignoreId);
  if (conflict) return { ok: false, reason: "overlap", conflict };

  return null;
}

/**
 * Records a period.
 *
 * `endDate: null` records it as ongoing, which is what "it started today"
 * means. The end can be added later without re-entering anything.
 */
export function addPeriod(
  cycle: CycleState,
  input: PeriodInput,
  id: string,
  now: Date,
  todayId: ISODate,
): LogResult {
  const refusal = check(cycle, input, todayId);
  if (refusal) return refusal;

  return {
    ok: true,
    entries: {
      ...cycle.entries,
      [id]: { id, startDate: input.startDate, endDate: input.endDate, loggedAt: now.toISOString() },
    },
  };
}

/** Moves or reshapes an existing period, under exactly the same rules. */
export function editPeriod(
  cycle: CycleState,
  id: string,
  input: PeriodInput,
  todayId: ISODate,
): LogResult {
  const existing = cycle.entries[id];
  if (!existing) return { ok: false, reason: "invalid" };

  const refusal = check(cycle, input, todayId, id);
  if (refusal) return refusal;

  return {
    ok: true,
    entries: {
      ...cycle.entries,
      [id]: { ...existing, startDate: input.startDate, endDate: input.endDate },
    },
  };
}

/** Closing an ongoing period: the one edit that has its own button. */
export function endPeriod(
  cycle: CycleState,
  id: string,
  endDate: ISODate,
  todayId: ISODate,
): LogResult {
  const existing = cycle.entries[id];
  if (!existing) return { ok: false, reason: "invalid" };
  return editPeriod(cycle, id, { startDate: existing.startDate, endDate }, todayId);
}

/** Reopens a completed period, for when it turned out not to be over. */
export function reopenPeriod(cycle: CycleState, id: string, todayId: ISODate): LogResult {
  const existing = cycle.entries[id];
  if (!existing) return { ok: false, reason: "invalid" };
  return editPeriod(cycle, id, { startDate: existing.startDate, endDate: null }, todayId);
}

export const LOG_REFUSAL: Record<LogRefusal, string> = {
  duplicate: "That date is already logged.",
  future: "That date has not happened yet.",
  invalid: "That does not look like a date.",
  backwards: "An end date cannot come before the start date.",
  overlap: "That overlaps a period you have already logged.",
};

/** Names the dates a refusal collided with, so the conflict is obvious. */
export function describeRefusal(
  result: Extract<LogResult, { ok: false }>,
  cycle: CycleState,
  todayId: ISODate,
): string {
  const base = LOG_REFUSAL[result.reason];
  if (result.reason !== "overlap" || !result.conflict) return base;

  const range = confirmedRange(cycle, result.conflict, todayId);
  const span =
    range.from === range.to
      ? formatDayShort(range.from)
      : `${formatDayShort(range.from)} to ${formatDayShort(range.to)}`;
  return `${base} Change or delete the one from ${span} first.`;
}

// ------------------------------------------------------- cycle length copy

/**
 * "4 weeks and 1 day". Days remain the stored unit; weeks are only ever a way
 * of reading the same number back.
 */
export function formatWeeksAndDays(days: number): string {
  const weeks = Math.floor(days / 7);
  const rest = days % 7;
  const parts: string[] = [];
  if (weeks > 0) parts.push(`${weeks} ${weeks === 1 ? "week" : "weeks"}`);
  if (rest > 0 || weeks === 0) parts.push(`${rest} ${rest === 1 ? "day" : "days"}`);
  return parts.join(" and ");
}

/**
 * The sentence that keeps the two numbers apart.
 *
 * Cycle length and period duration get confused constantly, and confusing them
 * makes every estimate wrong. Claro says which is which wherever both appear.
 */
export const CYCLE_LENGTH_NOTE =
  "Cycle length is counted from the first day of one period to the first day of the next. It is not the number of days a period lasts.";
