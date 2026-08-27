/**
 * An estimated timeline, and observations drawn from the user's own notes.
 *
 * Two rules govern everything here.
 *
 * First, the only input is dates the user typed in. Nothing is inferred about a
 * body, and no external model, average or population figure is used anywhere.
 *
 * Second, the phase is a **label on that arithmetic**, not a measurement.
 * Claro names the four phases because the user asked for them and because they
 * are the shape most people have for their own cycle, but every place one
 * appears says it was estimated from logged dates. The one thing the naming
 * must never become is a fertility prediction: see `OVULATION_NOTE`.
 *
 * Nothing here says what a phase does to anyone, and nothing recommends food,
 * exercise, work, sound or behaviour.
 */

import { differenceInCalendarDays } from "date-fns";

import { estimateNext, sortedEntries } from "./cycle";
import {
  CYCLE_PHASES,
  phaseBands,
  projectedDay,
  type CyclePhase,
} from "./cycle-phases";
import {
  ENERGY_LABELS,
  MOOD_FACE_META,
  STRESS_LABELS,
  type CycleCheckIn,
  type CycleState,
  type Feeling,
  type ISODate,
} from "./types";

export type CyclePosition = {
  /** Day 1 is the logged start itself. */
  day: number;
  /** The cycle length the phases were divided from. */
  ofAbout: number;
  phase: CyclePhase;
  /** The logged date this is counted from. */
  since: ISODate;
  /** True once the count has run into cycles nobody has logged yet. */
  projected: boolean;
};

/**
 * Where a day falls, counted from the most recent logged start on or before it.
 *
 * Null whenever there is no start to count from, or not enough history to know
 * a typical length. Guessing either would be inventing information.
 */
export function positionOn(cycle: CycleState, dayId: ISODate): CyclePosition | null {
  const projected = projectedDay(cycle, dayId);
  if (!projected) return null;

  const previous = sortedEntries(cycle)
    .filter((entry) => entry.startDate <= dayId)
    .at(-1);
  if (!previous) return null;

  return {
    day: projected.day,
    ofAbout: projected.length,
    phase: projected.phase,
    since: previous.startDate,
    projected: projected.projected,
  };
}

// ------------------------------------------------------------- patterns

/** Below this there is not enough of the user's own history to describe. */
export const MIN_NOTES_FOR_PATTERN = 5;
/** And this many within one phase, or the description would be about noise. */
export const MIN_NOTES_IN_PHASE = 3;

export type PatternObservation = {
  phase: CyclePhase;
  /** Plain description of what the user themselves recorded. */
  text: string;
  /** How many notes in this phase it was drawn from. */
  of: number;
};

type Reading = { note: CycleCheckIn; phase: CyclePhase };

function readingsFor(cycle: CycleState): Reading[] {
  const readings: Reading[] = [];
  for (const note of Object.values(cycle.checkIns)) {
    if (note.energy === null && note.mood === null && note.stress === null) continue;
    const position = positionOn(cycle, note.dayId);
    if (!position) continue;
    readings.push({ note, phase: position.phase });
  }
  return readings;
}

/** "3 of your last 5" style counts, for one band and one reading. */
function describe(
  readings: Reading[],
  phase: CyclePhase,
  pick: (note: CycleCheckIn) => number | null,
  low: number,
  phrase: string,
): PatternObservation | null {
  const inPhase = readings.filter((r) => r.phase === phase && pick(r.note) !== null);
  if (inPhase.length < MIN_NOTES_IN_PHASE) return null;

  const matching = inPhase.filter((r) => (pick(r.note) as number) <= low).length;
  // Only worth saying when it is most of them.
  if (matching < Math.ceil(inPhase.length / 2)) return null;

  return {
    phase,
    of: inPhase.length,
    text: `You logged ${phrase} on ${matching} of your last ${inPhase.length} notes in this part of your cycle.`,
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
  for (const phase of CYCLE_PHASES) {
    const energy = describe(readings, phase, (n) => n.energy, 2, "lower energy");
    if (energy) found.push(energy);

    const stress = describe(
      readings,
      phase,
      (n) => (n.stress === null ? null : 6 - n.stress),
      2,
      "higher stress",
    );
    if (stress) found.push(stress);
  }
  return found;
}

/**
 * A note read back the way a person would say it.
 *
 * `summariseNote` reads "Energy good, Mood steady, Stress moderate", which is
 * the record printed out rather than the day described. This says "Good energy,
 * felt steady" instead, and drops what carries no signal:
 *
 * - **Energy always leads**, because it is the reading everything else is
 *   keyed to and the one most often the only thing logged.
 * - **Mood only when it was logged.** Nothing is inferred for a blank.
 * - **Stress only when it was high or very high.** Moderate and below on a
 *   five point scale is the middle of the range, and printing it on every row
 *   buries the two readings that were worth a mention.
 *
 * Still a description and not a reading: nothing here says what a day meant.
 */
export function describeNoteWarmly(note: CycleCheckIn): string {
  const parts: string[] = [];

  if (note.energy) parts.push(`${ENERGY_LABELS[note.energy]} energy`);
  if (note.mood) parts.push(`felt ${MOOD_FACE_META[note.mood].label.toLowerCase()}`);
  if (note.stress && note.stress >= 4) {
    parts.push(`${STRESS_LABELS[note.stress].toLowerCase()} stress`);
  }

  return parts.join(", ");
}

/** How much of "what I actually notice" fits on a row before it is cut. */
export const NOTICED_EXCERPT = 40;

/**
 * The reader's own words, shortened to a row.
 *
 * Cut on a word boundary rather than mid-syllable, and only when the text is
 * genuinely longer than the limit: a 41 character note ending in an ellipsis
 * to save one character reads as though something was withheld.
 */
export function noticedExcerpt(text: string, limit = NOTICED_EXCERPT): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= limit) return trimmed;

  const cut = trimmed.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
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

