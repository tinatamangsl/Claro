import {
  CLARO_SCHEMA_VERSION,
  type ClaroState,
  type Day,
  type ISODate,
  type Quarter,
  type QuarterId,
  type Week,
  type WeekId,
} from "./types";

/**
 * The single seam between Claro and the browser. Every `typeof window` guard in
 * the app lives in this file — components never check for it. Swapping this
 * module for a networked adapter is the whole of "move Claro to a database".
 */

const KEY = "claro.store.v1";
const SAVE_DEBOUNCE_MS = 300;

// ------------------------------------------------------------- blank records

export function emptyState(): ClaroState {
  return { version: CLARO_SCHEMA_VERSION, quarters: {}, weeks: {}, days: {} };
}

export function blankQuarter(id: QuarterId): Quarter {
  return {
    id,
    work: { mainQuest: "", sideQuests: [] },
    life: { mainQuest: "", sideQuests: [] },
  };
}

export function blankWeek(id: WeekId): Week {
  return {
    id,
    work: { goal: "", actions: [] },
    life: { goal: "", actions: [] },
  };
}

export function blankDay(id: ISODate): Day {
  return {
    id,
    priority1: { text: "", done: false, link: null },
    priority2: { text: "", done: false, link: null },
    scheduleItems: [],
    actions: [],
    nonNegotiables: [],
    sleepHours: null,
    waterGlasses: 0,
    steps: null,
    mood: null,
    notes: "",
  };
}

// ----------------------------------------------------------------- migration

/**
 * Never throws. A corrupt or future-versioned payload yields an empty store
 * rather than a crashed app — and a future version is left on disk untouched
 * so an older build can't silently downgrade newer data.
 */
export function migrate(raw: unknown): ClaroState {
  if (!raw || typeof raw !== "object") return emptyState();

  const candidate = raw as Partial<ClaroState>;
  if (typeof candidate.version !== "number") return emptyState();
  if (candidate.version > CLARO_SCHEMA_VERSION) return emptyState();

  // Future migrations chain here: if (v < 2) state = v1ToV2(state)

  return {
    version: CLARO_SCHEMA_VERSION,
    quarters: isRecord(candidate.quarters) ? candidate.quarters : {},
    weeks: isRecord(candidate.weeks) ? candidate.weeks : {},
    days: isRecord(candidate.days) ? candidate.days : {},
  };
}

function isRecord<T>(value: unknown): value is Record<string, T> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Records are read through their blank template, so a field added in a later
 * version defaults correctly on every previously-saved record without any
 * explicit migration step.
 */
export function readQuarter(state: ClaroState, id: QuarterId): Quarter {
  const stored = state.quarters[id];
  if (!stored) return blankQuarter(id);
  const blank = blankQuarter(id);
  return {
    ...blank,
    ...stored,
    id,
    work: { ...blank.work, ...stored.work },
    life: { ...blank.life, ...stored.life },
  };
}

export function readWeek(state: ClaroState, id: WeekId): Week {
  const stored = state.weeks[id];
  if (!stored) return blankWeek(id);
  const blank = blankWeek(id);
  return {
    ...blank,
    ...stored,
    id,
    work: { ...blank.work, ...stored.work },
    life: { ...blank.life, ...stored.life },
  };
}

export function readDay(state: ClaroState, id: ISODate): Day {
  const stored = state.days[id];
  if (!stored) return blankDay(id);
  return { ...blankDay(id), ...stored, id };
}

// ------------------------------------------------------------------ browser

function ls(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    // Accessing localStorage throws outright in some privacy modes.
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadState(): ClaroState {
  const store = ls();
  if (!store) return emptyState();
  try {
    const raw = store.getItem(KEY);
    if (!raw) return emptyState();
    return migrate(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

let saveFailed = false;

export type SaveResult = "ok" | "unavailable" | "failed";

export function saveNow(state: ClaroState): SaveResult {
  const store = ls();
  if (!store) return "unavailable";
  try {
    store.setItem(KEY, JSON.stringify(state));
    saveFailed = false;
    return "ok";
  } catch {
    // Quota exceeded, or a privacy mode that allows reads but not writes.
    saveFailed = true;
    return "failed";
  }
}

export function hasSaveFailed(): boolean {
  return saveFailed;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: ClaroState | null = null;

/** Trailing debounce, so holding down a key writes to disk once, not per keystroke. */
export function scheduleSave(state: ClaroState, onResult?: (r: SaveResult) => void): void {
  pending = state;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (pending) {
      const result = saveNow(pending);
      pending = null;
      onResult?.(result);
    }
  }, SAVE_DEBOUNCE_MS);
}

/** Write immediately — used when the tab is being hidden or closed. */
export function flushSave(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (pending) {
    saveNow(pending);
    pending = null;
  }
}

export function clearState(): void {
  const store = ls();
  if (!store) return;
  try {
    store.removeItem(KEY);
  } catch {
    /* nothing useful to do */
  }
}

export const STORAGE_KEY = KEY;
