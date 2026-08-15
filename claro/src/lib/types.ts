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

// ------------------------------------------------------------------ store

export type ClaroState = {
  version: number;
  quarters: Record<QuarterId, Quarter>;
  weeks: Record<WeekId, Week>;
  days: Record<ISODate, Day>;
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
