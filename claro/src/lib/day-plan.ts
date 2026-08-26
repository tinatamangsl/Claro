/**
 * Putting something on a day from outside that day.
 *
 * The calendar and Today write to the same `scheduleItems`, so a block added
 * from a month cell is the same record the day's own schedule renders. There is
 * no second store of "events" beside the schedule, because two stores of the
 * same thing is how a calendar and a planner start disagreeing about what is
 * happening on Thursday.
 *
 * A block can also *be* a priority rather than merely mention one. `ScheduleLink`
 * already expresses that, so promoting writes the priority and links the block
 * to it: one piece of work, named once, and ticking either place ticks both.
 */

import { blockItem, linkedItem } from "./schedule";
import { SCHEDULE_HOURS, SCHEDULE_MINUTES, atMinutes, scheduleSlots } from "./dates";
import { newId } from "./id";
import { PRIORITY_KEYS, type Day, type PriorityKey, type ScheduleItem } from "./types";

/** How many blocks a day is carrying, for the month grid to show at a glance. */
export function scheduledCount(day: Day): number {
  return day.scheduleItems.filter((item) => item.carriedTo == null).length;
}

/**
 * The hours that day has nothing in yet.
 *
 * One thing per hour is the schedule's rule, so the picker offers only free
 * hours rather than letting somebody choose a slot that will be refused.
 */
export function freeHours(day: Day): string[] {
  const taken = new Set(
    day.scheduleItems.filter((item) => item.carriedTo == null).map((item) => item.time),
  );
  return scheduleSlots().filter((slot) => !taken.has(slot));
}

/** The first priority slot with nothing in it, or null when all three are taken. */
export function freePriorityKey(day: Day): PriorityKey | null {
  return PRIORITY_KEYS.find((key) => day[key].text.trim() === "") ?? null;
}

export type PlanResult =
  /**
   * `slotsFull` still returns the day with the block on it. Refusing to record
   * something because three priority slots are taken would lose what the user
   * typed over a cap that exists to help them.
   */
  | { ok: true; day: Day; promoted: boolean; slotsFull?: true }
  | { ok: false; reason: "hourTaken" | "empty" };

export const SLOTS_FULL_NOTE =
  "All three priorities are taken that day, so this went in as a time block. Open the day to decide what moves.";

export const HOUR_TAKEN_NOTE = "That hour already has something in it.";

/**
 * Adds a block at an hour, optionally as that day's priority.
 *
 * `settleHours` keeps the one-thing-per-hour rule: an hour that is already
 * taken moves its occupant rather than being overwritten.
 */
export function planBlock(
  day: Day,
  input: { time: string; text: string; asPriority: boolean },
  now: Date,
): PlanResult {
  const text = input.text.trim();
  if (text === "") return { ok: false, reason: "empty" };
  if (!freeHours(day).includes(input.time)) return { ok: false, reason: "hourTaken" };

  if (!input.asPriority) {
    return { ok: true, day: place(day, blockItem(input.time, text)), promoted: false };
  }

  const key = freePriorityKey(day);
  if (!key) {
    return { ok: true, day: place(day, blockItem(input.time, text)), promoted: false, slotsFull: true };
  }

  const priorityId = newId();
  const withPriority: Day = {
    ...day,
    [key]: {
      ...day[key],
      id: priorityId,
      text,
      done: false,
      createdAt: now.toISOString(),
      originDayId: day.id,
    },
  };

  return {
    ok: true,
    day: place(withPriority, linkedItem(input.time, { kind: "priority", priorityId }, text)),
    promoted: true,
  };
}

function place(day: Day, item: ScheduleItem): Day {
  return { ...day, scheduleItems: [...day.scheduleItems, item] };
}

/**
 * The next free quarter inside an hour.
 *
 * Typing into an hour that already holds something should add beside it rather
 * than be refused: the hour is a frame, and 4:00 and 4:30 are different times.
 * Falls back to the hour itself when every quarter is taken, which `planBlock`
 * then refuses with a reason.
 */
export function nextFreeSlot(day: Day, hour: string): string {
  const taken = new Set(
    day.scheduleItems.filter((item) => item.carriedTo == null).map((item) => item.time),
  );
  return SCHEDULE_MINUTES.map((m) => atMinutes(hour, m)).find((slot) => !taken.has(slot)) ?? hour;
}
