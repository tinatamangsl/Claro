/**
 * How long a block is, and whether a break follows it.
 *
 * The presets are starting points, not a menu the user is confined to: any
 * length from one minute to three hours can be typed in, because someone who
 * works in nineteen minute stretches is not doing it wrong. Pomodoro is on the
 * list because it is a real, widely used technique with a break built into it,
 * not because 25 minutes is correct.
 *
 * Everything here is arithmetic on numbers. No timer, no clock, no React.
 */

import { FOCUS_BLOCK_MS, type FocusPrefs } from "./types";

export type FocusPreset = {
  id: string;
  label: string;
  /** The shape of it, in the fewest words that are still accurate. */
  hint: string;
  focusMs: number;
  /** 0 means no break, which is a choice rather than a gap. */
  breakMs: number;
};

export const CUSTOM_PRESET_ID = "custom";

const minutes = (n: number) => n * 60_000;

/**
 * Pomodoro is named because it is the technique's actual name, and it is the
 * one shape here that is a technique rather than a duration. The others are
 * plainly what they say they are.
 */
export const FOCUS_PRESETS: FocusPreset[] = [
  {
    id: "pomodoro",
    label: "Pomodoro",
    hint: "25 on, 5 off",
    focusMs: minutes(25),
    breakMs: minutes(5),
  },
  {
    id: "deep",
    label: "Long block",
    hint: "50 on, 10 off",
    focusMs: minutes(50),
    breakMs: minutes(10),
  },
  {
    id: "short",
    label: "Short burst",
    hint: "15 minutes, no break",
    focusMs: minutes(15),
    breakMs: 0,
  },
  {
    id: "begin",
    label: "Just begin",
    hint: "5 minutes, no break",
    focusMs: minutes(5),
    breakMs: 0,
  },
];

export const MIN_FOCUS_MINUTES = 1;
export const MAX_FOCUS_MINUTES = 180;
export const MIN_BREAK_MINUTES = 0;
export const MAX_BREAK_MINUTES = 60;

export const DEFAULT_FOCUS_PREFS: FocusPrefs = {
  plannedMs: FOCUS_BLOCK_MS,
  breakMs: minutes(5),
  presetId: "pomodoro",
};

export function msToMinutes(ms: number): number {
  return Math.round(ms / 60_000);
}

export function minutesToMs(value: number): number {
  return Math.round(value) * 60_000;
}

/**
 * Keeps a typed number inside the range, and turns anything unreadable into the
 * fallback rather than into `NaN` — a blank or half-typed field must never end
 * up as a block length.
 */
export function clampMinutes(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function clampFocusMinutes(value: number): number {
  return clampMinutes(value, MIN_FOCUS_MINUTES, MAX_FOCUS_MINUTES, msToMinutes(FOCUS_BLOCK_MS));
}

export function clampBreakMinutes(value: number): number {
  return clampMinutes(value, MIN_BREAK_MINUTES, MAX_BREAK_MINUTES, 0);
}

export function presetById(id: string): FocusPreset | null {
  return FOCUS_PRESETS.find((preset) => preset.id === id) ?? null;
}

/**
 * The preset a pair of durations happens to be, if any.
 *
 * Typing 25 and 5 by hand is Pomodoro, and showing it as "Custom" would be
 * pedantry. The chips are derived from the numbers rather than tracked
 * separately, so the two can never disagree.
 */
export function matchPreset(plannedMs: number, breakMs: number): FocusPreset | null {
  return (
    FOCUS_PRESETS.find(
      (preset) => preset.focusMs === plannedMs && preset.breakMs === breakMs,
    ) ?? null
  );
}

/** "25 minutes", "1 hour", "1 hour 30 minutes". */
export function formatBlockLength(ms: number): string {
  const total = Math.max(0, msToMinutes(ms));
  const hours = Math.floor(total / 60);
  const rest = total % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (rest > 0 || hours === 0) parts.push(`${rest} ${rest === 1 ? "minute" : "minutes"}`);
  return parts.join(" ");
}

/**
 * The adjectival form: "a 5 minute break", never "a 5 minutes break".
 * Breaks are capped at an hour, so minutes are always the right unit here.
 */
export function formatBreakLength(ms: number): string {
  return `${Math.max(0, msToMinutes(ms))} minute`;
}

/** The one line under the picker that says exactly what pressing start will do. */
export function describeBlock(plannedMs: number, breakMs: number): string {
  const focus = formatBlockLength(plannedMs);
  return breakMs > 0
    ? `${focus} of focus, then a ${formatBreakLength(breakMs)} break.`
    : `${focus} of focus, with no break after it.`;
}

/** Reading a stored preference back, with anything unusable replaced. */
export function readFocusPrefs(raw: unknown): FocusPrefs {
  if (!raw || typeof raw !== "object") return DEFAULT_FOCUS_PREFS;
  const prefs = raw as Partial<FocusPrefs>;

  const plannedMs = minutesToMs(
    clampFocusMinutes(
      typeof prefs.plannedMs === "number" ? msToMinutes(prefs.plannedMs) : Number.NaN,
    ),
  );
  const breakMs = minutesToMs(
    clampBreakMinutes(typeof prefs.breakMs === "number" ? msToMinutes(prefs.breakMs) : 0),
  );

  return {
    plannedMs,
    breakMs,
    presetId:
      typeof prefs.presetId === "string" && prefs.presetId.trim() !== ""
        ? prefs.presetId
        : (matchPreset(plannedMs, breakMs)?.id ?? CUSTOM_PRESET_ID),
  };
}
