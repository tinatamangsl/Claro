/**
 * Habits and their gentle consistency.
 *
 * Everything here is pure and `now`-injected. Consistency is only ever a count
 * over a range the caller chooses — there is deliberately no streak, no "best
 * run", and nothing that can be broken or lost.
 */

import { newId } from "./id";
import { habitCompletionId, type Habit, type HabitCompletion, type ISODate } from "./types";

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
