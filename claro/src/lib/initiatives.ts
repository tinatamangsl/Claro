/**
 * Initiatives: a named stretch of weeks with an identity behind it.
 *
 * **A thread sideways through the hierarchy, not a fourth level of it.**
 * Quarter, Week and Day still own planning. An initiative only says which of
 * the things already on those pages belong together and what they were for,
 * so deleting one leaves every action, block and habit exactly where it was.
 *
 * Everything here is pure and takes the state it reads, like the rest of
 * `lib`. Nothing in this file counts anything a person did not do, and nothing
 * returns a verdict: `promisesIn` reports kept beside due and stops, because a
 * number somebody set themselves is information and the same number with a
 * judgement attached is a scold.
 */

import { addDays, eachDayOfInterval, getISODay } from "date-fns";

import { formatDayId, parseDayId } from "./dates";
import { createHabit, intendedDaysIn, isDoneOn, weeklyIntent } from "./habits";
import { newId } from "./id";
import { addAction } from "./plan333";
import { blockItem } from "./schedule";
import { readDay } from "./storage";
import type {
  ActionItem,
  Bucket,
  ClaroState,
  Day,
  Habit,
  ISODate,
  Initiative,
  InitiativeReview,
  OutcomeSnapshot,
  ReviewKind,
  ScheduleItem,
  SleepQuality,
  Weekday,
} from "./types";

// ------------------------------------------------------------------ reading

export function coversDay(initiative: Initiative, dayId: ISODate): boolean {
  return dayId >= initiative.from && dayId <= initiative.to;
}

/**
 * The initiative a day falls inside, or null.
 *
 * First match wins rather than all of them, because every surface that asks
 * this has room for one banner. Two overlapping initiatives is a state the
 * data allows and the interface does not pretend to handle.
 */
export function initiativeOn(state: ClaroState, dayId: ISODate): Initiative | null {
  const all = Object.values(state.initiatives ?? {});
  return all.find((initiative) => coversDay(initiative, dayId)) ?? null;
}

/**
 * The initiative overlapping a stretch, or null.
 *
 * **Quarter asks this, not `initiativeOn`.** A quarter page is a view of a
 * quarter rather than of today: an initiative starting tomorrow belongs on the
 * quarter it runs in, and asking "does it cover today" made the whole thing
 * invisible on 30 September and again on 1 December. Overlap, not containment,
 * because a stretch may begin before the quarter and end inside it.
 */
export function initiativeBetween(
  state: ClaroState,
  from: ISODate,
  to: ISODate,
): Initiative | null {
  const all = Object.values(state.initiatives ?? {});
  return all.find((i) => i.from <= to && i.to >= from) ?? null;
}

export function labelledActions(day: Day, initiativeId: string): ActionItem[] {
  return day.actions.filter((a) => a.initiativeId === initiativeId && a.carriedTo == null);
}

export function labelledBlocks(day: Day, initiativeId: string): ScheduleItem[] {
  return day.scheduleItems.filter(
    (i) => i.initiativeId === initiativeId && i.carriedTo == null,
  );
}

/**
 * How many days in a range a habit was meant to happen.
 *
 * Pinned days can be counted exactly. A plain "three a week" only has an
 * honest denominator over whole weeks, so anything else returns null rather
 * than printing arithmetic nobody chose. `habits.ts` makes the same refusal
 * for the same reason.
 */
export function habitDue(habit: Habit, dayIds: ISODate[]): number | null {
  const pinned = intendedDaysIn(habit, dayIds);
  if (pinned !== null) return pinned;

  const intent = weeklyIntent(habit);
  if (!intent) return null;
  return dayIds.length % 7 === 0 ? intent.count * (dayIds.length / 7) : null;
}

/**
 * Promises kept over a stretch of days, beside how many were due.
 *
 * A promise is a labelled habit day or a labelled action. `due` is null the
 * moment any one part of it cannot be counted honestly, so the caller says
 * "9 kept" rather than inventing a denominator to put it over.
 *
 * `kept` is never capped at `due`. Running four times in a week you meant to
 * run three is not an error to be clipped back to three.
 */
