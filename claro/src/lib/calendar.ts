/**
 * The month view's arithmetic. Pure, and given every date explicitly — the
 * calendar never asks what today is, it is told.
 */

import { addDays, addMonths, endOfMonth, format, startOfISOWeek, startOfMonth } from "date-fns";

import { formatDayId, parseDayId, weekDayIds, weekOfDay } from "./dates";
import { hasReflection } from "./daily-review";
import { goalKey, resolveGoal } from "./goals";
import { countCompletions, isDoneOn } from "./habits";
import { resolveSchedule } from "./schedule";
import { readDay, readQuarter } from "./storage";
import {
  GOAL_CATEGORIES,
  PRIORITY_KEYS,
  isPrioritySet,
  type ClaroState,
  type FocusSession,
  type GoalCategory,
  type Habit,
  type HabitCompletion,
  type ISODate,
  type Quarter,
  type QuarterId,
  type WeekId,
} from "./types";

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

// ------------------------------------------------------- period identities

/** "2026-Q3" for the quarter a month belongs to. */
export function quarterOfMonth(id: MonthId): QuarterId {
  const [year, month] = id.split("-").map(Number);
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
}

export function monthsOfQuarter(id: QuarterId): MonthId[] {
  const [year, quarter] = id.split("-Q").map(Number);
  const first = (quarter - 1) * 3 + 1;
  return [0, 1, 2].map((i) => `${year}-${String(first + i).padStart(2, "0")}`);
}

