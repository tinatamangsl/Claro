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

import { MAX_SIDE_QUESTS, type Quarter, type QuarterPlan } from "./types";

export const PLAN_STAGES = ["back", "direction", "define", "review"] as const;
export type PlanStage = (typeof PLAN_STAGES)[number];

export const STAGE_META: Record<PlanStage, { label: string; hint: string }> = {
  back: { label: "Looking back", hint: "What the last quarter actually taught you" },
  direction: { label: "Choosing direction", hint: "What this one is for" },
  define: { label: "Defining the quarter", hint: "The quests you are committing to" },
  review: { label: "Review", hint: "Read it back before you settle it" },
};

export function blankPlan(now: Date): QuarterPlan {
  return {
    startedAt: now.toISOString(),
    completedAt: null,
    reflection: { proudOf: "", whatWorked: "", carryForward: "" },
    direction: { mattersMost: "", meaningful: "", constraints: "" },
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

  if (stage === "direction") {
    const d = plan?.direction;
    const values = [d?.mattersMost, d?.meaningful, d?.constraints];
    return { answered: values.filter((v) => written(v ?? "")).length, of: 3 };
  }

  if (stage === "define") {
    // The two Main Quests are what defines a quarter; side quests are optional.
    const values = [quarter.work.mainQuest, quarter.life.mainQuest];
    return { answered: values.filter(written).length, of: 2 };
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
    plan?.direction.mattersMost,
    plan?.direction.meaningful,
    plan?.direction.constraints,
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