export function promisesIn(
  state: ClaroState,
  initiative: Initiative,
  dayIds: ISODate[],
): { kept: number; due: number | null } {
  const inRange = dayIds.filter((id) => coversDay(initiative, id));

  let kept = 0;
  let due: number | null = 0;

  for (const habitId of initiative.habitIds) {
    const habit = state.habits[habitId];
    if (!habit || habit.archivedAt) continue;

    kept += inRange.filter((id) => isDoneOn(state.habitCompletions, habitId, id)).length;
    const owed = habitDue(habit, inRange);
    due = owed === null || due === null ? null : due + owed;
  }

  for (const dayId of inRange) {
    for (const action of labelledActions(readDay(state, dayId), initiative.id)) {
      if (action.done) kept += 1;
      if (due !== null) due += 1;
    }
  }

  return { kept, due };
}

/** Last night's sleep across a stretch, to one decimal, or null if never rated. */
export function averageSleep(state: ClaroState, dayIds: ISODate[]): number | null {
  const rated = dayIds
    .map((id) => readDay(state, id).sleepQuality)
    .filter((q): q is SleepQuality => q != null);

  if (rated.length === 0) return null;
  return Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10;
}

// ----------------------------------------------------------------- reviews

export function reviewOn(
  initiative: Initiative,
  dayId: ISODate,
  kind: ReviewKind,
): InitiativeReview | null {
  return (
    initiative.reviews.find((r) => r.dayId === dayId && r.kind === kind) ?? null
  );
}

/**
 * Writing a review answer.
 *
 * Merged into whatever is already there rather than replacing it, so
 * answering the third prompt does not wipe the first two, and an empty answer
 * is stored as empty rather than removed: somebody who clears a line meant to
 * clear it.
 */
export function answerReview(
  initiative: Initiative,
  dayId: ISODate,
  kind: ReviewKind,
  prompt: string,
  answer: string,
): Initiative {
  const existing = reviewOn(initiative, dayId, kind);
  const review: InitiativeReview = existing
    ? { ...existing, answers: { ...existing.answers, [prompt]: answer } }
    : { id: newId(), dayId, kind, answers: { [prompt]: answer } };

  return {
    ...initiative,
    reviews: existing
      ? initiative.reviews.map((r) => (r.id === existing.id ? review : r))
      : [...initiative.reviews, review],
  };
}

// ---------------------------------------------------------------- outcomes

export function outcomeOn(initiative: Initiative, dayId: ISODate): OutcomeSnapshot | null {
  return initiative.outcomes.find((o) => o.dayId === dayId) ?? null;
}

export function logOutcome(
  initiative: Initiative,
  dayId: ISODate,
  valueId: string,
  value: number | null,
): Initiative {
  return {
    ...initiative,
    outcomes: initiative.outcomes.map((snapshot) =>
      snapshot.dayId === dayId
        ? {
            ...snapshot,
            values: snapshot.values.map((v) => (v.id === valueId ? { ...v, value } : v)),
          }
        : snapshot,
    ),
  };
}

// -------------------------------------------------------------------- seed

/** A habit the seed wants, matched against what is already there by name. */
export type HabitPlan = {
  /** Names to look for first, lower-cased. The first hit is reused. */
  match: string[];
  name: string;
  targetPerWeek: number | null;
  targetDays: Weekday[];
};

export type DayPlan = {
  dayId: ISODate;
  actions: { text: string; bucket: Bucket }[];
  blocks: { time: string; text: string }[];
};

export type InitiativeSeed = {
  name: string;
  identity: string;
  from: ISODate;
  to: ISODate;
  habits: HabitPlan[];
  days: DayPlan[];
  outcomes: { dayId: ISODate; labels: string[] }[];
};

const OUTCOME_LABELS = [
  "Instagram followers",
  "TikTok followers",
  "Brand conversations",
  "Substack drafts published",
];

/** Every date in a range that falls on one of the given ISO weekdays. */
function weekdaysBetween(from: ISODate, to: ISODate, days: Weekday[]): ISODate[] {
  return eachDayOfInterval({ start: parseDayId(from), end: parseDayId(to) })
    .filter((date) => days.includes(getISODay(date) as Weekday))
    .map(formatDayId);
}

/** Every other one of them, starting from the first. */
function fortnightly(dates: ISODate[]): ISODate[] {
  return dates.filter((_, index) => index % 2 === 0);
}

