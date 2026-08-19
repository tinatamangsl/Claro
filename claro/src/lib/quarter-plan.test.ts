import { describe, expect, it } from "vitest";

import {
  PLAN_STAGES,
  blankPlan,
  hasAnything,
  isSettled,
  nextStage,
  previousStage,
  reopenPlan,
  settlePlan,
  sideQuestsLeft,
  stageProgress,
  startPlan,
} from "./quarter-plan";
import { blankQuarter, blankQuarterSide } from "./storage";
import type { Quarter } from "./types";

const NOW = new Date("2026-07-01T09:00:00.000Z");
const LATER = new Date("2026-07-05T09:00:00.000Z");
const q = (): Quarter => blankQuarter("2026-Q3");

const withText = (quarter: Quarter, patch: Partial<NonNullable<Quarter["plan"]>["reflection"]>) => ({
  ...quarter,
  plan: { ...quarter.plan!, reflection: { ...quarter.plan!.reflection, ...patch } },
});

describe("starting a plan", () => {
  it("creates one, empty, with nothing settled", () => {
    const started = startPlan(q(), NOW);

    expect(started.plan?.startedAt).toBe(NOW.toISOString());
    expect(started.plan?.completedAt).toBeNull();
    expect(started.plan?.reflection).toEqual({ proudOf: "", whatWorked: "", carryForward: "" });
  });

  it("does not restart a plan that already exists", () => {
    const started = startPlan(q(), NOW);
    expect(startPlan(started, LATER)).toBe(started);
  });

  it("leaves quests already written on the quarter completely alone", () => {
    const existing: Quarter = {
      ...q(),
      work: {
        ...blankQuarterSide(),
        mainQuest: "Take Claro to real users",
        sideQuests: [{ id: "s1", text: "Write the launch note", done: true }],
      },
    };

    const started = startPlan(existing, NOW);
    expect(started.work.mainQuest).toBe("Take Claro to real users");
    expect(started.work.sideQuests).toHaveLength(1);
    expect(started.work.sideQuests[0].done).toBe(true);
  });
});

describe("settling and reopening", () => {
  it("marks the plan settled without touching a word of it", () => {
    const written = withText(startPlan(q(), NOW), { proudOf: "Shipped the beta" });
    const settled = settlePlan(written, LATER);

    expect(isSettled(settled)).toBe(true);
    expect(settled.plan?.completedAt).toBe(LATER.toISOString());
    expect(settled.plan?.reflection.proudOf).toBe("Shipped the beta");
  });

  it("reopens without losing the reflections or the quests", () => {
    const built: Quarter = {
      ...withText(startPlan(q(), NOW), { proudOf: "Shipped the beta" }),
      work: { ...blankQuarterSide(), mainQuest: "Take Claro to real users" },
    };
    const settled = settlePlan(built, LATER);
    const reopened = reopenPlan(settled);

    expect(isSettled(reopened)).toBe(false);
    expect(reopened.plan?.reflection.proudOf).toBe("Shipped the beta");
    expect(reopened.work.mainQuest).toBe("Take Claro to real users");
    // The original start date is kept, so reopening is not a restart.
    expect(reopened.plan?.startedAt).toBe(NOW.toISOString());
  });

  it("can be settled again after an edit, without duplicating anything", () => {
    let quarter = settlePlan(startPlan(q(), NOW), LATER);
    quarter = reopenPlan(quarter);
    quarter = { ...quarter, work: { ...quarter.work, mainQuest: "A different quest" } };
    quarter = settlePlan(quarter, new Date("2026-07-09T09:00:00.000Z"));

    expect(quarter.work.mainQuest).toBe("A different quest");
    expect(quarter.work.sideQuests).toEqual([]);
    expect(isSettled(quarter)).toBe(true);
  });

  it("ignores settling or reopening when there is no plan", () => {
    const bare = q();
    expect(settlePlan(bare, NOW)).toBe(bare);
    expect(reopenPlan(bare)).toBe(bare);
  });
});

