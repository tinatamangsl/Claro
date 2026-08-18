/**
 * Carry unfinished work forward.
 *
 * Two rules do the real work here. A day becomes **eligible** at 22:00 in the
 * user's own local time; and because the browser may well be shut at 22:00, the
 * rule is applied whenever Claro is next opened rather than on a schedule. That
 * is why every function takes an explicit `now` and nothing here sets a timer.
 *
 * Nothing is ever carried twice: the source item records the day it was carried
 * into, and the destination refuses any id it already holds. Nothing is ever
 * overwritten either — carried work only fills a priority slot that is still
 * blank, and otherwise waits in a visible review area for an explicit decision.
 */

import { formatDayId, parseDayId, shiftDayId } from "./dates";
import { readDay } from "./storage";
import {
  PRIORITY_KEYS,
  isPrioritySet,
  type ActionItem,
  type CarriedItem,
  type ClaroState,
  type Day,
  type ISODate,
  type Priority,
  type PriorityKey,
} from "./types";

/** 10 PM local. Late enough that a working evening isn't cut short. */
export const ROLLOVER_HOUR = 22;

/**
 * How far back a single open will reach. Coming back after a fortnight away
 * should not empty a fortnight of unfinished work onto today — the older days
 * keep their record, they just stop chasing you.
 */
export const ROLLOVER_LOOKBACK_DAYS = 7;

/** The moment a day becomes eligible: 22:00 local on that day. */
export function rolloverAt(dayId: ISODate): Date {
  const day = parseDayId(dayId);
  // Built from local parts rather than by adding hours, so a DST boundary
  // inside the day still lands on 10 PM as the user experienced it.
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), ROLLOVER_HOUR, 0, 0, 0);
}

export function isEligible(dayId: ISODate, now: Date): boolean {
  return now.getTime() >= rolloverAt(dayId).getTime();
}

/**
 * Where unfinished work lands: the first day that has not yet passed its own
 * 10 PM. Before 10 PM that is today; after it, tomorrow — so working late never
 * has the effect of clearing the page you are still working on.
 */
export function rolloverTargetDayId(now: Date): ISODate {
  const todayId = formatDayId(now);
  return isEligible(todayId, now) ? shiftDayId(todayId, 1) : todayId;
}

// --------------------------------------------------------------- conversions

function carriedFromPriority(
  priority: Priority,
  key: PriorityKey,
  sourceDayId: ISODate,
): CarriedItem {
  return {
    // Written priorities always have an id; the fallback stays deterministic so
    // even a hand-edited store cannot produce two copies of the same slot.
    id: priority.id ?? `${sourceDayId}:${key}`,
    text: priority.text.trim(),
    goal: priority.goal,
    origin: "priority",
    bucket: null,
    originDayId: priority.originDayId ?? sourceDayId,
    createdAt: priority.createdAt,
  };
}

function carriedFromAction(action: ActionItem, sourceDayId: ISODate): CarriedItem {
  return {
    id: action.id,
    text: action.text.trim(),
    goal: null,
    origin: "action",
    bucket: action.bucket,
    originDayId: action.originDayId ?? sourceDayId,
    createdAt: action.createdAt,
  };
}

/** Placing carried work keeps its identity and its original dates. */
function priorityFromCarried(item: CarriedItem): Priority {
  return {
    id: item.id,
    text: item.text,
    done: false,
    goal: item.goal,
    createdAt: item.createdAt,
    originDayId: item.originDayId,
    carriedTo: null,
  };
}

function actionFromCarried(item: CarriedItem, now: Date): ActionItem {
  return {
    id: item.id,
    text: item.text,
    // An unfinished priority is rarely a quick tick; anything else keeps its bucket.
    bucket: item.origin === "priority" ? "project" : (item.bucket ?? "task"),
    done: false,
    createdAt: item.createdAt ?? now.toISOString(),
    originDayId: item.originDayId,
    carriedTo: null,
  };
}

// ------------------------------------------------------------------ placement

/** The one guard against duplication, checked wherever an item could land. */
export function alreadyOnDay(day: Day, itemId: string): boolean {
  return (
    PRIORITY_KEYS.some((key) => day[key].id === itemId) ||
    day.actions.some((action) => action.id === itemId) ||
    day.carriedForward.some((item) => item.id === itemId)
  );
}

export function firstFreePriorityKey(day: Day): PriorityKey | null {
  return PRIORITY_KEYS.find((key) => !isPrioritySet(day[key])) ?? null;
}

/** Waits for a decision rather than being merged into the day. */
export function queueCarried(day: Day, item: CarriedItem): Day {
  if (alreadyOnDay(day, item.id)) return day;
  return { ...day, carriedForward: [...day.carriedForward, item] };
}

