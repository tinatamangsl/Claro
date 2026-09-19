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
import { SCHEDULE_HOURS, SCHEDULE_MINUTES, atMinutes, hourOf, scheduleSlots } from "./dates";
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
  return freeSlotAfterLast(day, hour) ?? hour;
}

/**
 * Where a second entry in an hour should go, or null when there is no room.
 *
 * **Null rather than the hour itself, because the hour is a real answer.** The
 * old version returned `hour` for both "the hour is full" and "2:00 is free",
 * and the caller distinguished them by testing `nextFreeSlot(...) !== hour`.
 * That reads as full whenever :00 happens to be free, so an hour holding a
 * single 2:40 block offered no way to add anything beside it: the plus vanished
 * and there was no way back except editing the block that was already there.
 *
 * **It looks forward from what is already booked.** Having just written
 * something at 2:40, the next thing is almost always after it, not at 2:00. So
 * this takes the first free quarter at or after the latest item in the hour,
 * and only falls back to an earlier gap when there is nothing later — filling a
 * hole at 2:15 is still better than refusing.
 */
export function freeSlotAfterLast(day: Day, hour: string): string | null {
  const live = day.scheduleItems.filter((item) => item.carriedTo == null);
  const taken = new Set(live.map((item) => item.time));

  /*
   * Quarters first, then every other minute.
   *
   * The quarters keep ordinary days tidy: four things in an hour land on
   * 2:00, 2:15, 2:30, 2:45 rather than on whatever minute the clock happened
   * to read. Past that the hour used to simply refuse, and the plus vanished
   * with no reason given, which is a dead end on a day that genuinely had five
   * things in it. The remaining minutes are the overflow, so an hour is never
   * closed; they are only reached once the tidy slots are gone.
   */
  const quarters = SCHEDULE_MINUTES.map((m) => atMinutes(hour, m));
  const rest = Array.from({ length: 60 }, (_, m) => m)
    .filter((m) => !SCHEDULE_MINUTES.includes(m as (typeof SCHEDULE_MINUTES)[number]))
    .map((m) => atMinutes(hour, m));

  const inHour = live.map((item) => item.time).filter((time) => hourOf(time) === hour);
  const latest = inHour.length > 0 ? inHour.reduce((a, b) => (a > b ? a : b)) : null;

  const free = (list: string[]) => list.filter((slot) => !taken.has(slot));
  const after = (list: string[]) => (latest ? free(list).find((slot) => slot > latest) : undefined);

  /*
   * A tidy quarter always beats a stray minute, even an earlier one.
   *
   * With 2:00 and 2:45 booked, going strictly forward would offer 2:46, and a
   * day of 2:46s and 3:17s reads as noise. 2:15 is both free and the shape the
   * rest of the hour is already in, so the gap is the better answer. Minutes
   * are the overflow and are only reached once no quarter is left.
   */
  return after(quarters) ?? free(quarters)[0] ?? after(rest) ?? free(rest)[0] ?? null;
}

/** Whether an hour has any quarter left. Asked plainly, not inferred. */
export function hourHasRoom(day: Day, hour: string): boolean {
  return freeSlotAfterLast(day, hour) !== null;
}
