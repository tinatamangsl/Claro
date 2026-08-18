/** The Claro domain model. Everything here is plain data — no React, no dates library. */

export const CLARO_SCHEMA_VERSION = 1;

export const MAX_SIDE_QUESTS = 3;
export const MAX_WEEK_ACTIONS = 3;
export const MAX_NON_NEGOTIABLES = 3;

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

/** A priority may optionally hang off this week's work or life goal. */
export type Priority = { text: string; done: boolean; link: Domain | null };

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
};

export type NonNegotiable = { id: string; text: string; done: boolean };

export type Mood = 1 | 2 | 3 | 4 | 5;

export type Day = {
  id: ISODate;
  priority1: Priority;
  priority2: Priority;
  scheduleItems: ScheduleItem[];
  actions: ActionItem[];
  nonNegotiables: NonNegotiable[]; // capped at MAX_NON_NEGOTIABLES
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
export type PriorityRef = { dayId: ISODate; rank: 1 | 2 };

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
};

// ------------------------------------------------------------ presentation

export const BUCKET_META: Record<
  Bucket,
  { label: string; hint: string; short: string }
> = {
  quickTick: { label: "Quick Ticks", hint: "Under 5 minutes", short: "Quick" },
  task: { label: "Tasks", hint: "5 – 30 minutes", short: "Task" },
  project: { label: "Projects & Focus Blocks", hint: "30 minutes +", short: "Project" },
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
