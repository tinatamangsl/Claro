/**
 * When the user's own estimate changes, said once and said plainly.
 *
 * The design this came from framed it as the app having learned something about
 * a person and then acting on it. What actually happens is narrower and
 * checkable: they logged more dates, so the median of their own gaps moved.
 * That is worth reporting, and it is all that is reported.
 *
 * Nothing here schedules anything, prioritises anything, or promises to treat a
 * future window differently. There is no "apply to my calendar", because there
 * is nothing to apply: a changed estimate changes a number on a page.
 */

import { durationHistory, estimateNext } from "./cycle";
import { observations } from "./cycle-timeline";
import { formatWeeksAndDays } from "./cycle";
import type { CycleState, EstimateSnapshot } from "./types";

export type CycleChange = {
  id: string;
  /** What moved. Never a promise about what Claro will do next. */
  title: string;
  body: string;
};

/** The numbers a snapshot is made of, without the time it was taken. */
export function currentSnapshot(cycle: CycleState): Omit<EstimateSnapshot, "seenAt"> {
  const estimate = estimateNext(cycle);
  const durations = durationHistory(cycle);

  return {
    typicalGap: estimate?.typicalGap ?? null,
    basedOn: estimate?.basedOn ?? 0,
    durationMin: durations?.min ?? null,
    durationMax: durations?.max ?? null,
    observations: observations(cycle).length,
  };
}

export function snapshotNow(cycle: CycleState, now: Date): EstimateSnapshot {
  return { ...currentSnapshot(cycle), seenAt: now.toISOString() };
}

/**
 * What has moved since the user was last shown their estimate.
 *
 * An empty list is the ordinary answer and means the screen is not shown at
 * all. Nothing is invented to fill it.
 */
export function changesSince(cycle: CycleState): CycleChange[] {
  const now = currentSnapshot(cycle);
  const seen = cycle.lastSeen;
  const changes: CycleChange[] = [];

  if (now.typicalGap !== null && (seen === null || seen.typicalGap === null)) {
    changes.push({
      id: "first-estimate",
      title: "There is enough history for an estimate",
      body: `Across ${now.basedOn} recorded ${now.basedOn === 1 ? "gap" : "gaps"}, your own median is ${formatWeeksAndDays(now.typicalGap)}. It is worked out from the dates you entered and nothing else.`,
    });
  } else if (
    now.typicalGap !== null &&
    seen?.typicalGap != null &&
    now.typicalGap !== seen.typicalGap
  ) {
    changes.push({
      id: "gap-moved",
      title: "Your usual cycle length moved",
      body: `The median of your own gaps went from ${seen.typicalGap} to ${now.typicalGap} days, now across ${now.basedOn} recorded ${now.basedOn === 1 ? "gap" : "gaps"}. Cycle length is counted from the first day of one period to the first day of the next.`,
    });
  }

  const rangeChanged =
    now.durationMin !== null &&
    now.durationMax !== null &&
    (seen === null || seen.durationMin !== now.durationMin || seen.durationMax !== now.durationMax);

  if (rangeChanged) {
    changes.push({
      id: "durations",
      title: "Your recorded durations changed",
      body:
        now.durationMin === now.durationMax
          ? `Every period you have completed lasted ${now.durationMin} ${now.durationMin === 1 ? "day" : "days"}. Claro reads that back and passes no judgement on it.`
          : `Your recorded durations now run from ${now.durationMin} to ${now.durationMax} days. Claro reads that back and passes no judgement on it.`,
    });
  }

  if (now.observations > (seen?.observations ?? 0)) {
    changes.push({
      id: "observations",
      title: "Your notes now support an observation",
      body: `You have written enough for Claro to describe a pattern in your own entries. It is a count of what you recorded, not a prediction, and nothing in your plans changes because of it.`,
    });
  }

  return changes;
}

/** True when there is something to show, which is the only time the screen appears. */
export function hasChanges(cycle: CycleState): boolean {
  return changesSince(cycle).length > 0;
}
