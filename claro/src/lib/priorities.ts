/**
 * Priorities are fixed slots rather than list items: they are created by being
 * written in, not by an "add" action. This is the one place a blank slot
 * acquires its identity, so every route that edits a priority stamps the same
 * provenance — which is what the carry-forward rule depends on.
 */

import { newId } from "./id";
import { blankPriority } from "./storage";
import {
  PRIORITY_KEYS,
  priorityKey,
  type Day,
  type ISODate,
  type Priority,
  type PriorityKey,
  type PriorityRank,
} from "./types";

export function writePriority(
  priority: Priority,
  patch: Partial<Priority>,
  dayId: ISODate,
  now: Date,
): Priority {
  const next = { ...priority, ...patch };

  // Emptying the text empties the slot. Leaving a goal link or a completion
  // mark on a slot with no words in it would be a record of nothing.
  if (next.text.trim() === "") return blankPriority();

  if (next.id === null) {
    return { ...next, id: newId(), createdAt: now.toISOString(), originDayId: dayId };
  }

  return next;
}

/**
 * Addressing a priority.
 *
 * By id wherever one exists, because a priority's slot is display order and
 * display order changes. A blank slot has no id yet, so it is addressed by
 * rank, which is safe precisely because there is nothing in it to overwrite.
 */
export type PriorityTarget = { id: string } | { rank: PriorityRank };

export function resolvePriorityKey(day: Day, target: PriorityTarget): PriorityKey | null {
  if ("rank" in target) return priorityKey(target.rank);

  const key = PRIORITY_KEYS.find((k) => day[k].id === target.id);
  // A stale id addresses nothing rather than falling back to a position.
  return key ?? null;
}

/** The three slots as a list, in slot order. */
export function priorityList(day: Day): Priority[] {
  return PRIORITY_KEYS.map((key) => day[key]);
}

/**
 * Reorders the three slots from an explicit id sequence.
 *
 * The order is resolved against the day as it is at write time, never against a
 * copy the caller captured earlier, and the result is assembled from the day's
 * own three priorities. A priority therefore cannot be dropped, duplicated, or
 * overwritten by another: the worst a stale or malformed sequence can do is
 * leave the order unchanged.
 *
 * Blank slots carry no id. They are placed into whatever positions the written
 * priorities do not claim, which is why an unwritten slot is safe to drag.
 */
export function reorderPriorities(day: Day, ids: (string | null)[]): Day {
  const current = priorityList(day);
  const remaining = [...current];
  const ordered: Priority[] = [];

  for (const id of ids) {
    if (!id) continue;
    const at = remaining.findIndex((p) => p.id === id);
    if (at === -1) continue;
    ordered.push(remaining[at]);
    remaining.splice(at, 1);
  }

  // Anything the sequence did not name keeps its relative order, at the back.
  ordered.push(...remaining);

  const next = { ...day };
  PRIORITY_KEYS.forEach((key, index) => {
    next[key] = ordered[index] ?? blankPriority();
  });
  return next;
}

/**
 * Empties one slot, leaving it ready for something new.
 *
 * Only that slot is touched: the other two keep their text, completion, goal
 * and identity. Any schedule row that pointed at this priority is deliberately
 * left alone, so the user's booked time survives and simply shows as
 * unresolved rather than disappearing with the work.
 */
export function clearPriority(day: Day, target: PriorityTarget): Day {
  const key = resolvePriorityKey(day, target);
  if (!key) return day;
  if (day[key].id === null && day[key].text === "") return day;
  return { ...day, [key]: blankPriority() };
}
