import { isDoneOn } from "./habits";
import { newId } from "./id";
import {
  PRIORITY_KEYS,
  isPrioritySet,
  type Day,
  type Habit,
  type HabitCompletion,
  type Priority,
  type ScheduleItem,
  type ScheduleLink,
} from "./types";

/**
 * The schedule is keyed by hour, not by position, so "reordering" it means
 * moving an entry to another hour. Two entries can therefore land on the same
 * hour, which the grid cannot show — so the entry that was already there takes
 * the hour the moved one just left. A straight swap, and nothing is lost.
 */
export function settleHours(
  previous: ScheduleItem[],
  next: ScheduleItem[],
): ScheduleItem[] {
  const before = new Map(previous.map((item) => [item.id, item.time]));

  const moved = next.find((item) => {
    const was = before.get(item.id);
    return was !== undefined && was !== item.time;
  });
  if (!moved) return next;

  const vacated = before.get(moved.id) as string;
  const occupied = next.some((item) => item.id !== moved.id && item.time === moved.time);
  if (!occupied) return next;

  return next.map((item) =>
    item.id !== moved.id && item.time === moved.time ? { ...item, time: vacated } : item,
  );
}

/**
 * Reading a schedule row.
 *
 * A linked row holds no title and no completion of its own: both are resolved
 * from the record it points at, which is what makes the schedule and the rest
 * of the day one thing rather than two copies that drift.
 */
export type ResolvedSchedule = {
  item: ScheduleItem;
  /** The live title: the linked record's words, or the block's own. */
  title: string;
  done: boolean;
  kind: "block" | "priority" | "action" | "habit";
  /**
   * False when a linked record has been deleted or archived. The row stays,
   * showing its snapshot, rather than vanishing and taking the hour with it.
   */
  available: boolean;
};

function priorityById(day: Day, id: string): Priority | null {
  for (const key of PRIORITY_KEYS) {
    const priority = day[key];
    if (priority.id === id) return priority;
  }
  return null;
}

export function resolveScheduleItem(
  item: ScheduleItem,
  day: Day,
  habits: Record<string, Habit>,
  completions: Record<string, HabitCompletion>,
): ResolvedSchedule {
  const link = item.link;

  if (!link) {
    return { item, title: item.text, done: item.done, kind: "block", available: true };
  }

  if (link.kind === "priority") {
    const priority = priorityById(day, link.priorityId);
    // A priority whose text has been cleared is gone as far as the day is concerned.
    const live = priority && isPrioritySet(priority) ? priority : null;
    return {
      item,
      title: live ? live.text : item.text,
      done: live ? live.done : false,
      kind: "priority",
      available: live !== null,
    };
  }

  if (link.kind === "action") {
    const action = day.actions.find((a) => a.id === link.actionId) ?? null;
    return {
      item,
      title: action ? action.text : item.text,
      done: action ? action.done : false,
      kind: "action",
      available: action !== null,
    };
  }

  const habit = habits[link.habitId] ?? null;
  // An archived habit keeps its history but is no longer part of the day.
  const live = habit && habit.archivedAt === null ? habit : null;
  return {
    item,
    title: live ? live.name : item.text,
    done: live ? isDoneOn(completions, live.id, day.id) : false,
    kind: "habit",
    available: live !== null,
  };
}

export function resolveSchedule(
  day: Day,
  habits: Record<string, Habit>,
  completions: Record<string, HabitCompletion>,
): ResolvedSchedule[] {
  return day.scheduleItems.map((item) => resolveScheduleItem(item, day, habits, completions));
}

// ------------------------------------------------------------------ writing

/** A standalone block, owned entirely by the hour it sits on. */
export function blockItem(time: string, text: string): ScheduleItem {
  return { id: newId(), time, text: text.trim(), link: null, done: false };
}

/**
 * A reference to work that already exists. The snapshot is only a fallback for
 * the day the original is deleted; the live title comes from the record.
 */
export function linkedItem(time: string, link: ScheduleLink, snapshot: string): ScheduleItem {
  return { id: newId(), time, text: snapshot.trim(), link, done: false };
}

/**
 * Ticking a row, for everything the day itself owns.
 *
 * Habits are the one case this cannot finish: their completions live outside
 * the day, so `scheduleHabitToggle` reports the habit and the caller performs
 * it through the store. Keeping that split explicit is what stops a second,
 * day-local copy of a habit's completion appearing.
 */
export function toggleScheduleItem(day: Day, itemId: string): Day {
  const item = day.scheduleItems.find((i) => i.id === itemId);
  if (!item) return day;

  if (!item.link) {
    return {
      ...day,
      scheduleItems: day.scheduleItems.map((i) =>
        i.id === itemId ? { ...i, done: !i.done } : i,
      ),
    };
  }

  if (item.link.kind === "priority") {
    const id = item.link.priorityId;
    for (const key of PRIORITY_KEYS) {
      const priority = day[key];
      if (priority.id === id && isPrioritySet(priority)) {
        return { ...day, [key]: { ...priority, done: !priority.done } };
      }
    }
    return day;
  }

  if (item.link.kind === "action") {
    const actionId = item.link.actionId;
    if (!day.actions.some((a) => a.id === actionId)) return day;
    return {
      ...day,
      actions: day.actions.map((a) => (a.id === actionId ? { ...a, done: !a.done } : a)),
    };
  }

  // Habit: handled by the caller, see `scheduleHabitToggle`.
  return day;
}

/** The habit a row points at, when ticking it means toggling a habit. */
export function scheduleHabitToggle(day: Day, itemId: string): string | null {
  const item = day.scheduleItems.find((i) => i.id === itemId);
  return item?.link?.kind === "habit" ? item.link.habitId : null;
}

/**
 * Editing a row's words.
 *
 * A standalone block is its own text, so it is simply rewritten. A linked row
 * is a reference: its words belong to the original, so editing is refused here
 * rather than quietly forking a second version of the same task.
 */
export function canEditText(item: ScheduleItem): boolean {
  return item.link === null;
}
