/**
 * Return to Focus: the pure logic behind the re-entry screen.
 *
 * Nothing here reads the clock or the DOM — `parkDistraction` takes `now`
 * explicitly, so the whole module is exhaustively testable without timers.
 */

import { newId } from "./id";
import {
  DOMAIN_META,
  type ActionItem,
  type Day,
  type Priority,
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
  | { kind: "priority"; rank: 1 | 2; priority: Priority }
  /** Both priorities complete. `next` is the top unfinished project, if any. */
  | { kind: "done"; next: ActionItem | null }
  /** Neither priority has been written yet — the screen offers to set one. */
  | { kind: "empty" };

export function selectFocus(day: Day): FocusTarget {
  const set1 = isSet(day.priority1.text);
  const set2 = isSet(day.priority2.text);

  if (!set1 && !set2) return { kind: "empty" };
  if (set1 && !day.priority1.done) return { kind: "priority", rank: 1, priority: day.priority1 };
  if (set2 && !day.priority2.done) return { kind: "priority", rank: 2, priority: day.priority2 };

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
 * Null when the priority isn't linked to a domain, or when the linked domain is
 * still empty — the screen stays quiet rather than showing hollow labels.
 */
export function focusLadder(
  priority: Priority,
  week: Week,
  quarter: Quarter,
): FocusLadder | null {
  if (!priority.link) return null;

  const goal = week[priority.link].goal.trim();
  const mainQuest = quarter[priority.link].mainQuest.trim();
  if (!goal && !mainQuest) return null;

  return { domainLabel: DOMAIN_META[priority.link].label, goal, mainQuest };
}
