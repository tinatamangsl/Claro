/**
 * An estimated timeline, and observations drawn from the user's own notes.
 *
 * Two rules govern everything here.
 *
 * First, the only input is dates the user typed in. Nothing is inferred about a
 * body, and no external model, average or population figure is used anywhere.
 *
 * Second, the labels are **positional, not physiological**. A band is named for
 * where it falls in the user's own estimated cycle, not for what is supposedly
 * happening inside them. Naming bands after phases would be a claim about
 * physiology, and one common label is a fertility prediction, which Claro must
 * never make. "Early in your estimated cycle" is honest about being arithmetic
 * on dates; "follicular" would not be.
 *
 * Nothing here says what a band does to anyone, and nothing recommends food,
 * exercise, work, sound or behaviour.
 */

import { differenceInCalendarDays } from "date-fns";

import { estimateNext, sortedEntries } from "./cycle";
import { parseDayId } from "./dates";
import {
  ENERGY_LABELS,
  MOOD_FACE_META,
  STRESS_LABELS,
  type CycleCheckIn,
  type CycleState,
  type ISODate,
} from "./types";

/** Three equal bands of the user's own estimated cycle length. */
export type CycleBand = "early" | "middle" | "later";

export const CYCLE_BANDS: CycleBand[] = ["early", "middle", "later"];

export const BAND_LABELS: Record<CycleBand, string> = {
  early: "Early in your estimated cycle",
  middle: "Middle of your estimated cycle",
  later: "Later in your estimated cycle",
};

export const BAND_SHORT: Record<CycleBand, string> = {
  early: "Early",
  middle: "Middle",
  later: "Later",
};

export type CyclePosition = {
  /** Day 1 is the logged start itself. */
  day: number;
  /** The user's own median gap, which the bands are measured against. */
  ofAbout: number;
  band: CycleBand;
  /** The logged date this is counted from. */
  since: ISODate;
};

/**
 * Where a day falls, counted from the most recent logged start on or before it.
 *
 * Null whenever there is no start to count from, or not enough history to know
 * a typical length. Guessing either would be inventing information.
 */
export function positionOn(cycle: CycleState, dayId: ISODate): CyclePosition | null {
  const estimate = estimateNext(cycle);
  if (!estimate) return null;

  const previous = sortedEntries(cycle)
    .filter((entry) => entry.startDate <= dayId)
    .at(-1);
  if (!previous) return null;

  const day = differenceInCalendarDays(parseDayId(dayId), parseDayId(previous.startDate)) + 1;
  // Past the end of a typical length, the count stops meaning anything.
  if (day < 1 || day > estimate.typicalGap + 14) return null;

  const third = estimate.typicalGap / 3;
  const band: CycleBand = day <= third ? "early" : day <= third * 2 ? "middle" : "later";

  return { day, ofAbout: estimate.typicalGap, band, since: previous.startDate };
}

// ------------------------------------------------------------- patterns

/** Below this there is not enough of the user's own history to describe. */
export const MIN_NOTES_FOR_PATTERN = 5;
/** And this many within one band, or the description would be about noise. */
export const MIN_NOTES_IN_BAND = 3;

export type PatternObservation = {
  band: CycleBand;
  /** Plain description of what the user themselves recorded. */
  text: string;
  /** How many notes in this band it was drawn from. */
  of: number;
};

type Reading = { note: CycleCheckIn; band: CycleBand };

function readingsFor(cycle: CycleState): Reading[] {
  const readings: Reading[] = [];
  for (const note of Object.values(cycle.checkIns)) {
    if (note.energy === null && note.mood === null && note.stress === null) continue;
    const position = positionOn(cycle, note.dayId);
    if (!position) continue;
    readings.push({ note, band: position.band });
  }
  return readings;
}

/** "3 of your last 5" style counts, for one band and one reading. */
function describe(
  readings: Reading[],
  band: CycleBand,
  pick: (note: CycleCheckIn) => number | null,
  low: number,
  phrase: string,
): PatternObservation | null {
  const inBand = readings.filter((r) => r.band === band && pick(r.note) !== null);
  if (inBand.length < MIN_NOTES_IN_BAND) return null;

  const matching = inBand.filter((r) => (pick(r.note) as number) <= low).length;
  // Only worth saying when it is most of them.
  if (matching < Math.ceil(inBand.length / 2)) return null;

  return {
    band,
    of: inBand.length,
    text: `You logged ${phrase} on ${matching} of your last ${inBand.length} notes in this part of your cycle.`,
  };
}

/**
 * Descriptive observations only.
 *
 * Every sentence is a count of what the user wrote. There is no advice, no
 * cause, no prediction, and no comparison with anybody else. An empty list is
 * the correct answer whenever there is not enough of their own history.
 */
export function observations(cycle: CycleState): PatternObservation[] {
  const readings = readingsFor(cycle);
  if (readings.length < MIN_NOTES_FOR_PATTERN) return [];

  const found: PatternObservation[] = [];
  for (const band of CYCLE_BANDS) {
    const energy = describe(readings, band, (n) => n.energy, 2, "lower energy");
    if (energy) found.push(energy);

    const stress = describe(
      readings,
      band,
      (n) => (n.stress === null ? null : 6 - n.stress),
      2,
      "higher stress",
    );
    if (stress) found.push(stress);
  }
  return found;
}

/** A one-line summary of a note, for the history list. */
export function summariseNote(note: CycleCheckIn): string {
  return [
    note.energy ? `Energy ${ENERGY_LABELS[note.energy].toLowerCase()}` : null,
    note.mood ? `Mood ${MOOD_FACE_META[note.mood].label.toLowerCase()}` : null,
    note.stress ? `Stress ${STRESS_LABELS[note.stress].toLowerCase()}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}
