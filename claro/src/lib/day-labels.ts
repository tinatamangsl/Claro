/**
 * Labels that describe a whole day, and stretches of days.
 *
 * "Office day", "annual leave", "in Berlin". Half of what a calendar tells you
 * at a glance is this sort of thing, and none of it belongs at a time: booking
 * annual leave at 9 AM would be a lie about when it applies.
 *
 * A stretch is stored as one label per day sharing a `spanId`, not as a range
 * record. Everything in Claro hangs off a `Day`, and a range would be a second
 * place a Tuesday could be described from; this way a day still answers for
 * itself, and clearing one day out of a week of leave is an ordinary edit
 * rather than a range that has to be split in two.
 */

import { newId } from "./id";
import type { Day, DayLabel, ISODate } from "./types";

/** The labels on a day, tolerating a record written before they existed. */
export function labelsOf(day: Day): DayLabel[] {
  return day.dayLabels ?? [];
}

/** A label added to one day of a stretch. `spanId` is what ties them together. */
export function addLabel(day: Day, text: string, spanId: string): Day {
  const trimmed = text.trim();
  if (!trimmed) return day;
  return {
    ...day,
    dayLabels: [...labelsOf(day), { id: newId(), text: trimmed, spanId }],
  };
}

/**
 * Renaming a stretch, one day at a time.
 *
 * Blank removes it. A label with nothing in it is not a label, and making the
 * user find a separate delete control for something they have already emptied
 * is the sort of friction that leaves stray rows behind.
 */
export function renameSpan(day: Day, spanId: string, text: string): Day {
  const trimmed = text.trim();
  if (!trimmed) return removeSpan(day, spanId);

  const labels = labelsOf(day);
  if (!labels.some((label) => label.spanId === spanId)) return day;

  return {
    ...day,
    dayLabels: labels.map((label) =>
      label.spanId === spanId ? { ...label, text: trimmed } : label,
    ),
  };
}

export function removeSpan(day: Day, spanId: string): Day {
  const labels = labelsOf(day);
  const kept = labels.filter((label) => label.spanId !== spanId);
  return kept.length === labels.length ? day : { ...day, dayLabels: kept };
}

/** A new identity for a stretch, so two spellings of "leave" stay separate. */
export function newSpanId(): string {
  return newId();
}

/** One bar on the week's all-day band: which columns it covers, and its words. */
export type LabelSpan = {
  spanId: string;
  text: string;
  /** Index of the first and last day column it covers, inclusive. */
  from: number;
  to: number;
};

/**
 * The bars to draw across a row of days.
 *
 * Contiguity is by `spanId` rather than by matching text, so two separate
 * trips that were both called "London" stay two bars, and a stretch broken in
 * the middle draws as the two pieces that are actually left rather than one
 * bar papering over the gap.
 *
 * Each label gets its own lane, in the order the day first mentions it, so a
 * bar never lands on top of another and the band's height says how many things
 * are running at once.
 */
export function spansOf(days: ISODate[], labelsFor: (dayId: ISODate) => DayLabel[]): LabelSpan[][] {
  const byDay = days.map(labelsFor);
  const open = new Map<string, LabelSpan>();
  const lanes: LabelSpan[][] = [];

  const laneFor = (span: LabelSpan): LabelSpan[] => {
    for (const lane of lanes) {
      // A lane is free from this column on if nothing in it reaches that far.
      if (lane.every((other) => other.to < span.from)) return lane;
    }
    const lane: LabelSpan[] = [];
    lanes.push(lane);
    return lane;
  };

  byDay.forEach((labels, index) => {
    const here = new Set(labels.map((label) => label.spanId));

    for (const [spanId, span] of open) {
      if (!here.has(spanId)) open.delete(spanId);
      else span.to = index;
    }

    for (const label of labels) {
      if (open.has(label.spanId)) continue;
      const span: LabelSpan = {
        spanId: label.spanId,
        text: label.text,
        from: index,
        to: index,
      };
      open.set(label.spanId, span);
      laneFor(span).push(span);
    }
  });

  return lanes;
}
