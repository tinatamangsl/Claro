/**
 * The end-of-day reflection, and the decision the user makes about work that
 * did not get finished.
 *
 * Nothing here happens on its own. Unfinished work is listed and each item
 * waits for an explicit choice, because a planner that quietly copies yesterday
 * into tomorrow becomes a ledger of everything you have not done.
 */

import { blankReview } from "./storage";
import { newId } from "./id";
import {
  PRIORITY_KEYS,
  isPrioritySet,
  type DailyReview,
  type Day,
  type ISODate,
  type PriorityKey,
} from "./types";

const written = (text: string) => text.trim() !== "";

/** True when the day carries a reflection worth showing on the calendar. */
export function hasReflection(day: Day): boolean {
  const review = day.review;
  if (!review) return false;
  return (
    written(review.proudOf) ||
    written(review.helped) ||
    review.mood !== null ||
    review.stress !== null
  );
}

export function writeReview(day: Day, patch: Partial<DailyReview>, now: Date): Day {
  const base = day.review ?? blankReview(now);
  return { ...day, review: { ...base, ...patch, updatedAt: now.toISOString() } };
}

// ------------------------------------------------------ unfinished work

/**
 * One piece of unfinished work, addressed the way the rest of the app
 * addresses it: a priority by its own id, an action by its own id.
 */
export type OpenItem =
  | { kind: "priority"; id: string; key: PriorityKey; text: string }
  | { kind: "action"; id: string; text: string };

export function openItems(day: Day): OpenItem[] {
  const items: OpenItem[] = [];

  for (const key of PRIORITY_KEYS) {
    const priority = day[key];
    if (!isPrioritySet(priority) || priority.done || !priority.id) continue;
    items.push({ kind: "priority", id: priority.id, key, text: priority.text });
  }

  for (const action of day.actions) {
    if (action.done || !written(action.text)) continue;
    items.push({ kind: "action", id: action.id, text: action.text });
  }

  return items;
}

export type Decision = "carry" | "schedule" | "complete" | "letGo";

/** Marking it done, from here, is the same completion as anywhere else. */
export function completeItem(day: Day, item: OpenItem): Day {
  if (item.kind === "priority") {
    return { ...day, [item.key]: { ...day[item.key], done: true } };
  }
  return {
    ...day,
    actions: day.actions.map((a) => (a.id === item.id ? { ...a, done: true } : a)),
  };
}

/**
 * Letting it go removes it from the day. That is the point of the option: it is
 * not happening, and leaving it on the page to be seen again tomorrow is
 * exactly what the user has just decided against.
 */
export function letGoItem(day: Day, item: OpenItem): Day {
  if (item.kind === "priority") {
    // Only this slot is emptied; the other two are untouched.
    const cleared = { ...day[item.key], id: null, text: "", done: false, goal: null };
    return { ...day, [item.key]: { ...cleared, createdAt: null, originDayId: null, carriedTo: null } };
  }
  return { ...day, actions: day.actions.filter((a) => a.id !== item.id) };
}

/**
 * Moving it to another day.
 *
 * The source keeps its record and is marked as carried, so the automatic
 * rollover will not pick it up again, and the destination receives it in its
 * review queue rather than having it forced into a slot.
 */
export function carryItem(
  day: Day,
  item: OpenItem,
  toDayId: ISODate,
): { day: Day; carried: import("./types").CarriedItem | null } {
  if (item.kind === "priority") {
    const priority = day[item.key];
    return {
      day: { ...day, [item.key]: { ...priority, carriedTo: toDayId } },
      carried: {
        id: priority.id ?? newId(),
        text: priority.text.trim(),
        goal: priority.goal,
        origin: "priority",
        bucket: null,
        originDayId: priority.originDayId ?? day.id,
        createdAt: priority.createdAt,
      },
    };
  }

  const action = day.actions.find((a) => a.id === item.id);
  if (!action) return { day, carried: null };

  return {
    day: {
      ...day,
      actions: day.actions.map((a) => (a.id === item.id ? { ...a, carriedTo: toDayId } : a)),
    },
    carried: {
      id: action.id,
      text: action.text.trim(),
      goal: null,
      origin: "action",
      bucket: action.bucket,
      originDayId: action.originDayId ?? day.id,
      createdAt: action.createdAt,
    },
  };
}