export function monthsOfYear(year: number): MonthId[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

export function yearOfMonth(id: MonthId): number {
  return Number(id.split("-")[0]);
}

/** "Jul" — for the compact month labels in the quarter and year views. */
export function formatMonthShort(id: MonthId): string {
  return format(parseMonthId(id), "MMM");
}

// ----------------------------------------------------------- day summaries

/**
 * What one day actually held. Every count is read from the canonical records:
 * nothing here stores its own copy, so a change made on Today, in the 3-3-3
 * flow, in Week or in Focus is reflected the next time this is computed.
 */
export type DaySummary = {
  dayId: ISODate;
  habitsDone: number;
  habitsTotal: number;
  prioritiesDone: number;
  prioritiesSet: number;
  actionsDone: number;
  actionsTotal: number;
  scheduleDone: number;
  scheduleTotal: number;
  /** Time actually spent in focus blocks that day. */
  focusMs: number;
  focusSessions: number;
  /** True when nothing at all was recorded, so a view can stay quiet. */
  empty: boolean;
};

/**
 * A session's focused time.
 *
 * Reviews look backwards, so only settled time is counted: a block still
 * running contributes what it has already banked rather than a moving number,
 * which keeps every total here pure and reproducible.
 */
export function focusedMs(session: FocusSession): number {
  return Math.max(0, session.elapsedBeforeMs);
}

export function summariseDay(
  state: ClaroState,
  dayId: ISODate,
  habits: Habit[],
): DaySummary {
  const day = readDay(state, dayId);

  const habitsDone = habits.reduce(
    (n, habit) => n + (isDoneOn(state.habitCompletions, habit.id, dayId) ? 1 : 0),
    0,
  );

  const priorities = PRIORITY_KEYS.map((key) => day[key]).filter(isPrioritySet);
  const actions = day.actions.filter((a) => a.text.trim() !== "");

  // Schedule completion is resolved, so a linked row reports its original's
  // state rather than a second answer of its own.
  const rows = resolveSchedule(day, state.habits, state.habitCompletions);

  const sessions = Object.values(state.focusSessions).filter((s) => s.dayId === dayId);
  const focusMs = sessions.reduce((total, s) => total + focusedMs(s), 0);

  const scheduleDone = rows.filter((r) => r.done).length;

  return {
    dayId,
    habitsDone,
    habitsTotal: habits.length,
    prioritiesDone: priorities.filter((p) => p.done).length,
    prioritiesSet: priorities.length,
    actionsDone: actions.filter((a) => a.done).length,
    actionsTotal: actions.length,
    scheduleDone,
    scheduleTotal: rows.length,
    focusMs,
    focusSessions: sessions.length,
    empty:
      habitsDone === 0 &&
      priorities.length === 0 &&
      actions.length === 0 &&
      rows.length === 0 &&
      sessions.length === 0,
  };
}

// --------------------------------------------------------- goal progress

/**
 * How far each linked goal got. Grouped by the goal itself, so every side quest
 * is counted separately rather than lumped into its category.
 */
export type GoalProgress = {
  key: string;
  category: GoalCategory;
  /** The user's own words, or empty when the goal is no longer set. */
  title: string;
  linked: number;
  done: number;
};

export function goalProgress(
  state: ClaroState,
  dayIds: ISODate[],
  quarter: Quarter,
): GoalProgress[] {
  const byKey = new Map<string, GoalProgress>();

  for (const dayId of dayIds) {
    const day = readDay(state, dayId);
    for (const key of PRIORITY_KEYS) {
      const priority = day[key];
      if (!isPrioritySet(priority) || !priority.goal) continue;

      const id = goalKey(priority.goal);
      const existing = byKey.get(id);
      if (existing) {
        existing.linked += 1;
        existing.done += priority.done ? 1 : 0;
        continue;
      }

      byKey.set(id, {
        key: id,
        category: priority.goal.category,
        title: resolveGoal(priority.goal, quarter)?.title ?? "",
        linked: 1,
        done: priority.done ? 1 : 0,
      });
    }
  }

  // Category order, then the user's own words, so the list reads predictably.
  return [...byKey.values()].sort(
    (a, b) =>
      GOAL_CATEGORIES.indexOf(a.category) - GOAL_CATEGORIES.indexOf(b.category) ||
      a.title.localeCompare(b.title),
  );
}

// ------------------------------------------------------- month summaries

export type HabitConsistency = { habit: Habit; kept: number; of: number };

export type MonthSummary = {
  monthId: MonthId;
  days: DaySummary[];
  /** Days on which at least one habit was kept. */
  daysWithHabit: number;
  daysInMonth: number;
  habitsKept: number;
  prioritiesDone: number;
  actionsDone: number;
  scheduleDone: number;
  focusMs: number;
  focusSessions: number;
  perHabit: HabitConsistency[];
  empty: boolean;
};

export function summariseMonth(
  state: ClaroState,
  monthId: MonthId,
  habits: Habit[],
): MonthSummary {
  const dayIds = monthDayIds(monthId);
  const days = dayIds.map((dayId) => summariseDay(state, dayId, habits));

  const total = <K extends keyof DaySummary>(field: K) =>
    days.reduce((n, d) => n + (d[field] as number), 0);

  return {
    monthId,
    days,
    daysWithHabit: days.filter((d) => d.habitsDone > 0).length,
    daysInMonth: dayIds.length,
    habitsKept: total("habitsDone"),
    prioritiesDone: total("prioritiesDone"),
    actionsDone: total("actionsDone"),
    scheduleDone: total("scheduleDone"),
    focusMs: total("focusMs"),
    focusSessions: total("focusSessions"),
    perHabit: habits.map((habit) => ({
      habit,
      kept: countCompletions(state.habitCompletions, habit.id, dayIds),
      of: dayIds.length,
    })),
    empty: days.every((d) => d.empty),
  };
}

// ------------------------------------------------ quarter and year reviews

export type QuarterSummary = {
  quarterId: QuarterId;
  months: MonthSummary[];
  habitsKept: number;
  prioritiesDone: number;
  actionsDone: number;
  focusMs: number;
  focusSessions: number;
  daysWithHabit: number;
  goals: GoalProgress[];
  empty: boolean;
};

export function summariseQuarter(
  state: ClaroState,
  quarterId: QuarterId,
  habits: Habit[],
): QuarterSummary {
  const months = monthsOfQuarter(quarterId).map((id) =>
    summariseMonth(state, id, habits),
  );
  const total = <K extends keyof MonthSummary>(field: K) =>
    months.reduce((n, m) => n + (m[field] as number), 0);

  const dayIds = months.flatMap((m) => m.days.map((d) => d.dayId));

  return {
    quarterId,
    months,
    habitsKept: total("habitsKept"),
    prioritiesDone: total("prioritiesDone"),
    actionsDone: total("actionsDone"),
    focusMs: total("focusMs"),
    focusSessions: total("focusSessions"),
    daysWithHabit: total("daysWithHabit"),
    goals: goalProgress(state, dayIds, readQuarter(state, quarterId)),
    empty: months.every((m) => m.empty),
  };
}

export type YearSummary = {
  year: number;
  months: MonthSummary[];
  quarters: QuarterId[];
  habitsKept: number;
  prioritiesDone: number;
  focusMs: number;
  focusSessions: number;
  daysWithHabit: number;
  empty: boolean;
};

export function summariseYear(
  state: ClaroState,
  year: number,
  habits: Habit[],
): YearSummary {
  const months = monthsOfYear(year).map((id) => summariseMonth(state, id, habits));
  const total = <K extends keyof MonthSummary>(field: K) =>
    months.reduce((n, m) => n + (m[field] as number), 0);

  return {
    year,
    months,
    quarters: [1, 2, 3, 4].map((q) => `${year}-Q${q}`),
    habitsKept: total("habitsKept"),
    prioritiesDone: total("prioritiesDone"),
    focusMs: total("focusMs"),
    focusSessions: total("focusSessions"),
    daysWithHabit: total("daysWithHabit"),
    empty: months.every((m) => m.empty),
  };
}

/** "2h 15m", "45m", or "none" when there was no focused time at all. */
export function formatFocusTotal(ms: number): string {
  if (ms <= 0) return "none";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

// -------------------------------------------------------- the drill path

/**
 * One date anchors the whole calendar. Year, quarter, month and week are all
 * derived from it, so moving between views never loses where you were: zooming
 * out and back in returns you to the same day.
 */
export type Anchor = {
  dayId: ISODate;
  monthId: MonthId;
  quarterId: QuarterId;
  weekId: WeekId;
  year: number;
};

export function anchorOf(dayId: ISODate): Anchor {
  const monthId = monthOfDay(dayId);
  return {
    dayId,
    monthId,
    quarterId: quarterOfMonth(monthId),
    weekId: weekOfDay(dayId),
    year: yearOfMonth(monthId),
  };
}

/** The first day of a month, used when drilling from a coarser view. */
export function firstDayOfMonth(id: MonthId): ISODate {
  return `${id}-01`;
}

export function firstDayOfQuarter(id: QuarterId): ISODate {
  return firstDayOfMonth(monthsOfQuarter(id)[0]);
}

/**
 * The days of a month grouped into the ISO weeks that contain them, so a month
 * can offer "open this week" without inventing its own week boundaries.
 */
export function weeksOfMonth(id: MonthId): WeekId[] {
  const seen = new Set<WeekId>();
  for (const dayId of monthDayIds(id)) seen.add(weekOfDay(dayId));
  return [...seen];
}

export type Crumb = { label: string; view: "year" | "quarter" | "month" | "week" | "day" };

/**
 * The path from year down to day, for the breadcrumb. Every level is a real
 * destination: the last two leave Calendar for Week and Today, which are where
 * planning and execution actually live.
 */
export function drillPath(anchor: Anchor): Crumb[] {
  return [
    { label: String(anchor.year), view: "year" },
    { label: `Q${anchor.quarterId.split("-Q")[1]}`, view: "quarter" },
    { label: format(parseMonthId(anchor.monthId), "MMMM"), view: "month" },
    { label: `Week ${Number(anchor.weekId.split("-W")[1])}`, view: "week" },
    { label: format(parseDayId(anchor.dayId), "EEEE d"), view: "day" },
  ];
}

// ------------------------------------------------------------- legend

/**
 * What a day's marks actually mean. Each is backed by a canonical record and
 * nothing is inferred: a mark appears only when the thing it names exists.
 */
export type DayMarks = {
  habitKept: boolean;
  commitmentCompleted: boolean;
  focusRecorded: boolean;
  reflectionCaptured: boolean;
};

export const MARK_LABELS = {
  habitKept: "Habit kept",
  commitmentCompleted: "Commitment completed",
  focusRecorded: "Focus time recorded",
  reflectionCaptured: "Reflection captured",
} as const;

export function dayMarks(state: ClaroState, summary: DaySummary): DayMarks {
  return {
    habitKept: summary.habitsDone > 0,
    // A completed priority, action or linked schedule row all count as one
    // thing finished; the schedule row resolves to its original, so a linked
    // completion is never counted twice.
    commitmentCompleted:
      summary.prioritiesDone > 0 || summary.actionsDone > 0 || summary.scheduleDone > 0,
    focusRecorded: summary.focusMs > 0,
    reflectionCaptured: hasReflection(readDay(state, summary.dayId)),
  };
}
