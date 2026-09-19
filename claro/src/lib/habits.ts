/**
 * Habits and their gentle consistency.
 *
 * Everything here is pure and `now`-injected. Consistency is only ever a count
 * over a range the caller chooses — there is deliberately no streak, no "best
 * run", and nothing that can be broken or lost.
 */

import { newId } from "./id";
import {
  WEEKDAYS,
  habitCompletionId,
  type Habit,
  type HabitCompletion,
  type ISODate,
  type Weekday,
} from "./types";

export function createHabit(name: string, now: Date, order = 0): Habit | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  return { id: newId(), name: trimmed, createdAt: now.toISOString(), archivedAt: null, order };
}

/** Archived habits keep their history but leave the weekly view. */
export function archiveHabit(habit: Habit, now: Date): Habit {
  return { ...habit, archivedAt: now.toISOString() };
}

export function restoreHabit(habit: Habit): Habit {
  return { ...habit, archivedAt: null };
}

/**
 * Explicit order first, creation date as the tiebreak — so habits saved before
 * reordering existed keep exactly the order they already had.
 */
function byOrder(a: Habit, b: Habit): number {
  const left = a.order ?? Number.MAX_SAFE_INTEGER;
  const right = b.order ?? Number.MAX_SAFE_INTEGER;
  return left === right ? a.createdAt.localeCompare(b.createdAt) : left - right;
}

export function activeHabits(habits: Record<string, Habit>): Habit[] {
  return Object.values(habits).filter((h) => h.archivedAt === null).sort(byOrder);
}

/** Renumbers from an explicit sequence, so a reorder survives a reload. */
export function reorderHabits(habits: Habit[]): Record<string, Partial<Habit>> {
  const patches: Record<string, Partial<Habit>> = {};
  habits.forEach((habit, index) => {
    if (habit.order !== index) patches[habit.id] = { order: index };
  });
  return patches;
}

export function archivedHabits(habits: Record<string, Habit>): Habit[] {
  return Object.values(habits).filter((h) => h.archivedAt !== null).sort(byOrder);
}

export function isDoneOn(
  completions: Record<string, HabitCompletion>,
  habitId: string,
  dayId: ISODate,
): boolean {
  return Boolean(completions[habitCompletionId(habitId, dayId)]);
}

/** One completion per habit per day; toggling is idempotent in both directions. */
export function toggleCompletion(
  completions: Record<string, HabitCompletion>,
  habitId: string,
  dayId: ISODate,
  now: Date,
): Record<string, HabitCompletion> {
  const id = habitCompletionId(habitId, dayId);
  const next = { ...completions };

  if (next[id]) {
    delete next[id];
    return next;
  }

  next[id] = { id, habitId, dayId, completedAt: now.toISOString() };
  return next;
}

/** How many of the given days this habit was completed on. */
export function countCompletions(
  completions: Record<string, HabitCompletion>,
  habitId: string,
  dayIds: ISODate[],
): number {
  return dayIds.reduce((total, dayId) => total + (isDoneOn(completions, habitId, dayId) ? 1 : 0), 0);
}

/** Every day any habit was completed, for the calendar. */
export function completedDays(
  completions: Record<string, HabitCompletion>,
  dayIds: ISODate[],
): Record<ISODate, number> {
  const counts: Record<ISODate, number> = {};
  for (const dayId of dayIds) counts[dayId] = 0;
  for (const completion of Object.values(completions)) {
    if (completion.dayId in counts) counts[completion.dayId] += 1;
  }
  return counts;
}

/** Deleting a habit takes its history with it — no orphaned rows. */
export function removeHabitCompletions(
  completions: Record<string, HabitCompletion>,
  habitId: string,
): Record<string, HabitCompletion> {
  const next: Record<string, HabitCompletion> = {};
  for (const [id, completion] of Object.entries(completions)) {
    if (completion.habitId !== habitId) next[id] = completion;
  }
  return next;
}

/** "4 days this week" / "12 times this month" — never a streak. */
export function consistencyLabel(count: number, period: "week" | "month"): string {
  if (count === 0) return period === "week" ? "None yet this week" : "None yet this month";
  if (period === "week") return `${count} ${count === 1 ? "day" : "days"} this week`;
  return `${count} ${count === 1 ? "time" : "times"} this month`;
}


// ------------------------------------------------------------------ intention

/**
 * What the user said they were aiming for, in one shape.
 *
 * Two fields are stored because the user asked for both a count and, when it
 * matters, particular days. They are read as one intention rather than two
 * competing ones: **pinned days win, and the count follows from them.** Saying
 * "Mondays and Thursdays" already says "twice", and letting the two disagree
 * would mean a row that reads "1 of 3" while only two days are marked, which
 * is a puzzle rather than a prompt.
 *
 * `null` means nothing was set, which is the default and is not a failure to
 * configure anything: a habit with no target is a habit you simply do.
 */
