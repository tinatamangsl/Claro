/**
 * Writing to a day from the week grid.
 *
 * Pure and `now`-injected, like every other planner in `lib`. The week view is
 * a second *place* to write, never a second *store*: everything here returns
 * ordinary `Day` records, so the schedule the week draws and the schedule Daily
 * draws are the same records and cannot drift apart.
 */

import { atMinutes, hourOf, minutesOf } from "./dates";
import { freeSlotAfterLast } from "./day-plan";
import { addAction } from "./plan333";
import { blockItem, linkedItem, settleHours } from "./schedule";
import type { Bucket, Day, ScheduleItem } from "./types";

/**
 * What a cell of the week grid can create.
 *
 * Spelled as `Bucket` plus one, rather than listing the three buckets again,
 * so that a fourth bucket cannot appear on Daily and be quietly missing here.
 */
export type WeekEntryKind = "block" | Bucket;

/**
 * Moving a block to another day and hour.
 *
 * Returned as a pair, because a move across days is two edits: the block leaves
 * one `Day` and joins another, and both have to be written or the block exists
 * twice or not at all. Within one day it is the same record, re-timed.
 *
 * The landing time is the hour that was dropped on, at the minute the block was
 * already on when that minute is free. Dropping a 9:40 block on the 2 PM row
 * means 2:40, which is what somebody who set that minute deliberately expects;
 * when it is taken, the hour's own rules pick the next slot rather than
 * refusing the drop.
 */
export function moveBlock(
  from: Day,
  to: Day,
  itemId: string,
  hour: string,
): { from: Day; to: Day } | null {
  const item = from.scheduleItems.find((i) => i.id === itemId);
  if (!item) return null;

  const sameDay = from.id === to.id;
  const without: Day = sameDay
    ? from
    : { ...from, scheduleItems: from.scheduleItems.filter((i) => i.id !== itemId) };

  const target = sameDay ? without : to;
  const wanted = atMinutes(hour, minutesOf(item.time));
  const taken = target.scheduleItems.some((i) => i.id !== itemId && i.time === wanted);
  const time = taken ? (freeSlotAfterLast(target, hour) ?? wanted) : wanted;

  if (sameDay) {
    const moved = { ...item, time };
    const next = from.scheduleItems.map((i) => (i.id === itemId ? moved : i));
    return { from: { ...from, scheduleItems: settleHours(from.scheduleItems, next) }, to: from };
  }

  const landed: ScheduleItem = { ...item, time };
  return {
    from: without,
    to: { ...to, scheduleItems: [...to.scheduleItems, landed] },
  };
}

/** Where a new block dropped into an hour should land. */
export function slotFor(day: Day, hour: string): string {
  return freeSlotAfterLast(day, hour) ?? hour;
}

/**
 * The time asked for, or the nearest free one in that hour.
 *
 * A cell offers a default minute and lets it be changed, so the answer here is
 * usually just what was asked for. It gives way only when that exact minute is
 * already taken, because refusing to write something somebody has typed is
 * worse than writing it a minute or two along.
 */
export function freeAt(day: Day, time: string): string {
  const taken = day.scheduleItems.some((i) => i.carriedTo == null && i.time === time);
  return taken ? slotFor(day, hourOf(time)) : time;
}

/** A new block on a day, at the time asked for or the nearest free one. */
export function addBlock(day: Day, time: string, text: string): Day {
  const trimmed = text.trim();
  if (!trimmed) return day;
  return {
    ...day,
    scheduleItems: [...day.scheduleItems, blockItem(freeAt(day, time), trimmed)],
  };
}

/**
 * Anything a week cell can create, on the day it was drawn under.
 *
 * A block is only a booking, so it is written to the schedule and nowhere
 * else. A task, a quick tick or a project is a *record* that happens to be
 * booked: it joins that day's action list, which is where Daily, the carry
 * forward and the quarter all read actions from, and the schedule gets a row
 * pointing at it rather than a second copy of its words. Editing it later in
 * either place changes the one record.
 */
export function addEntry(
  day: Day,
  time: string,
  text: string,
  kind: WeekEntryKind,
  now: Date,
): Day {
  const trimmed = text.trim();
  if (!trimmed) return day;
  if (kind === "block") return addBlock(day, time, trimmed);

  const at = freeAt(day, time);
  const withAction = addAction(day, trimmed, kind, now);
  const action = withAction.actions[withAction.actions.length - 1];

  return {
    ...withAction,
    scheduleItems: [
      ...withAction.scheduleItems,
      linkedItem(at, { kind: "action", actionId: action.id }, trimmed),
    ],
  };
}

// ------------------------------------------------- moving and letting go

/**
 * The same thing, on another day, at the time it already had.
 *
 * Dragging answers "somewhere else on this week". This answers "not today",
 * which is the other half of what happens to a plan, and it is the one a menu
 * has to carry because the day being moved to is usually off the grid.
 *
 * Returned as a pair for the same reason `moveBlock` is: a move across days is
 * the record leaving one `Day` and joining another, and both have to be
 * written or it exists twice or not at all.
 */
export function moveBlockToDay(
  from: Day,
  to: Day,
  itemId: string,
): { from: Day; to: Day } | null {
  const item = from.scheduleItems.find((i) => i.id === itemId);
  if (!item || from.id === to.id) return null;

  const landed: ScheduleItem = { ...item, time: freeAt(to, item.time) };
  return {
    from: { ...from, scheduleItems: from.scheduleItems.filter((i) => i.id !== itemId) },
    to: { ...to, scheduleItems: [...to.scheduleItems, landed] },
  };
}

/**
 * An action, on another day.
 *
 * `originDayId` is deliberately left alone. It records where the work was
 * first written down, which is a fact about its history, not about where it
 * currently sits, and the carry forward reads it.
 */
export function moveActionToDay(
  from: Day,
  to: Day,
  actionId: string,
): { from: Day; to: Day } | null {
  const action = from.actions.find((a) => a.id === actionId);
  if (!action || from.id === to.id) return null;

  return {
    from: { ...from, actions: from.actions.filter((a) => a.id !== actionId) },
    to: { ...to, actions: [...to.actions, action] },
  };
}

/**
 * Letting a booking go.
 *
 * A linked row is only the booking: removing it leaves the priority, action or
 * habit it points at exactly where it was, which is the difference between
 * "not at four o'clock after all" and "not at all".
 */
export function removeBlock(day: Day, itemId: string): Day {
  const kept = day.scheduleItems.filter((i) => i.id !== itemId);
  return kept.length === day.scheduleItems.length ? day : { ...day, scheduleItems: kept };
}

/** Letting an action go, and any booking that pointed at it. */
export function removeAction(day: Day, actionId: string): Day {
  const kept = day.actions.filter((a) => a.id !== actionId);
  if (kept.length === day.actions.length) return day;

  return {
    ...day,
    actions: kept,
    // Otherwise the schedule keeps a row pointing at a record that is gone.
    scheduleItems: day.scheduleItems.filter(
      (i) => !(i.link?.kind === "action" && i.link.actionId === actionId),
    ),
  };
}

/** Ticking an action from the calendar, without opening the day it sits on. */
export function toggleAction(day: Day, actionId: string): Day {
  return {
    ...day,
    actions: day.actions.map((a) => (a.id === actionId ? { ...a, done: !a.done } : a)),
  };
}
