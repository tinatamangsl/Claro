/**
 * The month view's arithmetic. Pure, and given every date explicitly — the
 * calendar never asks what today is, it is told.
 */

import { addDays, addMonths, endOfMonth, format, startOfISOWeek, startOfMonth } from "date-fns";

import { formatDayId, parseDayId, weekDayIds, weekOfDay } from "./dates";
import { countCompletions, isDoneOn } from "./habits";
import type { Habit, HabitCompletion, ISODate } from "./types";

/** "2026-08" */
export type MonthId = string;

export function formatMonthId(d: Date): MonthId {
  return format(d, "yyyy-MM");
}

export function parseMonthId(id: MonthId): Date {
  const [year, month] = id.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

export function shiftMonthId(id: MonthId, delta: number): MonthId {
  return formatMonthId(addMonths(parseMonthId(id), delta));
}

export function monthOfDay(id: ISODate): MonthId {
  return id.slice(0, 7);
}

/** "August 2026" */
export function formatMonthLong(id: MonthId): string {
  return format(parseMonthId(id), "MMMM yyyy");
}

export type CalendarCell = {
  dayId: ISODate;
  /** False for the leading and trailing days that pad the grid. */
  inMonth: boolean;
};

/**
 * Six Monday-first weeks covering the month, so the grid never changes height
 * between months — a calendar that reflows as you page through it is restless.
 */
export function monthGrid(id: MonthId): CalendarCell[] {
  const first = startOfMonth(parseMonthId(id));
  const start = startOfISOWeek(first);

  return Array.from({ length: 42 }, (_, i) => {
    const day = addDays(start, i);
    return { dayId: formatDayId(day), inMonth: formatMonthId(day) === id };
  });
}

export function monthDayIds(id: MonthId): ISODate[] {
  const first = startOfMonth(parseMonthId(id));
  const last = endOfMonth(first);
  const days: ISODate[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(formatDayId(d));
  return days;
}

export type DayCompletion = {
  done: number;
  total: number;
  /** True only when every active habit was completed that day. */
  complete: boolean;
};

/**
 * How many habits were kept on each day of the month. `total` is the number of
 * habits currently active, so the ratio is honest about what was being asked
 * for — it is never presented as a score.
 */
export function monthCompletions(
  habits: Habit[],
  completions: Record<string, HabitCompletion>,
  id: MonthId,
): Record<ISODate, DayCompletion> {
  const total = habits.length;
  const result: Record<ISODate, DayCompletion> = {};

  for (const dayId of monthDayIds(id)) {
    const done = habits.reduce(
      (count, habit) => count + (isDoneOn(completions, habit.id, dayId) ? 1 : 0),
      0,
    );
    result[dayId] = { done, total, complete: total > 0 && done === total };
  }

  return result;
}

/** Days in the month on which at least one habit was kept. */
export function daysWithAnyCompletion(
  habits: Habit[],
  completions: Record<string, HabitCompletion>,
  id: MonthId,
): number {
  return Object.values(monthCompletions(habits, completions, id)).filter((d) => d.done > 0)
    .length;
}

export type Consistency = { week: number; month: number; quarter: number };

/**
 * One habit's counts over three ranges, anchored on a day the caller chooses.
 * Counts only — there is deliberately no streak, no best run, and nothing that
 * a missed day can take away.
 */
export function consistency(
  completions: Record<string, HabitCompletion>,
  habitId: string,
  anchorDayId: ISODate,
): Consistency {
  const week = countCompletions(completions, habitId, weekDayIds(weekOfDay(anchorDayId)));
  const month = countCompletions(completions, habitId, monthDayIds(monthOfDay(anchorDayId)));

  const anchor = parseDayId(anchorDayId);
  const quarterStart = new Date(anchor.getFullYear(), Math.floor(anchor.getMonth() / 3) * 3, 1);
  const quarterDays: ISODate[] = [];
  for (let i = 0; i < 3; i += 1) {
    quarterDays.push(...monthDayIds(formatMonthId(addMonths(quarterStart, i))));
  }

  return {
    week,
    month,
    quarter: countCompletions(completions, habitId, quarterDays),
  };
}
