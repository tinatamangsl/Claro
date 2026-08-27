import { newId } from "./id";
import { DEFAULT_FOCUS_PREFS, readFocusPrefs } from "./focus-presets";
import { blankPlan } from "./quarter-plan";
import {
  CLARO_SCHEMA_VERSION,
  PLAN_WEEKS,
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
  type CycleCheckIn,
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
    focusPrefs: DEFAULT_FOCUS_PREFS,
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
  return {
    settings: { enabled: false, optedInAt: null, cycleLength: null },
    entries: {},
    checkIns: {},
    lastSeen: null,
    guidanceMatches: {},
  };
}

/** A day's private note before anything has been written on it. */
export function blankCheckIn(dayId: ISODate, now: Date): CycleCheckIn {
  return {
    dayId,
    energy: null,
    mood: null,
    stress: null,
    feeling: null,
    flow: null,
    note: "",
    evening: null,
    noticed: "",
    journal: "",
    updatedAt: now.toISOString(),
  };
}

export function blankSound(): SoundPrefs {
  // Brown is the gentlest default, and `endChime` is off because a sound the
  // user did not ask for is the one thing this feature must never do.
  return { volume: 0.4, muted: false, soundscape: "brown", mode: null, endChime: false };
}

export function blankQuarterSide(): QuarterSide {
  return {
    mainQuest: "",
    mainQuestWhy: "",
    mainQuestEnough: "",
    mainQuestEvidence: "",
    sideQuests: [],
  };
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
    closedAt: null,
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
    focusSessions: readSessions(
      v3SessionsToV4(
        isRecord<FocusSession>(candidate.focusSessions) ? candidate.focusSessions : {},
        candidate.version,
      ),
    ),
    activeFocusSessionId:
      typeof candidate.activeFocusSessionId === "string"
        ? candidate.activeFocusSessionId
        : null,
    interruptions: isRecord<Interruption>(candidate.interruptions)
      ? candidate.interruptions
      : {},
    // Additive: a store saved before block lengths were choosable arrives with
    // the default pair, which is the length it was always using anyway.
    focusPrefs: readFocusPrefs(candidate.focusPrefs),
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

/**
 * Fills in the session fields added after a record was written.
 *
 * A block saved before breaks existed simply had none: `breakMs` of 0 says
 * exactly that, and is the same thing the interface would have shown anyway.
 * Read-through rather than a versioned step, because nothing already on disk
 * changes meaning.
 */
function readSessions(sessions: Record<string, FocusSession>): Record<string, FocusSession> {
  const read: Record<string, FocusSession> = {};
  for (const [id, session] of Object.entries(sessions)) {
    read[id] = {
      ...session,
      breakMs: typeof session.breakMs === "number" ? session.breakMs : 0,
      breakEndsAt: typeof session.breakEndsAt === "string" ? session.breakEndsAt : null,
    };
  }
  return read;
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
  return {
    proudOf: "",
    betterTomorrow: "",
    mood: null,
    stress: null,
    updatedAt: now.toISOString(),
  };
}

/** Applied in order, so a v1 store passes through every step to the current shape. */
function migrateDays(days: Record<string, Day>, version: number): Record<string, Day> {
  let migrated = days;
  if (version < 2) migrated = v1DaysToV2(migrated);
  if (version < 3) migrated = v2DaysToV3(migrated);
  if (version < 6) migrated = v5DaysToV6(migrated);
  if (version < 7) migrated = v6DaysToV7(migrated);
  return migrated;
}

/**
 * v7 renames the review's second question. The old field held the same kind of
 * answer, so it is moved across rather than dropped: a reflection someone wrote
 * is not something to discard over a rename.
 */
function v6DaysToV7(days: Record<string, Day>): Record<string, Day> {
  const migrated: Record<string, Day> = {};

  for (const [id, day] of Object.entries(days)) {
    const review = day.review as (DailyReview & { helped?: string }) | null;
    migrated[id] = {
      ...day,
      closedAt: day.closedAt ?? null,
      review: review
        ? {
            proudOf: review.proudOf ?? "",
            betterTomorrow: review.betterTomorrow ?? review.helped ?? "",
            mood: review.mood ?? null,
            stress: review.stress ?? null,
            updatedAt: review.updatedAt ?? "",
          }
        : null,
    };
  }

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

/**
 * Reads logged periods through their current shape.
 *
 * A period saved before ranges existed has a start and no end. It arrives here
 * with `endDate: null`, which is the truth about it: the end was never
 * recorded. Nothing is invented to fill the gap — an end date is a fact about
 * someone's body, and Claro only ever holds the ones they typed in.
 */
function readCycleEntries(raw: unknown): Record<string, CycleEntry> {
  if (!isRecord<CycleEntry>(raw)) return {};

  const entries: Record<string, CycleEntry> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Partial<CycleEntry>;
    if (typeof entry.startDate !== "string") continue;
    entries[id] = {
      id: typeof entry.id === "string" ? entry.id : id,
      startDate: entry.startDate,
      endDate: typeof entry.endDate === "string" ? entry.endDate : null,
      loggedAt: typeof entry.loggedAt === "string" ? entry.loggedAt : "",
    };
  }
  return entries;
}

/**
 * Fills in the note fields added after a record was written.
 *
 * A note saved before the word-for-the-day existed simply had none, and null
 * says exactly that. Nothing is inferred from the older `mood` face: the two
 * are different vocabularies, and translating between them would be Claro
 * putting words in somebody's mouth.
 */
function readCheckIns(raw: unknown): Record<string, CycleCheckIn> {
  if (!isRecord<CycleCheckIn>(raw)) return {};

  const notes: Record<string, CycleCheckIn> = {};
  for (const [dayId, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;
    const note = value as Partial<CycleCheckIn>;
    notes[dayId] = {
      dayId: typeof note.dayId === "string" ? note.dayId : dayId,
      energy: note.energy ?? null,
      mood: note.mood ?? null,
      stress: note.stress ?? null,
      feeling: note.feeling ?? null,
      flow: note.flow ?? null,
      note: typeof note.note === "string" ? note.note : "",
      evening: note.evening ?? null,
      noticed: typeof note.noticed === "string" ? note.noticed : "",
      journal: typeof note.journal === "string" ? note.journal : "",
      updatedAt: typeof note.updatedAt === "string" ? note.updatedAt : "",
    };
  }
  return notes;
}

function readCycle(raw: unknown): CycleState {
  const blank = blankCycle();
  if (!raw || typeof raw !== "object") return blank;
  const c = raw as Partial<CycleState>;
  return {
    settings: {
      enabled: c.settings?.enabled === true,
      optedInAt: typeof c.settings?.optedInAt === "string" ? c.settings.optedInAt : null,
      // Additive: a store saved before the length could be stated arrives null,
      // which is the truth about it.
      cycleLength:
        typeof c.settings?.cycleLength === "number" ? c.settings.cycleLength : null,
    },
    entries: readCycleEntries(c.entries),
    // Additive: a store saved before check-ins existed simply arrives empty.
    checkIns: readCheckIns(c.checkIns),
    lastSeen: c.lastSeen && typeof c.lastSeen === "object" ? c.lastSeen : null,
    // Additive: a store saved before the cards asked whether they fit arrives
    // with nothing said either way, which is the truth about it.
    guidanceMatches:
      c.guidanceMatches && typeof c.guidanceMatches === "object" ? c.guidanceMatches : {},
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
/**
 * The plan's own read-through. A plan saved before the Foundation, Systems,
 * People or focus-map sections existed gains them as blanks, which is why
 * growing the workspace needed no migration.
 */
function readPlan(stored: Quarter["plan"]): Quarter["plan"] {
  if (!stored) return null;
  const blank = blankPlan(new Date(stored.startedAt));
  return {
    ...blank,
    ...stored,
    reflection: { ...blank.reflection, ...stored.reflection },
    direction: { ...blank.direction, ...stored.direction },
    foundation: { ...blank.foundation, ...stored.foundation },
    systems: { ...blank.systems, ...stored.systems },
    people: { ...blank.people, ...stored.people },
    clearestGoals: normaliseList(stored.clearestGoals, 3),
    focusWeeks: normaliseList(stored.focusWeeks, PLAN_WEEKS),
  };
}

/** Pads or trims a list of strings to a fixed length, keeping what is there. */
function normaliseList(value: unknown, length: number): string[] {
  const list = Array.isArray(value) ? value : [];
  return Array.from({ length }, (_, i) => (typeof list[i] === "string" ? list[i] : ""));
}

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
    plan: readPlan(stored.plan),
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