export type WeeklyIntent = {
  /** The days it is meant to fall on, or null when any day counts. */
  days: Weekday[] | null;
  /** How many days a week. Derived from `days` when those are pinned. */
  count: number;
};

export function weeklyIntent(habit: Habit): WeeklyIntent | null {
  const days = habit.targetDays?.length ? [...habit.targetDays].sort((a, b) => a - b) : null;
  if (days) return { days, count: days.length };
  const count = habit.targetPerWeek ?? null;
  if (count === null || count <= 0) return null;
  return { days: null, count: Math.min(count, WEEKDAYS.length) };
}

/** Monday is 1 and Sunday is 7, so JavaScript's Sunday-is-0 needs moving. */
export function weekdayOf(dayId: ISODate): Weekday {
  const js = new Date(`${dayId}T00:00:00`).getDay();
  return (js === 0 ? 7 : js) as Weekday;
}

/** Whether a given day is one the habit was meant to fall on. */
export function isIntendedDay(habit: Habit, dayId: ISODate): boolean {
  const intent = weeklyIntent(habit);
  if (!intent?.days) return false;
  return intent.days.includes(weekdayOf(dayId));
}

/**
 * How a week went against what was intended.
 *
 * `kept` counts every day the habit happened, including days outside the
 * pinned ones: doing it on an unplanned day is still doing it, and a report
 * that ignored those would be telling somebody they had not done something
 * they had. `onIntended` is the narrower count, for readers who pinned days
 * because the day itself was the point.
 */
export function weekAgainstIntent(
  habit: Habit,
  completions: Record<string, HabitCompletion>,
  weekDayIds: ISODate[],
): { kept: number; intended: number | null; onIntended: number | null } {
  const kept = countCompletions(completions, habit.id, weekDayIds);
  const intent = weeklyIntent(habit);
  if (!intent) return { kept, intended: null, onIntended: null };

  const onIntended = intent.days
    ? weekDayIds.filter((id) => intent.days!.includes(weekdayOf(id)) && isDoneOn(completions, habit.id, id)).length
    : null;

  return { kept, intended: intent.count, onIntended };
}

/**
 * The week in words, against the intention if there is one.
 *
 * Still never a streak, and deliberately never a verdict: "2 of 4 days" states
 * what happened beside what was meant, and stops. There is no "only", no
 * "missed", no colour for falling short. A number the reader set themselves is
 * information; the same number with a judgement attached is a scold.
 */
export function weekLabel(
  habit: Habit,
  completions: Record<string, HabitCompletion>,
  weekDayIds: ISODate[],
): string {
  const { kept, intended } = weekAgainstIntent(habit, completions, weekDayIds);
  if (intended === null) return consistencyLabel(kept, "week");
  return `${kept} of ${intended} days this week`;
}

/**
 * How many days in a range the habit was meant to happen, when that can be
 * counted rather than estimated.
 *
 * **Exact for pinned days, null for a plain count, and deliberately never a
 * guess.** Pinned days can be counted: "Mondays and Thursdays" over September
 * is however many Mondays and Thursdays September has. A target of "four a
 * week" has no honest monthly denominator, because months are not whole
 * numbers of weeks and any rounding would invent a figure the reader never
 * set. Rather than print `4 × 30 / 7 = 17` and let somebody measure themselves
 * against arithmetic nobody chose, the count target is carried separately and
 * shown as the weekly figure it actually is.
 */
export function intendedDaysIn(habit: Habit, dayIds: ISODate[]): number | null {
  const intent = weeklyIntent(habit);
  if (!intent?.days) return null;
  return dayIds.filter((id) => intent.days!.includes(weekdayOf(id))).length;
}

/**
 * One habit over a range, in words, for the calendar and the reviews.
 *
 * Says what was kept first, because that is the part somebody actually did.
 * The intention follows as context, never as a fraction that could be read as
 * a mark out of ten.
 */
export function rangeLabel(
  habit: Habit,
  completions: Record<string, HabitCompletion>,
  dayIds: ISODate[],
  period: "month" | "quarter" | "year" = "month",
): string {
  const kept = countCompletions(completions, habit.id, dayIds);
  const intended = intendedDaysIn(habit, dayIds);
  const intent = weeklyIntent(habit);

  const unit = kept === 1 ? "time" : "times";
  if (intended !== null) return `${kept} of ${intended} ${period === "month" ? "intended days" : "intended days"}`;
  if (intent) return `${kept} ${unit}, aiming for ${intent.count} a week`;
  return consistencyLabel(kept, period === "month" ? "month" : "month");
}
