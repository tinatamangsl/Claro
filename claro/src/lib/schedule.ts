import { SCHEDULE_HOURS, atMinutes, hourOf } from "./dates";
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
 * Dropping one entry onto another moves the other one later, never earlier.
 *
 * This used to be a swap: the entry already sitting there took the time the
 * dragged one had just left. Nothing was lost, but something you were not
 * touching jumped backwards across the day, which is not what dragging
 * anything anywhere else does. A calendar pushes the thing you landed on
 * *down*, and the day keeps its order.
 *
 * It cascades. Pushing 2:15 to 2:30 when 2:30 is also taken pushes that one on
 * as well, and so on until a gap is found. The moved entry stays exactly where
 * it was dropped: it is the one the user aimed, so it is the one that holds.
 *
 * An entry with nowhere left to go, at the very end of the day, keeps its time
 * rather than being dropped from the schedule. Two entries sharing the last
 * minute of the day is a visible, fixable oddity; silently deleting somebody's
 * evening is not.
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

  const settled = [...next];
  // Each pass resolves one collision. The bound is generous and only exists so
  // that an unforeseen cycle cannot hang the page.
  for (let pass = 0; pass < settled.length + 2; pass++) {
    const anchors = new Set([moved.id]);
    const clash = findClash(settled, anchors);
    if (!clash) break;

    const taken = new Set(
      settled.filter((i) => i.carriedTo == null).map((item) => item.time),
    );
    const to = nextFreeTime(taken, clash.time);
    if (!to) break;

    const index = settled.findIndex((item) => item.id === clash.id);
    settled[index] = { ...settled[index], time: to };
  }
  return settled;
}

/** The first entry sharing a time with another, excluding the ones that hold. */
function findClash(
  items: ScheduleItem[],
  anchors: Set<string>,
): { id: string; time: string } | null {
  const live = items.filter((item) => item.carriedTo == null);
  const byTime = new Map<string, ScheduleItem[]>();
  for (const item of live) {
    byTime.set(item.time, [...(byTime.get(item.time) ?? []), item]);
  }

  for (const [time, sharing] of byTime) {
    if (sharing.length < 2) continue;
    // The dragged entry holds its time; something else gives way. When none of
    // them is the anchor, the later-listed one moves.
    const giving = sharing.find((item) => !anchors.has(item.id)) ?? sharing[sharing.length - 1];
    return { id: giving.id, time };
  }
  return null;
}

/** The next free minute strictly after a time, inside the scheduled day. */
function nextFreeTime(taken: Set<string>, after: string): string | null {
  const hours = SCHEDULE_HOURS;
  const start = hours.indexOf(hourOf(after));
  if (start === -1) return null;

  for (let h = start; h < hours.length; h++) {
    for (let m = 0; m < 60; m++) {
      const slot = atMinutes(hours[h], m);
      if (slot <= after) continue;
      if (!taken.has(slot)) return slot;
    }
  }
  return null;
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
/**
 * Text is stored as given, not trimmed.
 *
 * It used to be trimmed here, and that quietly ate a character out of live
 * typing: the schedule field saves 350ms after the last keystroke, which lands
 * on the pause after a space, and the trimmed value came back one character
 * shorter than what was on screen. `useDebouncedField` reads a value that
 * differs from what it committed as the record having changed underneath it and
 * resyncs, so the space disappeared and the next word ran into the last.
 *
 * Callers that decide whether an entry exists at all still test the trimmed
 * text; this only governs what gets stored once they have decided it does.
 */
export function blockItem(time: string, text: string): ScheduleItem {
  return { id: newId(), time, text, link: null, done: false };
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

/**
 * Whether two links point at the same record.
 *
 * Used to stop a task being given two hours by being dropped twice. The same
 * work in two places on one day is the thing the linked-row model exists to
 * prevent.
 */
export function sameLink(a: ScheduleLink | null, b: ScheduleLink | null): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "priority" && b.kind === "priority") return a.priorityId === b.priorityId;
  if (a.kind === "action" && b.kind === "action") return a.actionId === b.actionId;
  if (a.kind === "habit" && b.kind === "habit") return a.habitId === b.habitId;
  return false;
}