/**
 * Self Love Lock In: 1 October to 30 November 2026.
 *
 * Written as data rather than as a migration, because it is one person's
 * two months and not a change to what Claro is. Applying it creates ordinary
 * actions, blocks and habits on their real dates; every one of them can then
 * be edited or deleted like anything else, and nothing here runs twice.
 */
export function selfLoveLockIn(): InitiativeSeed {
  const from: ISODate = "2026-10-01";
  const to: ISODate = "2026-11-30";

  const mondays = weekdaysBetween(from, to, [1]);
  const fridays = weekdaysBetween(from, to, [5]);
  const saturdays = weekdaysBetween(from, to, [6]);
  const sundays = weekdaysBetween(from, to, [7]);
  const substack = fortnightly(saturdays);

  const byDay = new Map<ISODate, DayPlan>();
  const on = (dayId: ISODate): DayPlan => {
    const existing = byDay.get(dayId);
    if (existing) return existing;
    const plan: DayPlan = { dayId, actions: [], blocks: [] };
    byDay.set(dayId, plan);
    return plan;
  };

  /*
   * Run club is the only thing given a time, because "Monday evening" is a
   * time and the rest are not. Everything else waits in Actions until it is
   * dragged onto an hour, which is the user's own rule for this.
   */
  for (const dayId of mondays) on(dayId).blocks.push({ time: "18:00", text: "Run club" });

  for (const dayId of fridays) {
    on(dayId).actions.push({
      text: "Content day: shoot and schedule the week's posts",
      bucket: "project",
    });
  }

  for (const dayId of substack) {
    on(dayId).actions.push({ text: "Substack writing block", bucket: "project" });
  }

  for (const dayId of sundays) {
    on(dayId).actions.push({ text: "Weekly review, 30 minutes", bucket: "project" });
    on(dayId).actions.push({ text: "Pick this week's wind-down nights", bucket: "task" });
  }

  on(from).actions.push({
    text: "Write the identity statement for who I am becoming over these two months",
    bucket: "task",
  });

  const midpoint: ISODate = "2026-11-01";
  on(midpoint).actions.push({ text: "Midpoint review", bucket: "project" });
  on(to).actions.push({ text: "Closing reflection", bucket: "project" });

  const logDays: ISODate[] = [from, midpoint, to];
  for (const dayId of logDays) {
    on(dayId).actions.push({ text: "Log the outcome numbers", bucket: "quickTick" });
  }

  return {
    name: "Self Love Lock In",
    identity: "",
    from,
    to,
    habits: [
      { match: ["run", "running"], name: "run", targetPerWeek: 1, targetDays: [1] },
      { match: ["lift", "gym"], name: "lift", targetPerWeek: 3, targetDays: [2, 3, 5] },
      {
        match: ["evening wind-down", "morning pages"],
        name: "evening wind-down",
        targetPerWeek: 3,
        targetDays: [],
      },
    ],
    days: [...byDay.values()].sort((a, b) => a.dayId.localeCompare(b.dayId)),
    outcomes: logDays.map((dayId) => ({ dayId, labels: OUTCOME_LABELS })),
  };
}

/** The snapshots a seed asks for, ready to store. */
export function seedOutcomes(seed: InitiativeSeed): OutcomeSnapshot[] {
  return seed.outcomes.map((snapshot) => ({
    id: newId(),
    dayId: snapshot.dayId,
    values: snapshot.labels.map((label) => ({ id: newId(), label, value: null })),
  }));
}

/**
 * Which existing habit a plan should reuse, if any.
 *
 * By name, case-insensitively, because that is the only handle a person has
 * on a habit they created months ago. Archived ones are skipped: reviving
 * something somebody put away is worse than making a new row beside it.
 */
export function matchHabit(habits: Record<string, Habit>, plan: HabitPlan): Habit | null {
  const live = Object.values(habits).filter((h) => !h.archivedAt);
  for (const wanted of plan.match) {
    const hit = live.find((h) => h.name.trim().toLowerCase() === wanted);
    if (hit) return hit;
  }
  return null;
}

/** Whether a day already carries this seed's line, so applying twice is safe. */
export function alreadySeeded(day: Day, initiativeId: string, text: string): boolean {
  return (
    day.actions.some((a) => a.initiativeId === initiativeId && a.text === text) ||
    day.scheduleItems.some((i) => i.initiativeId === initiativeId && i.text === text)
  );
}

