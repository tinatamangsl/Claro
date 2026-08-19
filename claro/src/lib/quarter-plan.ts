/**
 * The quarterly planning workspace, as pure logic.
 *
 * The workspace edits the canonical quarter directly. There is no draft copy
 * and nothing to synchronise back: a Main Quest typed here *is* the Main Quest
 * that Today links to and that Calendar counts, from the first keystroke. That
 * is what makes reopening a plan safe, and what makes duplicated goals
 * structurally impossible rather than merely unlikely.
 *
 * The four stages are the ones the product owner specified. Wording is Claro's
 * own.
 */

import { MAX_SIDE_QUESTS, PLAN_WEEKS, type Quarter, type QuarterPlan } from "./types";

export const PLAN_STAGES = [
  "back",
  "foundation",
  "goals",
  "systems",
  "people",
  "execution",
  "review",
] as const;
export type PlanStage = (typeof PLAN_STAGES)[number];

export const STAGE_META: Record<PlanStage, { label: string; hint: string }> = {
  back: { label: "Looking back", hint: "What the last quarter actually taught you" },
  foundation: { label: "Foundation", hint: "What this quarter is for, before it becomes goals" },
  goals: { label: "Goals", hint: "The quests you are committing to" },
  systems: { label: "Systems", hint: "The conditions that make it easier" },
  people: { label: "People", hint: "Who is around this, and who you can lean on" },
  execution: { label: "Twelve weeks", hint: "A calm focus map, blanks allowed" },
  review: { label: "Review", hint: "Read it back before you settle it" },
};

export function blankPlan(now: Date): QuarterPlan {
  return {
    startedAt: now.toISOString(),
    completedAt: null,
    reflection: { proudOf: "", whatWorked: "", carryForward: "" },
    direction: { mattersMost: "", meaningful: "", constraints: "" },
    foundation: { theme: "", outcome: "", whyItMatters: "", headline: "" },
    clearestGoals: ["", "", ""],
    systems: {
      routines: "",
      habitsToSupport: "",
      simplify: "",
      stopDoing: "",
      weeklyRitual: "",
    },
    people: { support: "", mentor: "", empower: "", accountability: "" },
    focusWeeks: Array.from({ length: PLAN_WEEKS }, () => ""),
  };
}

/** Opening the workspace starts a plan, without disturbing anything already set. */
export function startPlan(quarter: Quarter, now: Date): Quarter {
  return quarter.plan ? quarter : { ...quarter, plan: blankPlan(now) };
}

export function settlePlan(quarter: Quarter, now: Date): Quarter {
  if (!quarter.plan) return quarter;
  return { ...quarter, plan: { ...quarter.plan, completedAt: now.toISOString() } };
}

/** Reopening keeps every word and every quest; only the settled mark is lifted. */
export function reopenPlan(quarter: Quarter): Quarter {
  if (!quarter.plan?.completedAt) return quarter;
  return { ...quarter, plan: { ...quarter.plan, completedAt: null } };
}

const written = (text: string) => text.trim() !== "";

/**
 * How much of a stage has been filled in.
 *
 * A stage is never required and nothing is blocked by leaving it empty: this
 * only tells the stepper what to show, so a user can see at a glance where they
 * left off.
 */
export type StageProgress = { answered: number; of: number };

export function stageProgress(quarter: Quarter, stage: PlanStage): StageProgress {
  const plan = quarter.plan;

  if (stage === "back") {
    const r = plan?.reflection;
    const values = [r?.proudOf, r?.whatWorked, r?.carryForward];
    return { answered: values.filter((v) => written(v ?? "")).length, of: 3 };
  }

  if (stage === "foundation") {
    const f = plan?.foundation;
    const values = [f?.theme, f?.outcome, f?.whyItMatters, f?.headline];
    return { answered: values.filter((v) => written(v ?? "")).length, of: 4 };
  }

  if (stage === "goals") {
    // The two Main Quests are what defines a quarter; side quests are optional.
    const values = [quarter.work.mainQuest, quarter.life.mainQuest];
    return { answered: values.filter(written).length, of: 2 };
  }

  if (stage === "systems") {
    const s = plan?.systems;
    const values = [s?.routines, s?.habitsToSupport, s?.simplify, s?.stopDoing, s?.weeklyRitual];
    return { answered: values.filter((v) => written(v ?? "")).length, of: 5 };
  }

  if (stage === "people") {
    const p = plan?.people;
    const values = [p?.support, p?.mentor, p?.empower, p?.accountability];
    return { answered: values.filter((v) => written(v ?? "")).length, of: 4 };
  }

  if (stage === "execution") {
    // Weeks may stay blank on purpose, so this counts rather than requires.
    const weeks = plan?.focusWeeks ?? [];
    return { answered: weeks.filter(written).length, of: PLAN_WEEKS };
  }

  return { answered: isSettled(quarter) ? 1 : 0, of: 1 };
}

export function isSettled(quarter: Quarter): boolean {
  return quarter.plan?.completedAt !== null && quarter.plan?.completedAt !== undefined;
}

/** True when there is anything at all worth reading back on the review stage. */
export function hasAnything(quarter: Quarter): boolean {
  const plan = quarter.plan;
  const texts = [
    plan?.reflection.proudOf,
    plan?.reflection.whatWorked,
    plan?.reflection.carryForward,
    plan?.foundation.theme,
    plan?.foundation.outcome,
    plan?.foundation.whyItMatters,
    plan?.foundation.headline,
    ...(plan?.clearestGoals ?? []),
    ...Object.values(plan?.systems ?? {}),
    ...Object.values(plan?.people ?? {}),
    ...(plan?.focusWeeks ?? []),
    quarter.work.mainQuest,
    quarter.work.mainQuestWhy,
    quarter.work.mainQuestEnough,
    quarter.life.mainQuest,
    quarter.life.mainQuestWhy,
    quarter.life.mainQuestEnough,
  ];
  if (texts.some((t) => written(t ?? ""))) return true;
  return [...quarter.work.sideQuests, ...quarter.life.sideQuests].some((q) => written(q.text));
}

export function sideQuestsLeft(quarter: Quarter, domain: "work" | "life"): number {
  return Math.max(0, MAX_SIDE_QUESTS - quarter[domain].sideQuests.length);
}

export function nextStage(stage: PlanStage): PlanStage | null {
  const at = PLAN_STAGES.indexOf(stage);
  return PLAN_STAGES[at + 1] ?? null;
}

export function previousStage(stage: PlanStage): PlanStage | null {
  const at = PLAN_STAGES.indexOf(stage);
  return at <= 0 ? null : PLAN_STAGES[at - 1];
}
