/**
 * Return to Focus: the pure logic behind the re-entry screen.
 *
 * Nothing here reads the clock or the DOM — `parkDistraction` takes `now`
 * explicitly, so the whole module is exhaustively testable without timers.
 */

import { newId } from "./id";
import { resolveGoal, weekGoalFor } from "./goals";
import {
  GOAL_CATEGORY_META,
  PRIORITY_RANKS,
  priorityKey,
  type ActionItem,
  type Day,
  type Priority,
  type PriorityRank,
  type Quarter,
  type Week,
} from "./types";

const isSet = (text: string) => text.trim() !== "";

/**
 * What the user should return to. Derived rather than stored: the hierarchy has
 * already decided what matters today, so a distracted user doesn't have to
 * remember what they were doing.
 */
export type FocusTarget =
  | { kind: "priority"; rank: PriorityRank; priority: Priority }
  /** Every written priority is complete. `next` is the top unfinished project. */
  | { kind: "done"; next: ActionItem | null }
  /** No priority has been written yet — the screen offers to set one. */
  | { kind: "empty" };

/**
 * Walks the three slots in order, so priority 1 is always offered before
 * priority 2, and a blank slot is simply skipped rather than blocking the ones
 * below it.
 */
export function selectFocus(day: Day): FocusTarget {
  const written = PRIORITY_RANKS.filter((rank) => isSet(day[priorityKey(rank)].text));

  if (written.length === 0) return { kind: "empty" };

  const next = written.find((rank) => !day[priorityKey(rank)].done);
  if (next) return { kind: "priority", rank: next, priority: day[priorityKey(next)] };

  return { kind: "done", next: nextProject(day) };
}

/**
 * Only Projects & Focus Blocks are offered after the priorities are done. A
 * quick tick is not a meaningful thing to return to.
 */
function nextProject(day: Day): ActionItem | null {
  return (
    day.actions.find((a) => a.bucket === "project" && !a.done && isSet(a.text)) ?? null
  );
}

/**
 * The intrusion gets a home so it stops occupying working memory. It lands in
 * Quick Ticks; the existing bucket switcher on Today can promote it later.
 */
export function parkDistraction(
  actions: ActionItem[],
  text: string,
  now: Date,
): ActionItem[] {
  const trimmed = text.trim();
  if (!trimmed) return actions;

  return [
    ...actions,
    {
      id: newId(),
      text: trimmed,
      bucket: "quickTick",
      done: false,
      createdAt: now.toISOString(),
    },
  ];
}

/** The rungs above this task — why it is worth returning to. */
export type FocusLadder = { domainLabel: string; goal: string; mainQuest: string };

/**
 * Null when the priority isn't linked to a goal, or when the linked goal is
 * gone — the screen stays quiet rather than showing hollow labels.
 */
export function focusLadder(
  priority: Priority,
  week: Week,
  quarter: Quarter,
): FocusLadder | null {
  if (!priority.goal) return null;

  const linked = resolveGoal(priority.goal, quarter);
  const goal = weekGoalFor(priority.goal, week);
  const mainQuest = linked?.title ?? "";
  if (!goal && !mainQuest) return null;

  return {
    domainLabel: GOAL_CATEGORY_META[priority.goal.category].label,
    goal,
    mainQuest,
  };
}
