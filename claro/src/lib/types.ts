/** The Claro domain model. Everything here is plain data — no React, no dates library. */

export const CLARO_SCHEMA_VERSION = 3;

export const MAX_SIDE_QUESTS = 3;
export const MAX_WEEK_ACTIONS = 3;
export const MAX_NON_NEGOTIABLES = 3;
/** One day, three clear priorities. Three is the limit — that's the point. */
export const MAX_PRIORITIES = 3;

/** "2026-08-15" */
export type ISODate = string;
/** "2026-W33" — ISO week */
export type WeekId = string;
/** "2026-Q3" */
export type QuarterId = string;

/** The two halves of a life. Every level of the hierarchy is split this way. */
export type Domain = "work" | "life";
export const DOMAINS: Domain[] = ["work", "life"];

// ---------------------------------------------------------------- quarter

export type SideQuest = { id: string; text: string; done: boolean };

export type QuarterSide = {
  mainQuest: string;
  sideQuests: SideQuest[]; // capped at MAX_SIDE_QUESTS
};

export type Quarter = {
  id: QuarterId;
  work: QuarterSide;
  life: QuarterSide;
};

// ------------------------------------------------------------------- week

export type WeekAction = { id: string; text: string; done: boolean };

export type WeekSide = {
  goal: string;
  actions: WeekAction[]; // capped at MAX_WEEK_ACTIONS
};

export type Week = {
  id: WeekId;
  work: WeekSide;
  life: WeekSide;
};

// -------------------------------------------------------------------- day

// ------------------------------------------------------- goal categories

/**
 * The one goal vocabulary, shared by Today, Week, Quarter, Focus and the
 * calendar. Colour is only ever a supporting cue — every category also carries
 * a readable label, so it survives greyscale and screen readers.
 */
export type GoalCategory = "workMain" | "lifeMain" | "workSide" | "lifeSide";

export const GOAL_CATEGORIES: GoalCategory[] = [
  "workMain",
  "lifeMain",
  "workSide",
  "lifeSide",
];

export const GOAL_CATEGORY_META: Record<
  GoalCategory,
  { label: string; short: string; domain: Domain; tier: "main" | "side" }
> = {
  workMain: { label: "Work Main Quest", short: "Work Main", domain: "work", tier: "main" },
  lifeMain: { label: "Life Main Quest", short: "Life Main", domain: "life", tier: "main" },
  workSide: { label: "Work Side Quest", short: "Work Side", domain: "work", tier: "side" },
  lifeSide: { label: "Life Side Quest", short: "Life Side", domain: "life", tier: "side" },
};

/** A reference to one goal. Side quests also carry the specific quest's id. */
export type GoalRef = { category: GoalCategory; sideQuestId?: string };

/**
 * The three fixed slots on a day. `rank` is a slot number, not an ordering
 * preference — priority 1 simply dominates the page.
 */
export type PriorityRank = 1 | 2 | 3;
export const PRIORITY_RANKS: PriorityRank[] = [1, 2, 3];

export type PriorityKey = "priority1" | "priority2" | "priority3";
export const PRIORITY_KEYS: PriorityKey[] = ["priority1", "priority2", "priority3"];

export const priorityKey = (rank: PriorityRank): PriorityKey =>
  `priority${rank}` as PriorityKey;

/**
 * A priority may optionally hang off any one goal in the hierarchy.
 *
 * `id` is assigned the first time the slot is written, and travels with the
 * work when it is carried forward — which is precisely what makes carrying it
 * twice impossible. Two days can therefore hold the same id: that is the model
 * saying "this is the same piece of work, moved", not a duplicate row.
 */
export type Priority = {
  /** Null while the slot is still blank. */
  id: string | null;
  text: string;
  done: boolean;
  goal: GoalRef | null;
  /** When it was first written. */
  createdAt: string | null;
  /** The day it was first written on — preserved across every carry-forward. */
  originDayId: ISODate | null;
  /** The day it was carried into. Set once, so it can never be carried again. */
  carriedTo: ISODate | null;
};

