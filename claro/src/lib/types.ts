/** The Claro domain model. Everything here is plain data — no React, no dates library. */

export const CLARO_SCHEMA_VERSION = 8;

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
  /** Why this quest matters. Written during planning, read on Quarter. */
  mainQuestWhy: string;
  /** What "enough" looks like, in the user's own words. Never a metric. */
  mainQuestEnough: string;
  /** Optional evidence that progress is real. The user's own measure, if any. */
  mainQuestEvidence: string;
  sideQuests: SideQuest[]; // capped at MAX_SIDE_QUESTS
};

/**
 * The thinking behind a quarter, kept alongside the quarter it belongs to.
 *
 * The planning workspace writes straight into these records and into the
 * quests themselves. There is deliberately no draft copy: a second version of
 * a goal that has to be synchronised back is exactly how goals get duplicated
 * and reflections get lost.
 */
export type QuarterReflection = {
  proudOf: string;
  whatWorked: string;
  carryForward: string;
};

export type QuarterDirection = {
  mattersMost: string;
  meaningful: string;
  constraints: string;
};

/** What this quarter is for, before it becomes a list of goals. */
export type QuarterFoundation = {
  theme: string;
  outcome: string;
  whyItMatters: string;
  headline: string;
};

/** The conditions that make a quarter possible, rather than more things to do. */
export type QuarterSystems = {
  routines: string;
  habitsToSupport: string;
  simplify: string;
  stopDoing: string;
  weeklyRitual: string;
};

export type QuarterPeople = {
  support: string;
  mentor: string;
  empower: string;
  accountability: string;
};

/** Twelve weeks, each free to stay blank. A plan is never required to be full. */
export const PLAN_WEEKS = 12;

export type QuarterPlan = {
  startedAt: string;
  /** Set when the user marks the plan as settled. Editing it again is fine. */
  completedAt: string | null;
  reflection: QuarterReflection;
  direction: QuarterDirection;
  foundation: QuarterFoundation;
  /** Up to three, in the user's own words. Blank entries are normal. */
  clearestGoals: string[];
  systems: QuarterSystems;
  people: QuarterPeople;
  /** One intention per week, twelve entries, any of them blank. */
  focusWeeks: string[];
};

export type Quarter = {
  id: QuarterId;
  work: QuarterSide;
  life: QuarterSide;
  /** Null until the planning workspace is opened for this quarter. */
  plan: QuarterPlan | null;
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

/**
 * What a schedule entry points at, when it points at something.
 *
 * A priority is referenced by its own stable id rather than by its slot number,
 * because slots can be reordered and a rank would then silently address a
 * different piece of work.
 */
export type ScheduleLink =
  | { kind: "priority"; priorityId: string }
  | { kind: "action"; actionId: string }
  | { kind: "habit"; habitId: string };

/**
 * An hour on the day's grid. `time` is "HH:mm" on the 05:00 to 22:00 grid.
 *
 * There are exactly two kinds, and the difference matters:
 *
 * - **Linked** (`link` is set) is a reference to a priority, action or habit
 *   that already exists. Its title and its completion are read from that
 *   record, never stored here, so ticking it from the schedule updates the
 *   original everywhere and completing the original updates the schedule.
 * - **Standalone** (`link` is null) is a time block that exists only here.
 *   Its own `done` is the whole truth about it.
 *
 * `text` is authoritative for a standalone block. For a linked entry it is only
 * a snapshot taken at link time, kept so the row still reads something if the
 * original is later deleted or archived.
 */
export type ScheduleItem = {
  id: string;
  time: string;
  text: string;
  /** Null for a standalone time block. */
  link: ScheduleLink | null;
  /** Completion of a standalone block. Linked entries ignore this. */
  done: boolean;
  /**
   * The day a standalone block was carried into. Once set, the block is a
   * historical record rather than open work, so it cannot be active twice.
   */
  carriedTo?: ISODate | null;
};

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
  /** Set when the day was planned with the 3-3-3 framework. */
  plan333: Plan333 | null;
  sleepHours: number | null;
  waterGlasses: number;
  steps: number | null;
  mood: Mood | null;
  notes: string;
  /** The end-of-day reflection. Null until the user writes one. */
  review: DailyReview | null;
  /**
   * When the user closed the day. Closing is always their action: it is what
   * turns a list of unfinished things into decisions they have actually made.
   */
  closedAt: string | null;
};

/**
 * Mood as a face rather than a number. A scale of digits invites scoring;
 * these are just words for how the day felt, and none of them is a failure.
 */
export type MoodFace = "hard" | "low" | "steady" | "good" | "bright";