/** The last day of the week a date sits in, for "is this the review day". */
export function isReviewDay(dayId: ISODate): boolean {
  return getISODay(parseDayId(dayId)) === 7;
}

/**
 * The day the stretch turns over: the **first day of the second half**.
 *
 * Derived from the initiative's own days rather than written into the seed, so
 * the review belongs to the initiative rather than to one person's October and
 * any stretch gets its halfway point for free.
 *
 * `ceil` rather than `floor`, and the difference is not cosmetic: over 61 days
 * `floor` gives 31 October, the last day of the first half, while the seed
 * writes the midpoint review on 1 November. The card and the action it belongs
 * to would then sit on different days, which is exactly the kind of quiet
 * disagreement nobody notices until the day arrives and the page is empty.
 */
export function midpointOf(initiative: Initiative): ISODate {
  const days = daysOf(initiative);
  return days[Math.ceil(days.length / 2)] ?? days[days.length - 1];
}

/** The days of a stretch, capped so a long initiative cannot walk forever. */
export function daysOf(initiative: Initiative): ISODate[] {
  const days: ISODate[] = [];
  let cursor = parseDayId(initiative.from);
  const end = parseDayId(initiative.to);
  while (cursor <= end && days.length < 400) {
    days.push(formatDayId(cursor));
    cursor = addDays(cursor, 1);
  }
  return days;
}

/**
 * Applying a seed to a store.
 *
 * One pure step from state to state, rather than a script of writes, so the
 * whole two months lands as a single change: one save, one undo, and no half
 * applied month if something throws in the middle.
 *
 * **Safe to run twice.** Habits are matched by name and patched rather than
 * duplicated, an initiative with the same name and dates is reused, and a
 * line already written on a day is skipped. Somebody who presses the button
 * again gets the same two months, not two of them.
 */
export function applySeed(
  state: ClaroState,
  seed: InitiativeSeed,
  now: Date,
): { state: ClaroState; initiativeId: string } {
  let habits = { ...state.habits };
  const habitIds: string[] = [];
  let order = Object.keys(habits).length;

  for (const plan of seed.habits) {
    const existing = matchHabit(habits, plan);
    if (existing) {
      habits[existing.id] = {
        ...existing,
        name: plan.name,
        targetPerWeek: plan.targetPerWeek,
        targetDays: plan.targetDays,
      };
      habitIds.push(existing.id);
      continue;
    }

    const made = createHabit(plan.name, now, order++);
    if (!made) continue;
    habits[made.id] = {
      ...made,
      targetPerWeek: plan.targetPerWeek,
      targetDays: plan.targetDays,
    };
    habitIds.push(made.id);
  }

  const already = Object.values(state.initiatives ?? {}).find(
    (i) => i.name === seed.name && i.from === seed.from && i.to === seed.to,
  );
  const initiative: Initiative = already
    ? { ...already, habitIds }
    : {
        id: newId(),
        name: seed.name,
        identity: seed.identity,
        from: seed.from,
        to: seed.to,
        habitIds,
        outcomes: seedOutcomes(seed),
        reviews: [],
        createdAt: now.toISOString(),
      };

  const days = { ...state.days };
  for (const plan of seed.days) {
    let day = readDay({ ...state, days }, plan.dayId);

    for (const action of plan.actions) {
      if (alreadySeeded(day, initiative.id, action.text)) continue;
      const next = addAction(day, action.text, action.bucket, now);
      const added = next.actions[next.actions.length - 1];
      day = {
        ...next,
        actions: next.actions.map((a) =>
          a.id === added.id ? { ...a, initiativeId: initiative.id } : a,
        ),
      };
    }

    for (const block of plan.blocks) {
      if (alreadySeeded(day, initiative.id, block.text)) continue;
      day = {
        ...day,
        scheduleItems: [
          ...day.scheduleItems,
          { ...blockItem(block.time, block.text), initiativeId: initiative.id },
        ],
      };
    }

    days[plan.dayId] = day;
  }

  return {
    state: {
      ...state,
      habits,
      days,
      initiatives: { ...(state.initiatives ?? {}), [initiative.id]: initiative },
    },
    initiativeId: initiative.id,
  };
}
