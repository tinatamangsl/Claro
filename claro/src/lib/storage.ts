import { newId } from "./id";
import {
  CLARO_SCHEMA_VERSION,
  SESSION_MODES,
  SOUNDSCAPES,
  type ClaroState,
  type Day,
  type CycleState,
  type FocusSession,
  type Habit,
  type HabitCompletion,
  type Interruption,
  type SessionMode,
  type SoundFeedback,
  type SoundPrefs,
  type SoundPreset,
  type SoundscapeId,
  type CycleEntry,
  type DailyReview,
  type ISODate,
  type MonthPlan,
  type Priority,
  type Quarter,
  type QuarterId,
  type QuarterSide,
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
  return {
    version: CLARO_SCHEMA_VERSION,
    quarters: {},
    weeks: {},
    days: {},
    focusSessions: {},
    activeFocusSessionId: null,
    interruptions: {},
    habits: {},
    habitCompletions: {},
    cycle: blankCycle(),
    sound: blankSound(),
    soundPresets: {},
    soundFeedback: {},
    monthPlans: {},
  };
}

export function blankCycle(): CycleState {
  return { settings: { enabled: false, optedInAt: null }, entries: {} };
}

export function blankSound(): SoundPrefs {
  // Brown is the gentlest default, and `endChime` is off because a sound the
  // user did not ask for is the one thing this feature must never do.
  return { volume: 0.4, muted: false, soundscape: "brown", mode: null, endChime: false };
}

export function blankQuarterSide(): QuarterSide {
  return { mainQuest: "", mainQuestWhy: "", mainQuestEnough: "", sideQuests: [] };
}

/**
 * The planning fields are additive, so `readQuarter` supplies them to every
 * quarter saved before they existed. That is why this needed no migration and
 * no version bump: nothing already on disk changes shape.
 */
export function blankQuarter(id: QuarterId): Quarter {
  return { id, work: blankQuarterSide(), life: blankQuarterSide(), plan: null };
}

export function blankWeek(id: WeekId): Week {
  return {
    id,
    work: { goal: "", actions: [] },
    life: { goal: "", actions: [] },
  };
}

export function blankPriority(): Priority {
  return { id: null, text: "", done: false, goal: null, createdAt: null, originDayId: null, carriedTo: null };
}