export const MOOD_FACES: MoodFace[] = ["hard", "low", "steady", "good", "bright"];

export const MOOD_FACE_META: Record<MoodFace, { emoji: string; label: string }> = {
  hard: { emoji: "😔", label: "Hard going" },
  low: { emoji: "😕", label: "A bit flat" },
  steady: { emoji: "😐", label: "Steady" },
  good: { emoji: "🙂", label: "Good" },
  bright: { emoji: "😄", label: "Bright" },
};

/** Labelled low to high, so the number is never the point. */
export type StressLevel = 1 | 2 | 3 | 4 | 5;

export const STRESS_LEVELS: StressLevel[] = [1, 2, 3, 4, 5];

export const STRESS_LABELS: Record<StressLevel, string> = {
  1: "Very low",
  2: "Low",
  3: "Moderate",
  4: "High",
  5: "Very high",
};

/**
 * A short end-of-day note. Optional in every part: a day with only a mood on it
 * is a perfectly good entry, and nothing counts or scores what is written here.
 */
export type DailyReview = {
  proudOf: string;
  /** One thing that could go better tomorrow. Never framed as a failure. */
  betterTomorrow: string;
  mood: MoodFace | null;
  stress: StressLevel | null;
  updatedAt: string;
};

/**
 * A calm monthly intention. Deliberately small: three pieces of writing, not a
 * second quarterly plan and not a task list.
 */
export type MonthPlan = {
  /** "2026-08". The month is the record's identity. */
  id: string;
  intention: string;
  mattersThisMonth: string;
  reflection: string;
  createdAt: string;
};

// ---------------------------------------------------------------- focus

/** The length a block starts at before anyone has chosen their own. */
export const FOCUS_BLOCK_MS = 25 * 60_000;
/** The "just begin" block — small enough that starting is never the hard part. */
export const JUST_BEGIN_BLOCK_MS = 5 * 60_000;
/** The on-ramp back after an interruption. */
export const RETURN_BLOCK_MS = 5 * 60_000;

/**
 * The block length the user last chose, so the next one starts at theirs.
 *
 * `breakMs` of 0 means no break, which is a real choice rather than a missing
 * value: plenty of people want a timer and nothing else.
 */
export type FocusPrefs = {
  plannedMs: number;
  breakMs: number;
  /** Which preset the pair came from, or "custom". Presentation only. */
  presetId: string;
};

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
  /** The block finished and the user chose to take a break before the next one. */
  | "break"
  /** The main block finished; waiting for the user to choose what happens next. */
  | "ended"
  /** The user resolved it. Kept for the record; never resumed. */
  | "closed";

/** Priorities are fixed slots on a day, so `(dayId, rank)` is their stable key. */
export type PriorityRef = { dayId: ISODate; rank: PriorityRank };

/**
 * What a focus session is for. A session can be started from any level of the
 * hierarchy, so the target names the level as well as the record — and carries
 * a snapshot of the title, so the log still reads honestly after the goal is
 * edited or deleted.
 */
export type FocusTargetRef =
  | { kind: "priority"; dayId: ISODate; rank: PriorityRank; title: string }
  | { kind: "weekAction"; weekId: WeekId; domain: Domain; actionId: string; title: string }
  | { kind: "weekGoal"; weekId: WeekId; domain: Domain; title: string }
  | { kind: "mainQuest"; quarterId: QuarterId; domain: Domain; title: string }
  | { kind: "sideQuest"; quarterId: QuarterId; domain: Domain; questId: string; title: string }
  /** Started from the header with nothing selected. */
  | { kind: "open"; title: string };

export const focusTargetTitle = (target: FocusTargetRef | null): string =>
  target?.title.trim() ?? "";

