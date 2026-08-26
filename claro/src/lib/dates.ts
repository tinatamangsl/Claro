import {
  addDays,
  addQuarters,
  addWeeks,
  differenceInCalendarDays,
  endOfISOWeek,
  endOfQuarter,
  format,
  getISOWeek,
  getISOWeekYear,
  getQuarter,
  getYear,
  parseISO,
  startOfISOWeek,
  startOfQuarter,
} from "date-fns";

import type { ISODate, QuarterId, WeekId } from "./types";

/**
 * Every helper here takes an explicit Date or id. None of them call `new Date()`.
 * The current date is read in exactly one place in the app — the store provider's
 * mount effect — because computing "today" during render would differ between the
 * SSR pass (server timezone) and the browser, producing a hydration mismatch.
 */

// ------------------------------------------------------------- id building

export function formatDayId(d: Date): ISODate {
  return format(d, "yyyy-MM-dd");
}

/** ISO week-year, not calendar year: 2027-01-01 belongs to "2026-W53". */
export function formatWeekId(d: Date): WeekId {
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, "0")}`;
}

export function formatQuarterId(d: Date): QuarterId {
  return `${getYear(d)}-Q${getQuarter(d)}`;
}

// ------------------------------------------------------------- id parsing

/** Date-only ISO strings parse as local midnight, so there is no off-by-one. */
export function parseDayId(id: ISODate): Date {
  return parseISO(id);
}

/** Returns the Monday of that ISO week. Jan 4th is always in ISO week 1. */
export function parseWeekId(id: WeekId): Date {
  const [yearPart, weekPart] = id.split("-W");
  const year = Number(yearPart);
  const week = Number(weekPart);
  return addWeeks(startOfISOWeek(new Date(year, 0, 4)), week - 1);
}

export function parseQuarterId(id: QuarterId): Date {
  const [yearPart, quarterPart] = id.split("-Q");
  return new Date(Number(yearPart), (Number(quarterPart) - 1) * 3, 1);
}

// ----------------------------------------------------------------- ranges

export function weekRange(id: WeekId): { start: Date; end: Date } {
  const monday = parseWeekId(id);
  return { start: startOfISOWeek(monday), end: endOfISOWeek(monday) };
}

export function quarterRange(id: QuarterId): { start: Date; end: Date } {
  const first = parseQuarterId(id);
  return { start: startOfQuarter(first), end: endOfQuarter(first) };
}

/** The seven day ids of a week, Monday → Sunday. */
export function weekDayIds(id: WeekId): ISODate[] {
  const monday = parseWeekId(id);
  return Array.from({ length: 7 }, (_, i) => formatDayId(addDays(monday, i)));
}

// --------------------------------------------------------- hierarchy links

/**
 * Resolve a week to its parent quarter via the week's THURSDAY, not its Monday.
 * Thursday is the 4th of 7 days, so it always falls on the majority side of a
 * week that straddles a quarter boundary. (2026-W14 runs Mar 30 – Apr 5:
 * Monday says Q1, Thursday says Q2 — Q2 owns 4 of the 7 days.)
 */
export function quarterOfWeek(id: WeekId): QuarterId {
  return formatQuarterId(addDays(parseWeekId(id), 3));
}

export function weekOfDay(id: ISODate): WeekId {
  return formatWeekId(parseDayId(id));
}

export function quarterOfDay(id: ISODate): QuarterId {
  return quarterOfWeek(weekOfDay(id));
}

// ------------------------------------------------------------- navigation

export function shiftDayId(id: ISODate, delta: number): ISODate {
  return formatDayId(addDays(parseDayId(id), delta));
}

export function shiftWeekId(id: WeekId, delta: number): WeekId {
  return formatWeekId(addWeeks(parseWeekId(id), delta));
}

export function shiftQuarterId(id: QuarterId, delta: number): QuarterId {
  return formatQuarterId(addQuarters(parseQuarterId(id), delta));
}

// ----------------------------------------------------------------- labels

export function formatDayWeekday(id: ISODate): string {
  return format(parseDayId(id), "EEEE");
}

export function formatDayDate(id: ISODate): string {
  return format(parseDayId(id), "d MMMM yyyy");
}

/**
 * "today", "yesterday", "3 days ago", "in 2 days".
 *
 * Days near now are the ones people are correcting, and a relative phrase is
 * quicker to check than a date: "yesterday" is either right or wrong at a
 * glance, where "21/08/2026" has to be worked out.
 */
export function formatRelativeDay(id: ISODate, todayId: ISODate): string {
  const delta = differenceInCalendarDays(parseDayId(id), parseDayId(todayId));
  if (delta === 0) return "today";
  if (delta === -1) return "yesterday";
  if (delta === 1) return "tomorrow";
  return delta < 0 ? `${-delta} days ago` : `in ${delta} days`;
}

/** "17 Aug" — for inline references to another day. */
export function formatDayShort(id: ISODate): string {
  return format(parseDayId(id), "d MMM");
}

/** "Monday 17" — the weekly habit view's column heading. */
export function formatWeekdayShort(id: ISODate): string {
  return format(parseDayId(id), "EEEEE");
}

export function formatDayOfMonth(id: ISODate): string {
  return format(parseDayId(id), "d");
}

/** "Monday 17 August" — the accessible name behind a day column. */
export function formatDayLong(id: ISODate): string {
  return format(parseDayId(id), "EEEE d MMMM");
}

/** "Week 33" */
export function formatWeekNumber(id: WeekId): string {
  return `Week ${Number(id.split("-W")[1])}`;
}

/** "11 – 17 August 2026" (collapses the month when both ends share one) */
export function formatWeekRange(id: WeekId): string {
  const { start, end } = weekRange(id);
  const sameMonth = format(start, "MMM yyyy") === format(end, "MMM yyyy");
  return sameMonth
    ? `${format(start, "d")} – ${format(end, "d MMMM yyyy")}`
    : `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`;
}

/** "Q3 2026" */
export function formatQuarterShort(id: QuarterId): string {
  const [year, quarter] = id.split("-Q");
  return `Q${quarter} ${year}`;
}

/** "July – September" */
export function formatQuarterMonths(id: QuarterId): string {
  const { start, end } = quarterRange(id);
  return `${format(start, "MMMM")} – ${format(end, "MMMM")}`;
}

/** 05:00 → 22:00, the schedule grid. */
export const SCHEDULE_HOURS: string[] = Array.from(
  { length: 18 },
  (_, i) => `${String(i + 5).padStart(2, "0")}:00`,
);

/**
 * How finely a block can be placed inside its hour.
 *
 * The schedule is still eighteen hours tall, because a grid of seventy-two
 * quarter-hour rows is a spreadsheet rather than a day. An hour is the *frame*;
 * within it a block can sit at any quarter, and several can share the hour.
 */
export const SCHEDULE_MINUTES = [0, 15, 30, 45] as const;

/** "16:30" belongs to the "16:00" row. */
export function hourOf(time: string): string {
  return `${time.slice(0, 2)}:00`;
}

export function minutesOf(time: string): number {
  return Number(time.slice(3, 5));
}

/**
 * A typed minute, or null when it is not one.
 *
 * The four quarters are the quick path, not the vocabulary: a stand-up at 9:05
 * and a train at 4:37 are ordinary times and a fixed menu cannot say either.
 * `ScheduleItem.time` was always a plain string, so this needs no migration —
 * the restriction only ever lived in the list the picker offered.
 *
 * Refuses rather than clamps. Silently turning 75 into 59 moves somebody's
 * block to a time they did not ask for, and they may not notice.
 */
export function parseMinutes(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  const minutes = Number(trimmed);
  return minutes >= 0 && minutes <= 59 ? minutes : null;
}

export function atMinutes(hour: string, minutes: number): string {
  return `${hour.slice(0, 2)}:${String(minutes).padStart(2, "0")}`;
}

/** Every quarter-hour of the schedule, for a picker that offers them all. */
export function scheduleSlots(): string[] {
  return SCHEDULE_HOURS.flatMap((hour) => SCHEDULE_MINUTES.map((m) => atMinutes(hour, m)));
}

/** "4:15 PM", and just "4 PM" on the hour. */
export function formatTimeLabel(time: string): string {
  const minutes = minutesOf(time);
  const base = formatHourLabel(hourOf(time));
  if (minutes === 0) return base;
  const [value, suffix] = base.split(" ");
  return `${value}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** "5 AM", "12 PM", "10 PM" — friendlier than 24h in the left rail. */
export function formatHourLabel(time: string): string {
  const hour = Number(time.split(":")[0]);
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${suffix}`;
}
