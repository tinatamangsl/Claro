/**
 * Priorities are fixed slots rather than list items: they are created by being
 * written in, not by an "add" action. This is the one place a blank slot
 * acquires its identity, so every route that edits a priority stamps the same
 * provenance — which is what the carry-forward rule depends on.
 */

import { newId } from "./id";
import { blankPriority } from "./storage";
import type { ISODate, Priority } from "./types";

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