export type FocusSession = {
  id: string;
  /** The local day the session was started on. */
  dayId: ISODate;
  /**
   * Kept for the records written before focus could target anything but a
   * priority. `target` is the field to read; this one is never written now.
   */
  priority: PriorityRef | null;
  /** What the session is for, at any level of the hierarchy. */
  target: FocusTargetRef | null;
  /** A snapshot of the priority text, so the record still reads honestly later. */
  intention: string;
  plannedMs: number;
  /** The break this block is followed by, if any. 0 means the user wanted none. */
  breakMs: number;
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
  /** When the break the user is taking is due to finish. */
  breakEndsAt: string | null;
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
  /** Explicit position. Absent on habits created before reordering existed. */
  order?: number;
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
/**
 * `cycleLength` is the length the user *told* Claro, in days.
 *
 * It exists so somebody who has logged one period does not have to wait three
 * cycles before the calendar shows them anything. It is their own figure, not a
 * population default, and it is always labelled as the number they entered. The
 * moment there is enough logged history, the median of their real gaps takes
 * over: a remembered figure is a starting point, not a better answer than the
 * dates themselves.
 */
export type CycleSettings = {
  enabled: boolean;
  optedInAt: string | null;
  cycleLength: number | null;
};

export const MIN_STATED_CYCLE_DAYS = 15;
export const MAX_STATED_CYCLE_DAYS = 60;

/**
 * One recorded period, as a date range.
 *
 * `endDate` is null while the period is **ongoing** — started, but not yet
 * ended. That is a real state a person is in, not missing data, so it is
 * modelled rather than guessed at: nothing extends an ongoing period past
 * today, and its length is only ever reported as what has been confirmed so
 * far.
 *
 * Cycle length is measured start-to-start and never from this range. The two
 * numbers answer different questions and must not be mixed up.
 */
export type CycleEntry = {
  id: string;
  startDate: ISODate;
  /** Null means ongoing. */
  endDate: ISODate | null;
  loggedAt: string;
};

/** Named low to high. A reading, never a rating. */
export type EnergyLevel = 1 | 2 | 3 | 4 | 5;

export const ENERGY_LEVELS: EnergyLevel[] = [1, 2, 3, 4, 5];

export const ENERGY_LABELS: Record<EnergyLevel, string> = {
  1: "Very low",
  2: "Low",
  3: "Middling",
  4: "Good",
  5: "High",
};

/**
 * An optional private note about a day, kept inside the cycle record rather
 * than on the day itself.
 *
 * It lives here deliberately: cycle information must stay separate from
 * planning data, and "delete all cycle data" has to be able to remove every
 * trace of it without touching the day's own reflection.
 */
/**
 * A word for how the day felt, in the user's own vocabulary.
 *
 * These are things a person says about themselves, which is the only reason
 * they are safe: Claro never asserts any of them, never predicts one, and never
 * changes anything because one was chosen.
 *
 * A separate field from `mood` rather than a replacement for it. The two are
 * different vocabularies, and overwriting the old one would throw away entries
 * people already wrote.
 */
/**
 * How heavy a day was, in the user's own words.
 *
 * Recorded and read back, never interpreted. Claro does not say that a heavy
 * day is too heavy or a light one too light, and nothing in the app changes
 * because of what is chosen here.
 */
export type Flow = "spotting" | "light" | "medium" | "heavy";

export const FLOWS: Flow[] = ["spotting", "light", "medium", "heavy"];

export const FLOW_META: Record<Flow, { label: string; marks: number }> = {
  spotting: { label: "Spotting", marks: 1 },
  light: { label: "Light", marks: 2 },
  medium: { label: "Medium", marks: 3 },
  heavy: { label: "Heavy", marks: 4 },
};

export type Feeling =
  | "focused"
  | "scattered"
  | "calm"
  | "anxious"
  | "motivated"
  | "exhausted";

export const FEELINGS: Feeling[] = [
  "focused",
  "scattered",
  "calm",
  "anxious",
  "motivated",
  "exhausted",
];

export const FEELING_META: Record<Feeling, { emoji: string; label: string }> = {
  focused: { emoji: "\u{1F3AF}", label: "Focused" },
  scattered: { emoji: "\u{1F4AD}", label: "Scattered" },
  calm: { emoji: "\u{1F33F}", label: "Calm" },
  anxious: { emoji: "\u26A1", label: "Anxious" },
  motivated: { emoji: "\u{1F525}", label: "Motivated" },
  exhausted: { emoji: "\u{1FAAB}", label: "Exhausted" },
};

/** Whether the morning's reading held up, answered by the person who wrote it. */
export type EveningMatch = "yes" | "roughly" | "no";

export const EVENING_MATCHES: EveningMatch[] = ["yes", "roughly", "no"];

export const EVENING_LABELS: Record<EveningMatch, string> = {
  yes: "Yes, pretty much",
  roughly: "Roughly",
  no: "Not at all",
};

export type EveningNote = {
  match: EveningMatch;
  /** Free text. Never parsed. */
  note: string;
  /** One character the user picked for the day. Decoration, never data. */
  emoji: string;
  updatedAt: string;
};

export type CycleCheckIn = {
  dayId: ISODate;
  energy: EnergyLevel | null;
  mood: MoodFace | null;
  stress: StressLevel | null;
  /** Additive: a word for the day, alongside the older mood face. */
  feeling: Feeling | null;
  /** How heavy the day was, on a day the user was bleeding. */
  flow: Flow | null;
  /** The user's own words. Never parsed, searched or interpreted. */
  note: string;
  /** Filled in at the end of the day, if the user wants to. */
  evening: EveningNote | null;
  /**
   * Additive: what the user actually noticed, in their own words.
   *
   * Deliberately separate from `note`. That one answers the app's questions;
   * this one answers nothing, and exists so somebody whose experience does not
   * match the general guidance has somewhere to say so. Never parsed.
   */
  noticed: string;
  /**
   * Additive: the journal prompt's answer, in the user's own words.
   *
   * A third writing field rather than a reuse of `noticed`, because the two
   * are asked by different things and answering one must not overwrite the
   * other: `noticed` is where somebody says the guidance does not fit them,
   * and this is where they answer the question the journal card asked. Never
   * parsed, never read by anything but the card that wrote it.
   */
  journal: string;
  updatedAt: string;
};

// ------------------------------------------------- does the guidance fit you

/** The cards that carry a suggestion, and therefore ask whether it landed. */
/*
 * These four strings are **persisted** inside `guidanceMatches`, so they are
 * storage keys and not labels. `eat`, `move` and `do` now read as Food,
 * Movement and Work Focus on screen; renaming the keys to match would orphan
 * every answer already saved under the old ones, which is exactly the trade
 * the project's renaming rule exists to refuse. `journal` is genuinely new.
 */
export const GUIDANCE_CARDS = ["phase", "eat", "move", "do", "journal"] as const;
export type GuidanceCard = (typeof GUIDANCE_CARDS)[number];

/**
 * What the reader said about a card.
 *
 * "Opposite" is a real and separate answer rather than a stronger "no": being
 * told energy is building on a day it is draining is a different experience
 * from the guidance simply missing, and collapsing the two would lose that.
 */
export const MATCH_ANSWERS = ["yes", "notReally", "opposite"] as const;
export type MatchAnswer = (typeof MATCH_ANSWERS)[number];

export const MATCH_ANSWER_LABELS: Record<MatchAnswer, string> = {
  yes: "Yes",
  notReally: "Not really",
  opposite: "Opposite",
};

/**
 * One reader's answer about one card on one day.
 *
 * Kept so a card that keeps missing can stop asserting and start asking. It is
 * never read as a score, a trend or a fact about a body, and nothing outside
 * the card that was answered ever changes because of it.
 */
export type GuidanceMatch = {
  id: string;
  card: GuidanceCard;
  /** The phase the card was showing when it was answered. */
  phase: string;
  dayId: ISODate;
  answer: MatchAnswer;
  answeredAt: string;
};

/**
 * What the user was last shown, so a change in their own estimate can be
 * reported once rather than appearing silently.
 *
 * Every number here is arithmetic on dates they typed. Nothing is learned about
 * a body, and noticing a change never alters a plan.
 */
export type EstimateSnapshot = {
  typicalGap: number | null;
  basedOn: number;
  durationMin: number | null;
  durationMax: number | null;
  /** How many descriptive observations their notes supported. */
  observations: number;
  seenAt: string;
};

export type CycleState = {
  settings: CycleSettings;
  entries: Record<string, CycleEntry>;
  /** Keyed by day id, so a day has at most one private note. */
  checkIns: Record<string, CycleCheckIn>;
  /** Null until the user has been shown an estimate at all. */
  lastSeen: EstimateSnapshot | null;
  /**
   * Additive: keyed `card:dayId`, so answering again on the same day corrects
   * the earlier answer rather than stacking a second one beside it.
   */
  guidanceMatches: Record<string, GuidanceMatch>;
  /**
   * Additive: the guide's reflective prompts, keyed by prompt id.
   *
   * Not on a `CycleCheckIn`, because these are not about a day. "What did you
   * notice last time around?" is answered once and revisited, not logged every
   * morning, and putting it on a day would either scatter one answer across
   * many days or silently pick one to be the real one. Never parsed, never
   * read back by anything except the prompt that wrote it.
   */
  guideAnswers: Record<string, string>;
};

// -------------------------------------------------------------- 3-3-3 plan

/**
 * The 3-3-3 Method is an existing, widely used planning framework (popularised
 * by Oliver Burkeman): one meaningful project for a stretch of focused work,
 * three shorter tasks, three maintenance activities. Claro did not invent it
 * and does not claim to.
 *
 * The record is only a marker that the day was planned this way, plus the hours
 * the user intended. The work itself lives in the day's existing priorities and
 * action buckets, so nothing is duplicated and nothing is enforced.
 */
export type Plan333 = {
  startedAt: string;
  /** Intended hours on the meaningful project. Adaptable, never enforced. */
  focusHours: number;
};

export const PLAN_333_DEFAULT_HOURS = 3;

// ------------------------------------------------------------------ sound

/**
 * Every soundscape is generated in the browser from noise and oscillators.
 * There is no audio file, no stream and nothing licensed.
 *
 * Real jazz, lo-fi or instrumental music is deliberately absent: it would need
 * original or properly licensed recordings, which is a separate decision with
 * its own costs and obligations. Generated audio is never described as either.
 */
export type SoundscapeId = "white" | "pink" | "brown" | "rain" | "pad";

export const SOUNDSCAPES: SoundscapeId[] = ["white", "pink", "brown", "rain", "pad"];

/**
 * A label the user picks for how they intend to work. It is a preference and a
 * name, nothing more: a mode does not change brainwaves, cognition, stress,
 * hormones or output, and Claro must never suggest that it does.
 */
export type SessionMode = "deep" | "light" | "creative" | "reset";

export const SESSION_MODES: SessionMode[] = ["deep", "light", "creative", "reset"];

/** Remembered between sessions, but playback is always user-started. */
export type SoundPrefs = {
  volume: number;
  muted: boolean;
  soundscape: SoundscapeId;
  /** Null until the user picks one for this session. */
  mode: SessionMode | null;
  /** A short chime when a block finishes. Off unless the user turns it on. */
  endChime: boolean;
};

/**
 * A saved combination the user named themselves. Private, local, and applied
 * only when they choose it: nothing switches presets automatically from a
 * project, a task, an energy reading, a calendar or cycle data.
 */
export type SoundPreset = {
  id: string;
  name: string;
  mode: SessionMode;
  soundscape: SoundscapeId;
  volume: number;
  /** Optional block length in minutes. Null means "leave the timer alone". */
  focusMinutes: number | null;
  createdAt: string;
};

export type SoundFeedbackResponse = "helpful" | "notForMe" | "skipped";

/**
 * One private answer to "did this sound support your focus?", kept so the
 * question can be looked at later. Nothing reads it back yet: there are no
 * recommendations, no insights and no scoring built on it.
 */
export type SoundFeedback = {
  id: string;
  focusSessionId: string;
  response: SoundFeedbackResponse;
  soundscape: SoundscapeId;
  mode: SessionMode | null;
  at: string;
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
  /** The block length carried between sessions, so nobody re-picks it every time. */
  focusPrefs: FocusPrefs;
  habits: Record<string, Habit>;
  habitCompletions: Record<string, HabitCompletion>;
  cycle: CycleState;
  sound: SoundPrefs;
  soundPresets: Record<string, SoundPreset>;
  soundFeedback: Record<string, SoundFeedback>;
  /** Keyed by month id, so a month's intention has one canonical record. */
  monthPlans: Record<string, MonthPlan>;
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

/**
 * Names only. Each description says what the user might be doing, never what
 * the sound or the mode will do to them.
 */
export const SESSION_MODE_META: Record<
  SessionMode,
  { label: string; hint: string }
> = {
  deep: { label: "Deep focus", hint: "One thing, for a long stretch" },
  light: { label: "Light and admin", hint: "Small jobs, email, tidying up" },
  creative: { label: "Creative flow", hint: "Drafting, sketching, thinking aloud" },
  reset: { label: "Reset", hint: "A pause between things" },
};

/**
 * A starting order for each intention.
 *
 * This groups the picker so the list is easier to read. It is presentation
 * only: every soundscape stays reachable under every mode, and Claro never
 * selects one on the user's behalf. Nothing here claims an effect on anyone.
 */
export const SOUNDSCAPES_BY_MODE: Record<SessionMode, SoundscapeId[]> = {
  deep: ["brown", "pink", "rain", "white", "pad"],
  light: ["white", "pink", "rain", "brown", "pad"],
  creative: ["pad", "rain", "pink", "brown", "white"],
  reset: ["rain", "pad", "brown", "pink", "white"],
};

export const SOUNDSCAPE_META: Record<
  SoundscapeId,
  { label: string; hint: string }
> = {
  white: { label: "White noise", hint: "Even and bright" },
  pink: { label: "Pink noise", hint: "Softer than white" },
  brown: { label: "Brown noise", hint: "Deep and low" },
  rain: { label: "Gentle rain", hint: "Steady, with movement" },
  pad: { label: "Soft ambient pad", hint: "Slow, warm tones" },
};

export const MOOD_LABELS: Record<Mood, string> = {
  1: "Depleted",
  2: "Low",
  3: "Steady",
  4: "Good",
  5: "Energised",
};