export function blankDay(id: ISODate): Day {
  return {
    id,
    priority1: blankPriority(),
    priority2: blankPriority(),
    priority3: blankPriority(),
    scheduleItems: [],
    actions: [],
    nonNegotiables: [],
    carriedForward: [],
    plan333: null,
    sleepHours: null,
    waterGlasses: 0,
    steps: null,
    mood: null,
    notes: "",
    review: null,
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


  // Additive fields need no version bump: a store saved before focus existed
  // simply arrives with these empty.
  const days = isRecord<Day>(candidate.days) ? candidate.days : {};

  return {
    version: CLARO_SCHEMA_VERSION,
    quarters: isRecord(candidate.quarters) ? candidate.quarters : {},
    weeks: isRecord(candidate.weeks) ? candidate.weeks : {},
    days: migrateDays(days, candidate.version),
    focusSessions: v3SessionsToV4(
      isRecord<FocusSession>(candidate.focusSessions) ? candidate.focusSessions : {},
      candidate.version,
    ),
    activeFocusSessionId:
      typeof candidate.activeFocusSessionId === "string"
        ? candidate.activeFocusSessionId
        : null,
    interruptions: isRecord<Interruption>(candidate.interruptions)
      ? candidate.interruptions
      : {},
    habits: isRecord<Habit>(candidate.habits) ? candidate.habits : {},
    habitCompletions: isRecord<HabitCompletion>(candidate.habitCompletions)
      ? candidate.habitCompletions
      : {},
    cycle: readCycle(candidate.cycle),
    sound: readSound(candidate.sound),
    soundPresets: isRecord<SoundPreset>(candidate.soundPresets) ? candidate.soundPresets : {},
    soundFeedback: isRecord<SoundFeedback>(candidate.soundFeedback)
      ? candidate.soundFeedback
      : {},
    // Additive: a store saved before monthly plans existed simply arrives empty.
    monthPlans: isRecord<MonthPlan>(candidate.monthPlans) ? candidate.monthPlans : {},
  };
}

export function blankMonthPlan(id: string, now: Date): MonthPlan {
  return {
    id,
    intention: "",
    mattersThisMonth: "",
    reflection: "",
    createdAt: now.toISOString(),
  };
}

export function blankReview(now: Date): DailyReview {
  return { proudOf: "", helped: "", mood: null, stress: null, updatedAt: now.toISOString() };
}

/** Applied in order, so a v1 store passes through every step to the current shape. */
function migrateDays(days: Record<string, Day>, version: number): Record<string, Day> {
  let migrated = days;
  if (version < 2) migrated = v1DaysToV2(migrated);
  if (version < 3) migrated = v2DaysToV3(migrated);
  if (version < 6) migrated = v5DaysToV6(migrated);
  return migrated;
}

/**
 * v6 gives a schedule entry a kind: a reference to work that exists elsewhere,
 * or a time block that stands alone.
 *
 * **Every existing entry becomes a standalone block.** Nothing is inferred from
 * matching text: two entries reading "Ship the store" may well be the same
 * work, but guessing would silently bind a user's schedule to a record they
 * never linked it to, and un-guessing it later is impossible. A block is the
 * honest reading of an entry that was only ever text, and the user can link it
 * deliberately from here on.
 *
 * Nothing is dropped, nothing is merged, and no entry changes its hour or its
 * words. Entries had no completion before v6, so `done` starts false without
 * discarding any history that existed.
 */
function v5DaysToV6(days: Record<string, Day>): Record<string, Day> {
  const migrated: Record<string, Day> = {};

  for (const [id, day] of Object.entries(days)) {
    const items = Array.isArray(day.scheduleItems) ? day.scheduleItems : [];
    migrated[id] = {
      ...day,
      scheduleItems: items.map((item) => ({
        ...item,
        // Spread first so an entry that somehow already carries a link keeps it.
        link: item.link ?? null,
        done: item.done ?? false,
      })),
    };
  }

  return migrated;
}

/**
 * v1 stored a priority's link as a bare domain (`"work" | "life" | null`).
 * v2 references any goal in the hierarchy, so an old link becomes that
 * domain's Main Quest. Nothing is dropped: a day with no link simply arrives
 * with `goal: null`.
 */
function v1DaysToV2(days: Record<string, Day>): Record<string, Day> {
  const migrated: Record<string, Day> = {};
  for (const [id, day] of Object.entries(days)) {
    migrated[id] = {
      ...day,
      priority1: v1PriorityToV2(day.priority1),
      priority2: v1PriorityToV2(day.priority2),
    };
  }
  return migrated;
}

function v1PriorityToV2(priority: unknown): Priority {
  const p = (priority ?? {}) as Partial<Priority> & { link?: unknown };
  const link = p.link;
  const goal =
    p.goal ??
    (link === "work"
      ? { category: "workMain" as const }
      : link === "life"
        ? { category: "lifeMain" as const }
        : null);
  return { ...blankPriority(), text: p.text ?? "", done: p.done ?? false, goal };
}

/**
 * v3 gives a day a third priority slot, gives every written priority a stable
 * id, and adds the carry-forward provenance fields. Read-through-blank cannot
 * do this on its own: `readDay` merges only the day's top level, so fields
 * nested inside `priority1`/`priority2` would stay missing forever.
 *
 * Existing work is treated as having originated on the day it sits on, and as
 * never yet carried — which is true, since nothing could carry before v3.
 * `createdAt` stays null rather than being invented; the origin day is the
 * honest answer to "when was this written".
 */
function v2DaysToV3(days: Record<string, Day>): Record<string, Day> {
  const migrated: Record<string, Day> = {};

  for (const [id, day] of Object.entries(days)) {
    const actions = Array.isArray(day.actions) ? day.actions : [];
    migrated[id] = {
      ...day,
      priority1: v2PriorityToV3(day.priority1, id),
      priority2: v2PriorityToV3(day.priority2, id),
      priority3: v2PriorityToV3((day as Partial<Day>).priority3, id),
      actions: actions.map((action) => ({
        originDayId: id,
        carriedTo: null,
        ...action,
      })),
      carriedForward: Array.isArray(day.carriedForward) ? day.carriedForward : [],
    };
  }

  return migrated;
}

function v2PriorityToV3(priority: unknown, dayId: ISODate): Priority {
  const p = (priority ?? {}) as Partial<Priority>;
  const text = p.text ?? "";
  const written = text.trim() !== "";

  return {
    ...blankPriority(),
    ...p,
    text,
    done: p.done ?? false,
    goal: p.goal ?? null,
    // Only real work gets an identity; a blank slot stays blank.
    id: p.id ?? (written ? newId() : null),
    originDayId: p.originDayId ?? (written ? dayId : null),
    carriedTo: p.carriedTo ?? null,
  };
}

/**
 * v4 lets a focus session target any level of the hierarchy, not only a day's
 * priority. Sessions recorded before that keep their meaning: an old
 * `priority` reference becomes a priority target, carrying the session's own
 * `intention` as the title so the record still reads honestly.
 */
function v3SessionsToV4(
  sessions: Record<string, FocusSession>,
  version: number,
): Record<string, FocusSession> {
  if (version >= 4) return sessions;

  const migrated: Record<string, FocusSession> = {};
  for (const [id, session] of Object.entries(sessions)) {
    migrated[id] = {
      ...session,
      target:
        session.target ??
        (session.priority
          ? {
              kind: "priority" as const,
              dayId: session.priority.dayId,
              rank: session.priority.rank,
              title: session.intention ?? "",
            }
          : null),
    };
  }
  return migrated;
}

function readCycle(raw: unknown): CycleState {
  const blank = blankCycle();
  if (!raw || typeof raw !== "object") return blank;
  const c = raw as Partial<CycleState>;
  return {
    settings: {
      enabled: c.settings?.enabled === true,
      optedInAt: typeof c.settings?.optedInAt === "string" ? c.settings.optedInAt : null,
    },
    entries: isRecord<CycleEntry>(c.entries) ? c.entries : {},
  };
}

/**
 * Read through the blank template, so a store saved before soundscapes existed
 * keeps its volume and mute and simply gains the new defaults.
 */
function readSound(raw: unknown): SoundPrefs {
  const blank = blankSound();
  if (!raw || typeof raw !== "object") return blank;

  const s = raw as Partial<SoundPrefs>;
  const volume =
    typeof s.volume === "number" && s.volume >= 0 && s.volume <= 1 ? s.volume : blank.volume;

  return {
    volume,
    muted: s.muted === true,
    soundscape: SOUNDSCAPES.includes(s.soundscape as SoundscapeId)
      ? (s.soundscape as SoundscapeId)
      : blank.soundscape,
    mode: SESSION_MODES.includes(s.mode as SessionMode) ? (s.mode as SessionMode) : null,
    // Anything other than an explicit true stays off.
    endChime: s.endChime === true,
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

/**
 * The one canonical live session, or null. Reading it anywhere else in the app
 * goes through here so no view can invent a second source of truth.
 */
export function readActiveFocusSession(state: ClaroState): FocusSession | null {
  const id = state.activeFocusSessionId;
  if (!id) return null;
  return state.focusSessions[id] ?? null;
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
