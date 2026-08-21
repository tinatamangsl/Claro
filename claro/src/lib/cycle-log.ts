/**
 * The quick daily log: a coarse energy reading, a word for the day, a note.
 *
 * The three energy taps are a *view* of the same five-level reading the fuller
 * page writes, not a second field beside it. One stored number, two ways of
 * entering it, so they can never disagree.
 *
 * Nothing here predicts, advises or interprets. A reading is what somebody said
 * about their own day, and Claro's only job is to hold it.
 */

import type { CycleCheckIn, EnergyLevel, Feeling } from "./types";

export type EnergyBand = "low" | "medium" | "high";

export const ENERGY_BANDS: EnergyBand[] = ["low", "medium", "high"];

export const ENERGY_BAND_LABELS: Record<EnergyBand, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/** Which of the three a stored level falls into. */
export function bandOf(level: EnergyLevel | null): EnergyBand | null {
  if (level === null) return null;
  if (level <= 2) return "low";
  if (level === 3) return "medium";
  return "high";
}

/**
 * The level to store when a band is tapped.
 *
 * A level already inside the band is kept, so someone who recorded a 5 on the
 * fuller page and then taps HIGH here still has a 5. Only a move between bands
 * rewrites the number.
 */
export function levelForBand(band: EnergyBand, current: EnergyLevel | null): EnergyLevel {
  if (current !== null && bandOf(current) === band) return current;
  return band === "low" ? 2 : band === "medium" ? 3 : 4;
}

/**
 * True once the day carries anything the user entered this morning.
 *
 * Written against truthiness rather than `!== null`, because a record saved
 * before a field existed arrives with `undefined` there, and `undefined !== null`
 * would count a completely blank note as logged.
 */
export function isLogged(note: CycleCheckIn): boolean {
  return Boolean(note.energy) || Boolean(note.feeling) || note.note.trim() !== "";
}

export function isEveningDone(note: CycleCheckIn): boolean {
  return Boolean(note.evening);
}

/** A one-line read-back of the morning, for the evening screen to refer to. */
export function describeMorning(note: CycleCheckIn, feelingLabel: (f: Feeling) => string): string {
  const band = bandOf(note.energy);
  const parts = [
    band ? `${ENERGY_BAND_LABELS[band].toLowerCase()} energy` : null,
    note.feeling ? feelingLabel(note.feeling).toLowerCase() : null,
  ].filter(Boolean);

  return parts.length === 0 ? "" : parts.join(", ");
}


// ------------------------------------------------------- the guided steps

/**
 * "It started a few days ago" without making anyone find a date picker.
 *
 * Five is the last chip rather than a cap on anything: past it, the calendar on
 * the cycle page takes an exact date, which is the right tool for a period the
 * user is reconstructing rather than remembering.
 */
export const DAYS_AGO_OPTIONS = [1, 2, 3, 4, 5] as const;

export type PeriodAnswer =
  | { kind: "started"; daysAgo: number }
  | { kind: "ended" }
  | { kind: "none" };

/**
 * The completion line.
 *
 * Warm, and deliberately about what the user just entered rather than about
 * what their body is doing or what they should now do with their day. The
 * design this came from offered "rest is productive right now" and "finish,
 * don't start"; both decide somebody's day for them from a calendar estimate.
 */
export const LOGGED_LINE = "logged. that's today, in your own words.";