describe("stage progress", () => {
  it("counts the answers given, and never blocks on a blank one", () => {
    let quarter = startPlan(q(), NOW);
    expect(stageProgress(quarter, "back")).toEqual({ answered: 0, of: 3 });

    quarter = withText(quarter, { proudOf: "Shipped the beta", whatWorked: "Mornings" });
    expect(stageProgress(quarter, "back")).toEqual({ answered: 2, of: 3 });
  });

  it("treats whitespace as unanswered", () => {
    const quarter = withText(startPlan(q(), NOW), { proudOf: "   " });
    expect(stageProgress(quarter, "back").answered).toBe(0);
  });

  it("measures the goals stage by the two Main Quests only", () => {
    const quarter: Quarter = {
      ...startPlan(q(), NOW),
      work: { ...blankQuarterSide(), mainQuest: "Take Claro to real users" },
    };

    expect(stageProgress(quarter, "goals")).toEqual({ answered: 1, of: 2 });
  });

  it("counts the twelve weeks without requiring any of them", () => {
    const quarter = startPlan(q(), NOW);
    expect(stageProgress(quarter, "execution")).toEqual({ answered: 0, of: 12 });

    const withOne: Quarter = {
      ...quarter,
      plan: {
        ...quarter.plan!,
        focusWeeks: quarter.plan!.focusWeeks.map((w, i) => (i === 0 ? "Ship the beta" : w)),
      },
    };
    expect(stageProgress(withOne, "execution").answered).toBe(1);
  });

  it("counts each of the new sections", () => {
    const quarter = startPlan(q(), NOW);
    expect(stageProgress(quarter, "foundation")).toEqual({ answered: 0, of: 4 });
    expect(stageProgress(quarter, "systems")).toEqual({ answered: 0, of: 5 });
    expect(stageProgress(quarter, "people")).toEqual({ answered: 0, of: 4 });
  });

  it("reports the review stage as settled or not", () => {
    const quarter = startPlan(q(), NOW);
    expect(stageProgress(quarter, "review")).toEqual({ answered: 0, of: 1 });
    expect(stageProgress(settlePlan(quarter, LATER), "review")).toEqual({ answered: 1, of: 1 });
  });

  it("copes with a quarter that has no plan at all", () => {
    for (const stage of PLAN_STAGES) {
      expect(() => stageProgress(q(), stage)).not.toThrow();
    }
    expect(stageProgress(q(), "back").answered).toBe(0);
  });
});

describe("what the summary has to show", () => {
  it("is nothing on a fresh plan", () => {
    expect(hasAnything(startPlan(q(), NOW))).toBe(false);
  });

  it("is something once a reflection is written", () => {
    expect(hasAnything(withText(startPlan(q(), NOW), { proudOf: "Shipped" }))).toBe(true);
  });

  it("is something once a quest exists, even with no reflections", () => {
    const quarter: Quarter = {
      ...q(),
      life: { ...blankQuarterSide(), sideQuests: [{ id: "s1", text: "Three runs", done: false }] },
    };

    expect(hasAnything(quarter)).toBe(true);
  });

  it("is something once a Main Quest has a reason behind it", () => {
    const quarter: Quarter = {
      ...q(),
      work: { ...blankQuarterSide(), mainQuestWhy: "Because it is the only thing that moves" },
    };

    expect(hasAnything(quarter)).toBe(true);
  });
});

describe("side quest limits", () => {
  it("allows three a side and no more", () => {
    const full: Quarter = {
      ...q(),
      work: {
        ...blankQuarterSide(),
        sideQuests: [1, 2, 3].map((i) => ({ id: `s${i}`, text: `Quest ${i}`, done: false })),
      },
    };

    expect(sideQuestsLeft(q(), "work")).toBe(3);
    expect(sideQuestsLeft(full, "work")).toBe(0);
    // The two sides are counted independently.
    expect(sideQuestsLeft(full, "life")).toBe(3);
  });
});

describe("moving between stages", () => {
  it("runs looking back, foundation, goals, systems, people, twelve weeks, review", () => {
    expect(PLAN_STAGES).toEqual([
      "back",
      "foundation",
      "goals",
      "systems",
      "people",
      "execution",
      "review",
    ]);
    expect(nextStage("back")).toBe("foundation");
    expect(nextStage("review")).toBeNull();
    expect(previousStage("back")).toBeNull();
    expect(previousStage("goals")).toBe("foundation");
  });
});

describe("a blank plan", () => {
  it("starts empty and unsettled, with room for twelve blank weeks", () => {
    const plan = blankPlan(NOW);
    expect(plan.completedAt).toBeNull();
    expect(Object.values(plan.foundation).every((v) => v === "")).toBe(true);
    expect(plan.clearestGoals).toEqual(["", "", ""]);
    expect(plan.focusWeeks).toHaveLength(12);
    expect(plan.focusWeeks.every((w) => w === "")).toBe(true);
  });
});