/**
 * The user's own past notes that fall in the same band as a given day.
 *
 * This is a lookup, not an insight. It answers "what did I write around this
 * point before?" and leaves every conclusion to the person reading it. Empty
 * whenever there is no position to compare against, which is the honest answer
 * rather than a list of unrelated notes.
 */
export function notesInPhase(cycle: CycleState, dayId: ISODate, limit = 5): CycleCheckIn[] {
  const here = positionOn(cycle, dayId);
  if (!here) return [];

  return Object.values(cycle.checkIns)
    .filter(
      (note) =>
        note.energy !== null ||
        note.mood !== null ||
        note.stress !== null ||
        note.note.trim() !== "",
    )
    .filter((note) => {
      const there = positionOn(cycle, note.dayId);
      if (!there || there.phase !== here.phase) return false;
      // Past cycles only. A note from three days ago is not history, and
      // calling it that would misdescribe what the user is looking at.
      return there.since !== here.since;
    })
    .sort((a, b) => b.dayId.localeCompare(a.dayId))
    .slice(0, limit);
}

// --------------------------------------------------- one band, described

export type PhaseSummary = {
  phase: CyclePhase;
  /** Which estimated cycle days this phase covers, or null without an estimate. */
  days: { from: number; to: number } | null;
  /** How many of the user's notes fall in it. */
  notes: number;
  /** The word they chose most often here. Null on a tie or with nothing logged. */
  commonFeeling: Feeling | null;
  /** How many of those notes recorded low energy. A count, never a verdict. */
  lowEnergy: number;
};

/** Every note the user wrote in one band of their own estimated cycle. */
export function notesForPhase(cycle: CycleState, phase: CyclePhase): CycleCheckIn[] {
  return Object.values(cycle.checkIns)
    .filter(
      (note) =>
        note.energy !== null ||
        note.feeling !== null ||
        note.mood !== null ||
        note.stress !== null ||
        note.note.trim() !== "",
    )
    .filter((note) => positionOn(cycle, note.dayId)?.phase === phase)
    .sort((a, b) => b.dayId.localeCompare(a.dayId));
}

/**
 * What the user's own notes say about one part of their cycle.
 *
 * Counts and a most-frequent word, and nothing beyond them. There is no
 * suggestion here about food, movement, work or capacity, because a count of
 * what somebody wrote does not support one: knowing they logged "exhausted"
 * four times says nothing about what they should have eaten.
 */
export function summarisePhase(cycle: CycleState, phase: CyclePhase): PhaseSummary {
  const notes = notesForPhase(cycle, phase);

  const counts = new Map<Feeling, number>();
  for (const note of notes) {
    if (!note.feeling) continue;
    counts.set(note.feeling, (counts.get(note.feeling) ?? 0) + 1);
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const tied = ranked.length > 1 && ranked[0][1] === ranked[1][1];

  // The days come from the same division the calendar paints, so the panel and
  // the grid can never disagree about where a phase starts.
  const bands = phaseBands(cycle);
  const days = bands
    ? phase === "menstrual"
      ? bands.menstrual
      : phase === "ovulation"
        ? bands.ovulation
        : phase === "follicular"
          ? bands.follicular
          : bands.luteal
    : null;

  return {
    phase,
    days,
    notes: notes.length,
    commonFeeling: ranked.length > 0 && !tied ? ranked[0][0] : null,
    lowEnergy: notes.filter((note) => note.energy !== null && note.energy <= 2).length,
  };
}