/**
 * A carried priority fills a blank slot if the day has one; everything else
 * queues for review. A slot that already holds words is never touched.
 */
export function receiveCarried(day: Day, item: CarriedItem): Day {
  if (alreadyOnDay(day, item.id)) return day;

  if (item.origin === "priority") {
    const key = firstFreePriorityKey(day);
    if (key) return { ...day, [key]: priorityFromCarried(item) };
  }

  return { ...day, carriedForward: [...day.carriedForward, item] };
}

// -------------------------------------------------------------------- the run

/** Everything one source day hands to the target, in one pass. */
function carryDay(
  source: Day,
  target: Day,
  targetDayId: ISODate,
): { source: Day; target: Day } {
  let nextSource = source;
  let nextTarget = target;

  for (const key of PRIORITY_KEYS) {
    const priority = nextSource[key];
    if (!isPrioritySet(priority) || priority.done || priority.carriedTo) continue;

    nextTarget = receiveCarried(nextTarget, carriedFromPriority(priority, key, source.id));
    nextSource = { ...nextSource, [key]: { ...priority, carriedTo: targetDayId } };
  }

  let actionsChanged = false;
  const actions = nextSource.actions.map((action) => {
    if (action.done || action.text.trim() === "" || action.carriedTo) return action;

    nextTarget = receiveCarried(nextTarget, carriedFromAction(action, source.id));
    actionsChanged = true;
    return { ...action, carriedTo: targetDayId };
  });
  if (actionsChanged) nextSource = { ...nextSource, actions };

  // Items still awaiting review move on rather than being stranded on a page
  // the user has no reason to visit again.
  if (nextSource.carriedForward.length > 0) {
    for (const item of nextSource.carriedForward) nextTarget = queueCarried(nextTarget, item);
    nextSource = { ...nextSource, carriedForward: [] };
  }

  return { source: nextSource, target: nextTarget };
}

/**
 * Idempotent by construction: run it twice and the second run returns the very
 * same state object, because every item it would move is already marked as
 * carried. That is what makes it safe to call on every open and every tick.
 *
 * The source day keeps its own record. Carrying copies the work forward and
 * notes where it went; it does not rewrite what yesterday looked like.
 */
export function applyRollover(state: ClaroState, now: Date): ClaroState {
  const targetDayId = rolloverTargetDayId(now);
  const earliest = shiftDayId(targetDayId, -ROLLOVER_LOOKBACK_DAYS);

  // Ids are ISO dates, so lexicographic ordering is chronological ordering.
  const sourceIds = Object.keys(state.days)
    .filter((id) => id < targetDayId && id >= earliest && isEligible(id, now))
    .sort();

  if (sourceIds.length === 0) return state;

  const days = { ...state.days };
  let target = readDay(state, targetDayId);
  const targetBefore = target;
  let changed = false;

  for (const sourceId of sourceIds) {
    const source = readDay(state, sourceId);
    const carried = carryDay(source, target, targetDayId);

    if (carried.source !== source) {
      days[sourceId] = carried.source;
      changed = true;
    }
    target = carried.target;
  }

  if (target !== targetBefore) {
    days[targetDayId] = target;
    changed = true;
  }

  return changed ? { ...state, days } : state;
}

// ------------------------------------------------------------------ decisions

export function findCarried(day: Day, itemId: string): CarriedItem | null {
  return day.carriedForward.find((item) => item.id === itemId) ?? null;
}

function withoutCarried(day: Day, itemId: string): Day {
  return { ...day, carriedForward: day.carriedForward.filter((item) => item.id !== itemId) };
}

/** Into a blank priority slot. A no-op when all three are already spoken for. */
export function promoteCarried(day: Day, itemId: string): Day {
  const item = findCarried(day, itemId);
  if (!item) return day;

  const key = firstFreePriorityKey(day);
  if (!key) return day;

  return { ...withoutCarried(day, itemId), [key]: priorityFromCarried(item) };
}

export function keepCarriedAsAction(day: Day, itemId: string, now: Date): Day {
  const item = findCarried(day, itemId);
  if (!item) return day;

  const next = withoutCarried(day, itemId);
  return { ...next, actions: [...next.actions, actionFromCarried(item, now)] };
}

/** Not happening, and that is a legitimate answer. */
export function letGoCarried(day: Day, itemId: string): Day {
  return findCarried(day, itemId) ? withoutCarried(day, itemId) : day;
}

/** Lifts an item off a day so it can be scheduled onto another. */
export function takeCarried(day: Day, itemId: string): { day: Day; item: CarriedItem | null } {
  const item = findCarried(day, itemId);
  return item ? { day: withoutCarried(day, itemId), item } : { day, item: null };
}
