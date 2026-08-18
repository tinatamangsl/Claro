/**
 * The one goal vocabulary. Today, Week, Quarter, Focus and the calendar all
 * resolve and label goals through here, so a category never means two things
 * in two places.
 */

import {
  GOAL_CATEGORIES,
  GOAL_CATEGORY_META,
  type GoalCategory,
  type GoalRef,
  type Quarter,
  type Week,
} from "./types";

export type GoalOption = {
  /** Stable value for a <select>: "workMain" or "workSide:<id>". */
  key: string;
  ref: GoalRef;
  category: GoalCategory;
  /** The user's own words for the goal. */
  title: string;
};

const isSet = (text: string) => text.trim() !== "";

export function goalKey(ref: GoalRef): string {
  return ref.sideQuestId ? `${ref.category}:${ref.sideQuestId}` : ref.category;
}

export function parseGoalKey(key: string): GoalRef | null {
  if (!key) return null;
  const [category, sideQuestId] = key.split(":");
  if (!GOAL_CATEGORIES.includes(category as GoalCategory)) return null;
  const ref: GoalRef = { category: category as GoalCategory };
  if (sideQuestId) ref.sideQuestId = sideQuestId;
  return ref;
}

/** Every goal a priority could be linked to, in hierarchy order. */
export function goalOptions(quarter: Quarter): GoalOption[] {
  const options: GoalOption[] = [];

  for (const category of GOAL_CATEGORIES) {
    const meta = GOAL_CATEGORY_META[category];
    const side = quarter[meta.domain];

    if (meta.tier === "main") {
      if (isSet(side.mainQuest)) {
        const ref: GoalRef = { category };
        options.push({ key: goalKey(ref), ref, category, title: side.mainQuest.trim() });
      }
      continue;
    }

    for (const quest of side.sideQuests) {
      if (!isSet(quest.text)) continue;
      const ref: GoalRef = { category, sideQuestId: quest.id };
      options.push({ key: goalKey(ref), ref, category, title: quest.text.trim() });
    }
  }

  return options;
}

/** Null when the reference points at a goal that no longer exists. */
export function resolveGoal(ref: GoalRef | null, quarter: Quarter): GoalOption | null {
  if (!ref) return null;
  const meta = GOAL_CATEGORY_META[ref.category];
  if (!meta) return null;
  const side = quarter[meta.domain];

  if (meta.tier === "main") {
    if (!isSet(side.mainQuest)) return null;
    return { key: goalKey(ref), ref, category: ref.category, title: side.mainQuest.trim() };
  }

  const quest = side.sideQuests.find((q) => q.id === ref.sideQuestId);
  if (!quest || !isSet(quest.text)) return null;
  return { key: goalKey(ref), ref, category: ref.category, title: quest.text.trim() };
}

/** The week goal on the same side of life, so the ladder stays visible. */
export function weekGoalFor(ref: GoalRef | null, week: Week): string {
  if (!ref) return "";
  const meta = GOAL_CATEGORY_META[ref.category];
  if (!meta) return "";
  return week[meta.domain].goal.trim();
}