/** A slot is free only when nothing has been written in it. */
export const isPrioritySet = (priority: Priority): boolean => priority.text.trim() !== "";

/** time is "HH:mm" on the 05:00–22:00 grid. */
export type ScheduleItem = { id: string; time: string; text: string };

/**
 * Effort buckets. One list holds all three so that recategorising an item
 * is a single field change rather than a cross-list move.
 */
export type Bucket = "quickTick" | "task" | "project";
export const BUCKETS: Bucket[] = ["quickTick", "task", "project"];

export type ActionItem = {
  id: string;
  text: string;
  bucket: Bucket;
  done: boolean;
  createdAt: string;
  /** The day it was first written on. Absent means "the day it sits on". */
  originDayId?: ISODate | null;
  /** The day it was carried into. Set once, so it can never be carried again. */
  carriedTo?: ISODate | null;
};

export type NonNegotiable = { id: string; text: string; done: boolean };

export type Mood = 1 | 2 | 3 | 4 | 5;

/**
 * Work that arrived from an earlier day and has not been placed yet. It waits
 * in a visible review area rather than overwriting anything the user has
 * already written, and it keeps its own history so "carried forward from
 * Monday" stays true however many days it travels.
 */
export type CarriedItem = {
  /** The source item's own id, so the same work can never land twice. */
  id: string;
  text: string;
  goal: GoalRef | null;
  origin: "priority" | "action";
  /** The bucket it had, when it came from an action. */
  bucket: Bucket | null;
  /** The day it was first written on. */
  originDayId: ISODate;
  /** The original creation timestamp, preserved across every carry. */
  createdAt: string | null;
};

export type Day = {
  id: ISODate;
  priority1: Priority;
  priority2: Priority;
  priority3: Priority;
  scheduleItems: ScheduleItem[];
  actions: ActionItem[];
  nonNegotiables: NonNegotiable[]; // capped at MAX_NON_NEGOTIABLES
  /** Awaiting an explicit decision — never silently merged into the day. */
  carriedForward: CarriedItem[];
  sleepHours: number | null;
  waterGlasses: number;
  steps: number | null;
  mood: Mood | null;
  notes: string;
};

// ---------------------------------------------------------------- focus

export const FOCUS_BLOCK_MS = 25 * 60_000;
/** The "just begin" block — small enough that starting is never the hard part. */
export const JUST_BEGIN_BLOCK_MS = 5 * 60_000;
/** The on-ramp back after an interruption. */
export const RETURN_BLOCK_MS = 5 * 60_000;

/**
 * A focus session's phase. There is only ever one live session (see
 * `ClaroState.activeFocusSessionId`), so these are the states of the whole
 * feature, not of some component.
 */
export type FocusPhase =
  /** The main block is counting down. */
  | "running"
  /** Deliberately stopped by the user. Nothing is counting and nothing is logged. */
  | "paused"
  /** An interruption is open and nothing is counting. */
  | "interrupted"
  /** The five-minute return block is counting down. */
  | "returning"
  /** The main block finished; waiting for the user to choose what happens next. */
  | "ended"
  /** The user resolved it. Kept for the record; never resumed. */
  | "closed";

/** Priorities are fixed slots on a day, so `(dayId, rank)` is their stable key. */
export type PriorityRef = { dayId: ISODate; rank: PriorityRank };

export type FocusSession = {
  id: string;
  /** The local day the session was started on. */
  dayId: ISODate;
  /** What the session is for. Null when no priority was set at the time. */
  priority: PriorityRef | null;
  /** A snapshot of the priority text, so the record still reads honestly later. */
  intention: string;
  plannedMs: number;
  startedAt: string;
  /** IANA zone, captured at start so a later reader knows the local context. */
  timeZone: string;
  phase: FocusPhase;
  /** Main-block time already spent before the current counting segment. */
  elapsedBeforeMs: number;
  /** When the current counting segment began. Null whenever nothing is counting. */
  segmentStartedAt: string | null;
  /** When the active return block is due to finish. */
  returnBlockEndsAt: string | null;
  /** When the main block ran out. */
  endedAt: string | null;
  /** How the user resolved the session. */
  outcome: FocusOutcome | null;
};

