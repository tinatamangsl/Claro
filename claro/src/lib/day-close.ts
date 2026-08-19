/**
 * Closing the day.
 *
 * Unfinished work is never in two places at once. Carrying something forward
 * creates one active instance on the chosen day and marks the original as
 * carried, which takes it out of the open list for good. The original record
 * stays where it is as history, because a journal that rewrites yesterday is
 * worse than one that admits the work moved.
 *
 * Nothing here runs on a schedule. The browser cannot be relied on to wake at
 * 9 PM, so eligibility is a question asked when the app is opened, navigated,
 * or returned to.
 */

import { parseDayId, shiftDayId } from "./dates";
import { newId } from "./id";
import {
  PRIORITY_KEYS,
  isPrioritySet,
  type ActionItem,
  type CarriedItem,
  type DailyReview,
  type Day,
  type ISODate,
  type PriorityKey,
  type ScheduleItem,
} from "./types";
import { blankReview } from "./storage";

/** 9 PM local. Late enough that a working evening is not cut short. */
export const CLOSE_HOUR = 21;

/** The moment a day becomes eligible to close: 21:00 local on that day. */
export function closeAt(dayId: ISODate): Date {
  const day = parseDayId(dayId);
  // Built from local parts rather than by adding hours, so a daylight-saving
  // boundary inside the day still lands on 9 PM as the user experienced it.
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), CLOSE_HOUR, 0, 0, 0);
}

export function isCloseEligible(dayId: ISODate, now: Date): boolean {
  return now.getTime() >= closeAt(dayId).getTime();
}

export function isClosed(day: Day): boolean {
  return day.closedAt !== null;
}

export function closeDay(day: Day, now: Date): Day {
  return { ...day, closedAt: now.toISOString() };
}

export function reopenDay(day: Day): Day {
  return day.closedAt === null ? day : { ...day, closedAt: null };
}

const written = (text: string) => text.trim() !== "";

// ------------------------------------------------------------- open work

/**
 * One piece of work still open on this day, addressed by its own id.
 *
 * A standalone schedule block is included because it is real work the user
 * wrote. A *linked* row is not: it points at a priority, action or habit that
 * is already in this list, and showing it twice would ask the same question
 * about the same thing.
 */
export type OpenItem =
  | { kind: "priority"; id: string; key: PriorityKey; text: string }
  | { kind: "action"; id: string; text: string; bucket: ActionItem["bucket"] }
  | { kind: "schedule"; id: string; text: string; time: string };

export function openItems(day: Day): OpenItem[] {
  const items: OpenItem[] = [];

  for (const key of PRIORITY_KEYS) {
    const priority = day[key];
    // `carriedTo` is what makes carrying final: once set, this is history.
    if (!isPrioritySet(priority) || priority.done || priority.carriedTo || !priority.id) continue;
    items.push({ kind: "priority", id: priority.id, key, text: priority.text });
  }

  for (const action of day.actions) {
    if (action.done || action.carriedTo || !written(action.text)) continue;
    items.push({ kind: "action", id: action.id, text: action.text, bucket: action.bucket });
  }

  for (const item of day.scheduleItems) {
    // Linked rows resolve to work already listed above.
    if (item.link || item.done || item.carriedTo || !written(item.text)) continue;
    items.push({ kind: "schedule", id: item.id, text: item.text, time: item.time });
  }

  return items;
}

/** How many decisions are still waiting. Shown as a count, never as a score. */
export function openCount(day: Day): number {
  return openItems(day).length;
}

// ------------------------------------------------------------- decisions

export type Decision = "carry" | "schedule" | "complete" | "letGo";

export function completeItem(day: Day, item: OpenItem): Day {
  if (item.kind === "priority") {
    return { ...day, [item.key]: { ...day[item.key], done: true } };
  }
  if (item.kind === "action") {
    return {
      ...day,
      actions: day.actions.map((a) => (a.id === item.id ? { ...a, done: true } : a)),
    };
  }
  return {
    ...day,
    scheduleItems: day.scheduleItems.map((s) =>
      s.id === item.id ? { ...s, done: true } : s,
    ),
  };
}

/**
 * Letting go closes the item without removing the record. It stops being open
 * work and stays visible as something that was decided against, which is a
 * different thing from something that was never there.
 */
export function letGoItem(day: Day, item: OpenItem, now: Date): Day {
  const marker = now.toISOString().slice(0, 10);

  if (item.kind === "priority") {
    return { ...day, [item.key]: { ...day[item.key], carriedTo: marker, done: false } };
  }
  if (item.kind === "action") {
    return {
      ...day,
      actions: day.actions.map((a) => (a.id === item.id ? { ...a, carriedTo: marker } : a)),
    };
  }
  return {
    ...day,
    scheduleItems: day.scheduleItems.map((s) =>
      s.id === item.id ? { ...s, carriedTo: marker } : s,
    ),
  };
}

/**
 * Moving work to another day.
 *
 * Returns the source with the item marked, and the single instance to place on
 * the destination. There is exactly one active copy at any moment: the source
 * is closed by the same operation that opens the destination.
 */
export function carryItem(
  day: Day,
  item: OpenItem,
  toDayId: ISODate,
): { day: Day; carried: CarriedItem | null } {
  if (toDayId === day.id) return { day, carried: null };

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

  if (item.kind === "action") {
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

  const block = day.scheduleItems.find((s) => s.id === item.id);
  if (!block) return { day, carried: null };
  return {
    day: {
      ...day,
      scheduleItems: day.scheduleItems.map((s) =>
        s.id === item.id ? { ...s, carriedTo: toDayId } : s,
      ),
    },
    carried: {
      id: block.id,
      text: block.text.trim(),
      goal: null,
      origin: "action",
      bucket: "task",
      originDayId: day.id,
      createdAt: null,
    },
  };
}

/** Where "carry forward" sends something by default. */
export function tomorrowOf(dayId: ISODate): ISODate {
  return shiftDayId(dayId, 1);
}

/** True when this record has been carried, so it reads as history not work. */
export function isCarried(
  record: { carriedTo?: ISODate | null },
): boolean {
  return Boolean(record.carriedTo);
}

// ------------------------------------------------------------ reflection

export function hasReflection(day: Day): boolean {
  const review = day.review;
  if (!review) return false;
  return (
    written(review.proudOf) ||
    written(review.betterTomorrow) ||
    review.mood !== null ||
    review.stress !== null
  );
}

export function writeReview(day: Day, patch: Partial<DailyReview>, now: Date): Day {
  const base = day.review ?? blankReview(now);
  return { ...day, review: { ...base, ...patch, updatedAt: now.toISOString() } };
}

/** Kept so a caller can show a standalone block's hour beside its text. */
export function scheduleTimeOf(day: Day, id: string): ScheduleItem["time"] | null {
  return day.scheduleItems.find((s) => s.id === id)?.time ?? null;
}
