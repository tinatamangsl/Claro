import type { ScheduleItem } from "./types";

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