export type FocusOutcome = "completed" | "continued" | "left";

export type InterruptionReason =
  | "phone"
  | "notification"
  | "person"
  | "uncertainty"
  | "fatigue"
  | "other";

export const INTERRUPTION_REASONS: InterruptionReason[] = [
  "phone",
  "notification",
  "person",
  "uncertainty",
  "fatigue",
  "other",
];

export const INTERRUPTION_REASON_LABELS: Record<InterruptionReason, string> = {
  phone: "Phone",
  notification: "A notification",
  person: "Someone needed me",
  uncertainty: "I wasn't sure what to do next",
  fatigue: "Running out of steam",
  other: "Something else",
};

/**
 * A private record of one interruption. Never surfaced as a count, a streak or a
 * dashboard — it exists so the pattern can be understood later, not to be scored.
 */
export type Interruption = {
  id: string;
  focusSessionId: string;
  /** Local day, so a future adapter can group without re-deriving from UTC. */
  dayId: ISODate;
  occurredAt: string;
  timeZone: string;
  reason: InterruptionReason | null;
  returnBlockStarted: boolean;
  /** When focused work actually resumed. Null if the user never came back. */
  returnedAt: string | null;
};

// ----------------------------------------------------------------- habits

/**
 * A personal practice, not a productivity task. Consistency is reported
 * gently — counts, never streaks, never anything that can be "lost".
 */
export type Habit = {
  id: string;
  name: string;
  createdAt: string;
  /** Archived habits keep their history but leave the weekly view. */
  archivedAt: string | null;
};

/** Keyed `${habitId}:${dayId}` — one completion per habit per day. */
export type HabitCompletion = {
  id: string;
  habitId: string;
  dayId: ISODate;
  completedAt: string;
};

export const habitCompletionId = (habitId: string, dayId: ISODate) => `${habitId}:${dayId}`;

// ------------------------------------------------------------------ cycle

/**
 * Optional, private, and deliberately kept apart from planning and focus
 * records. Estimates come only from the user's own logged history.
 */
export type CycleSettings = { enabled: boolean; optedInAt: string | null };

export type CycleEntry = { id: string; startDate: ISODate; loggedAt: string };

export type CycleState = {
  settings: CycleSettings;
  entries: Record<string, CycleEntry>;
};

// ------------------------------------------------------------------ sound

/** Remembered between sessions — but playback is always user-started. */
export type SoundPrefs = { volume: number; muted: boolean };

// ------------------------------------------------------------------ store

export type ClaroState = {
  version: number;
  quarters: Record<QuarterId, Quarter>;
  weeks: Record<WeekId, Week>;
  days: Record<ISODate, Day>;
  focusSessions: Record<string, FocusSession>;
  /** The one canonical live session. There is nowhere for a second to exist. */
  activeFocusSessionId: string | null;
  interruptions: Record<string, Interruption>;
  habits: Record<string, Habit>;
  habitCompletions: Record<string, HabitCompletion>;
  cycle: CycleState;
  sound: SoundPrefs;
};

// ------------------------------------------------------------ presentation

export const BUCKET_META: Record<
  Bucket,
  { label: string; hint: string; short: string; column: string }
> = {
  quickTick: { label: "Quick Ticks", hint: "Under 5 minutes", short: "Quick", column: "Quick Ticks" },
  task: { label: "Tasks", hint: "5 – 30 minutes", short: "Task", column: "Tasks" },
  project: {
    label: "Projects & Focus Blocks",
    hint: "30 minutes +",
    short: "Project",
    // The full label does not survive a quarter-page column.
    column: "Projects",
  },
};

export const DOMAIN_META: Record<Domain, { label: string }> = {
  work: { label: "Work" },
  life: { label: "Life" },
};

export const MOOD_LABELS: Record<Mood, string> = {
  1: "Depleted",
  2: "Low",
  3: "Steady",
  4: "Good",
  5: "Energised",
};
