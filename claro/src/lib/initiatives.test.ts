import { describe, expect, it } from "vitest";

import {
  alreadySeeded,
  applySeed,
  answerReview,
  averageSleep,
  coversDay,
  daysOf,
  habitDue,
  initiativeOn,
  logOutcome,
  matchHabit,
  midpointOf,
  promisesIn,
  reviewOn,
  seedOutcomes,
  selfLoveLockIn,
} from "./initiatives";
import { blankDay, emptyState } from "./storage";
import { habitCompletionId } from "./types";
import type {
  ClaroState,
  Day,
  Habit,
  HabitCompletion,
  Initiative,
  ISODate,
} from "./types";

const habit = (id: string, name: string, patch: Partial<Habit> = {}): Habit => ({
  id,
  name,
  createdAt: "2026-09-01T09:00:00.000Z",
  archivedAt: null,
  ...patch,
});

const initiative = (patch: Partial<Initiative> = {}): Initiative => ({
  id: "i1",
  name: "Self Love Lock In",
  identity: "",
  from: "2026-10-01",
  to: "2026-11-30",
  habitIds: [],
  outcomes: [],
  reviews: [],
  createdAt: "2026-09-30T09:00:00.000Z",
  ...patch,
});

const stateWith = (patch: Partial<ClaroState>): ClaroState => ({ ...emptyState(), ...patch });

const dayWith = (id: ISODate, patch: Partial<Day>): Day => ({ ...blankDay(id), ...patch });

const done = (habitId: string, dayIds: ISODate[]): Record<string, HabitCompletion> =>
  Object.fromEntries(
    dayIds.map((dayId) => [
      habitCompletionId(habitId, dayId),
      { id: habitCompletionId(habitId, dayId), habitId, dayId, completedAt: "x" },
    ]),
  );

/** Monday 5 October to Sunday 11 October 2026. */
const week: ISODate[] = [
  "2026-10-05",
  "2026-10-06",
  "2026-10-07",
  "2026-10-08",
  "2026-10-09",
  "2026-10-10",
  "2026-10-11",
];

describe("what an initiative covers", () => {
  it("includes both of its end days", () => {
    const lock = initiative();

    expect(coversDay(lock, "2026-10-01")).toBe(true);
    expect(coversDay(lock, "2026-11-30")).toBe(true);
    expect(coversDay(lock, "2026-09-30")).toBe(false);
    expect(coversDay(lock, "2026-12-01")).toBe(false);
  });

  it("is found from a date inside it, and not from one outside", () => {
    const state = stateWith({ initiatives: { i1: initiative() } });

    expect(initiativeOn(state, "2026-10-20")?.name).toBe("Self Love Lock In");
    expect(initiativeOn(state, "2026-12-25")).toBeNull();
  });

  it("turns over on the first day of its second half", () => {
    /*
     * The seed writes the midpoint review on 1 November, so this has to agree
     * with it. Rounding the other way gives 31 October, and the review card
     * would sit on a different day from the action it belongs to.
     */
    expect(midpointOf(initiative())).toBe("2026-11-01");
  });

  it("walks its own days, both ends included", () => {
    const days = daysOf(initiative());

    expect(days).toHaveLength(61);
    expect([days[0], days.at(-1)]).toEqual(["2026-10-01", "2026-11-30"]);
  });
});

describe("how many days a habit was due", () => {
  it("counts pinned weekdays exactly", () => {
    const lift = habit("h1", "lift", { targetPerWeek: 3, targetDays: [2, 3, 5] });

    expect(habitDue(lift, week)).toBe(3);
  });

  it("takes a plain weekly count over whole weeks", () => {
    const run = habit("h1", "run", { targetPerWeek: 1 });

    expect(habitDue(run, week)).toBe(1);
    expect(habitDue(run, [...week, ...week])).toBe(2);
  });

  it("refuses a denominator for a plain count over a part week", () => {
    const run = habit("h1", "run", { targetPerWeek: 3 });

    /*
     * Three a week has no honest answer over ten days, and printing 3 × 10 / 7
     * would let somebody measure themselves against arithmetic nobody chose.
     * `habits.ts` makes the same refusal for the same reason.
     */
    expect(habitDue(run, week.slice(0, 3))).toBeNull();
  });

  it("has nothing to say about a habit with no intention", () => {
    expect(habitDue(habit("h1", "walkies"), week)).toBeNull();
  });
});

describe("promises kept", () => {
  const withHabits = (completions: Record<string, HabitCompletion>) =>
    stateWith({
      habits: {
        h1: habit("h1", "run", { targetPerWeek: 1, targetDays: [1] }),
        h2: habit("h2", "lift", { targetPerWeek: 3, targetDays: [2, 3, 5] }),
      },
      habitCompletions: completions,
    });

  it("counts labelled habit days against what was due", () => {
    const state = withHabits({
      ...done("h1", ["2026-10-05"]),
      ...done("h2", ["2026-10-06", "2026-10-07"]),
    });

    expect(promisesIn(state, initiative({ habitIds: ["h1", "h2"] }), week)).toEqual({
      kept: 3,
      due: 4,
    });
  });

  it("counts a labelled action, and leaves an unlabelled one out", () => {
    const state = stateWith({
      days: {
        "2026-10-09": dayWith("2026-10-09", {
          actions: [
            { id: "a1", text: "Content day", bucket: "project", done: true, createdAt: "x", initiativeId: "i1" },
            { id: "a2", text: "Something else", bucket: "task", done: true, createdAt: "x" },
          ],
        }),
      },
    });

    expect(promisesIn(state, initiative(), week)).toEqual({ kept: 1, due: 1 });
  });

  it("does not clip a week somebody went past", () => {
    const state = withHabits(done("h1", ["2026-10-05", "2026-10-07", "2026-10-09"]));

    // Running three times in a week you meant to run once is not an error.
    expect(promisesIn(state, initiative({ habitIds: ["h1"] }), week)).toEqual({
      kept: 3,
      due: 1,
    });
  });

  it("gives up the denominator rather than inventing one", () => {
    const state = stateWith({
      habits: { h1: habit("h1", "walkies") },
      habitCompletions: done("h1", ["2026-10-05"]),
    });

    // One part that cannot be counted honestly makes the whole total dishonest,
    // so the caller is told to say "1 kept" instead of "1 of something".
    expect(promisesIn(state, initiative({ habitIds: ["h1"] }), week)).toEqual({
      kept: 1,
      due: null,
    });
  });

  it("ignores days outside the initiative, even when asked about them", () => {
    const state = withHabits(done("h1", ["2026-09-28", "2026-10-05"]));
    const earlier: ISODate[] = ["2026-09-28", "2026-09-29", "2026-09-30", ...week];

    expect(promisesIn(state, initiative({ habitIds: ["h1"] }), earlier).kept).toBe(1);
  });

  it("skips a habit that has since been archived", () => {
    const state = stateWith({
      habits: { h1: habit("h1", "run", { targetPerWeek: 1, archivedAt: "2026-10-02T09:00:00.000Z" }) },
      habitCompletions: done("h1", ["2026-10-05"]),
    });

    expect(promisesIn(state, initiative({ habitIds: ["h1"] }), week)).toEqual({ kept: 0, due: 0 });
  });
});

describe("sleep across a stretch", () => {
  it("averages only the nights that were rated", () => {
    const state = stateWith({
      days: {
        "2026-10-05": dayWith("2026-10-05", { sleepQuality: 4 }),
        "2026-10-06": dayWith("2026-10-06", { sleepQuality: 3 }),
        "2026-10-07": dayWith("2026-10-07", { sleepQuality: null }),
      },
    });

    expect(averageSleep(state, week)).toBe(3.5);
  });

  it("says nothing rather than zero when none were rated", () => {
    expect(averageSleep(stateWith({}), week)).toBeNull();
  });
});

describe("reviews", () => {
  it("keeps earlier answers when a later prompt is filled in", () => {
    const first = answerReview(initiative(), "2026-10-11", "week", "kept", "run and two lifts");
    const both = answerReview(first, "2026-10-11", "week", "adjust", "move lift to Thursday");

    expect(reviewOn(both, "2026-10-11", "week")?.answers).toEqual({
      kept: "run and two lifts",
      adjust: "move lift to Thursday",
    });
    expect(both.reviews).toHaveLength(1);
  });

  it("keeps the weekly and the midpoint review of one day apart", () => {
    const week11 = answerReview(initiative(), "2026-11-01", "week", "kept", "most of it");
    const both = answerReview(week11, "2026-11-01", "midpoint", "kept", "halfway");

    expect(both.reviews).toHaveLength(2);
    expect(reviewOn(both, "2026-11-01", "week")?.answers.kept).toBe("most of it");
  });

  it("stores a cleared answer as cleared", () => {
    const written = answerReview(initiative(), "2026-10-11", "week", "kept", "something");
    const cleared = answerReview(written, "2026-10-11", "week", "kept", "");

    expect(reviewOn(cleared, "2026-10-11", "week")?.answers.kept).toBe("");
  });
});

describe("outcome numbers", () => {
  const seeded = () => {
    const lock = initiative();
    return { ...lock, outcomes: seedOutcomes(selfLoveLockIn()) };
  };

  it("are asked for on the first day, the midpoint and the last", () => {
    expect(seeded().outcomes.map((o) => o.dayId)).toEqual([
      "2026-10-01",
      "2026-11-01",
      "2026-11-30",
    ]);
  });

  it("start empty, with no target to be measured against", () => {
    const first = seeded().outcomes[0];

    expect(first.values.map((v) => v.label)).toEqual([
      "Instagram followers",
      "TikTok followers",
      "Brand conversations",
      "Substack drafts published",
    ]);
    expect(first.values.every((v) => v.value === null)).toBe(true);
    expect(Object.keys(first.values[0])).toEqual(["id", "label", "value"]);
  });

  it("writes one number without disturbing the others", () => {
    const lock = seeded();
    const id = lock.outcomes[0].values[1].id;
    const next = logOutcome(lock, "2026-10-01", id, 1420);

    expect(next.outcomes[0].values[1].value).toBe(1420);
    expect(next.outcomes[0].values[0].value).toBeNull();
    expect(next.outcomes[1].values[1].value).toBeNull();
  });
});

// ------------------------------------------------------------------- the seed

describe("the Self Love Lock In seed", () => {
  const seed = selfLoveLockIn();
  const textsOn = (dayId: ISODate) =>
    seed.days.find((d) => d.dayId === dayId)?.actions.map((a) => a.text) ?? [];
  const everyAction = seed.days.flatMap((d) => d.actions);

  it("runs from 1 October to 30 November", () => {
    expect([seed.from, seed.to]).toEqual(["2026-10-01", "2026-11-30"]);
  });

  it("puts run club on every Monday evening, as the only timed thing", () => {
    const blocks = seed.days.flatMap((d) => d.blocks.map((b) => [d.dayId, b.time, b.text]));

    expect(blocks).toHaveLength(9);
    expect(blocks[0]).toEqual(["2026-10-05", "18:00", "Run club"]);
    expect(blocks.at(-1)).toEqual(["2026-11-30", "18:00", "Run club"]);
    // Everything else waits in Actions until it is given a time.
    expect(blocks.every(([, time]) => time === "18:00")).toBe(true);
  });

  it("puts a content day on every Friday", () => {
    const fridays = seed.days.filter((d) =>
      d.actions.some((a) => a.text.startsWith("Content day")),
    );

    expect(fridays).toHaveLength(9);
    expect(fridays[0].dayId).toBe("2026-10-02");
    expect(fridays.at(-1)?.dayId).toBe("2026-11-27");
  });

  it("puts the Substack block on alternate Saturdays, starting 3 October", () => {
    const saturdays = seed.days
      .filter((d) => d.actions.some((a) => a.text === "Substack writing block"))
      .map((d) => d.dayId);

    expect(saturdays).toEqual([
      "2026-10-03",
      "2026-10-17",
      "2026-10-31",
      "2026-11-14",
      "2026-11-28",
    ]);
  });

  it("puts the review and its wind-down question on every Sunday", () => {
    const sundays = seed.days.filter((d) =>
      d.actions.some((a) => a.text === "Weekly review, 30 minutes"),
    );

    expect(sundays).toHaveLength(9);
    expect(sundays[0].dayId).toBe("2026-10-04");
    expect(textsOn("2026-10-04")).toContain("Pick this week's wind-down nights");
  });

  it("opens with the identity statement and closes with the reflection", () => {
    expect(textsOn("2026-10-01")).toContain(
      "Write the identity statement for who I am becoming over these two months",
    );
    expect(textsOn("2026-11-01")).toContain("Midpoint review");
    expect(textsOn("2026-11-30")).toContain("Closing reflection");
  });

  it("asks for the outcome numbers three times, as quick ticks", () => {
    const logs = seed.days.filter((d) =>
      d.actions.some((a) => a.text === "Log the outcome numbers"),
    );

    expect(logs.map((d) => d.dayId)).toEqual(["2026-10-01", "2026-11-01", "2026-11-30"]);
    expect(
      everyAction.filter((a) => a.text === "Log the outcome numbers").every((a) => a.bucket === "quickTick"),
    ).toBe(true);
  });

  it("sizes each action by what it actually takes", () => {
    const bucketOf = (text: string) =>
      everyAction.find((a) => a.text.startsWith(text))?.bucket;

    // "Project" here is Claro's size bucket, 30 minutes or more, not a name
    // for the initiative itself.
    expect(bucketOf("Content day")).toBe("project");
    expect(bucketOf("Weekly review")).toBe("project");
    expect(bucketOf("Pick this week's")).toBe("task");
    expect(bucketOf("Write the identity")).toBe("task");
  });

  it("names the three practices and leaves every other habit alone", () => {
    expect(seed.habits.map((h) => [h.name, h.targetPerWeek, h.targetDays])).toEqual([
      ["run", 1, [1]],
      ["lift", 3, [2, 3, 5]],
      ["evening wind-down", 3, []],
    ]);
  });
});

describe("reusing the habits already there", () => {
  const habits = {
    h1: habit("h1", "Gym"),
    h2: habit("h2", "meditate"),
    h3: habit("h3", "morning pages"),
  };
  const plans = selfLoveLockIn().habits;

  it("finds an existing row whatever its capitals", () => {
    expect(matchHabit(habits, plans[1])?.id).toBe("h1");
  });

  it("finds the row the practice is being renamed from", () => {
    expect(matchHabit(habits, plans[2])?.id).toBe("h3");
  });

  it("reports nothing to reuse when the practice is new", () => {
    expect(matchHabit(habits, plans[0])).toBeNull();
  });

  it("leaves an archived row put away rather than reviving it", () => {
    const archived = { h1: habit("h1", "gym", { archivedAt: "2026-09-01T09:00:00.000Z" }) };

    expect(matchHabit(archived, plans[1])).toBeNull();
  });
});

describe("applying the seed more than once", () => {
  it("recognises a line it has already written", () => {
    const day = dayWith("2026-10-02", {
      actions: [
        { id: "a1", text: "Content day", bucket: "project", done: false, createdAt: "x", initiativeId: "i1" },
      ],
    });

    expect(alreadySeeded(day, "i1", "Content day")).toBe(true);
    expect(alreadySeeded(day, "i1", "Substack writing block")).toBe(false);
    // Somebody else's identically worded action is not this seed's.
    expect(alreadySeeded(day, "other", "Content day")).toBe(false);
  });
});

describe("applying the seed to a store", () => {
  const now = new Date("2026-09-30T09:00:00.000Z");
  const apply = (state: ClaroState) => applySeed(state, selfLoveLockIn(), now);

  it("writes the whole two months in one step", () => {
    const { state, initiativeId } = apply(emptyState());
    const lock = state.initiatives[initiativeId];

    expect(lock.name).toBe("Self Love Lock In");
    expect([lock.from, lock.to]).toEqual(["2026-10-01", "2026-11-30"]);
    // Every dated line, and nothing on a day the seed never named.
    expect(Object.keys(state.days).sort()).toEqual(
      selfLoveLockIn().days.map((d) => d.dayId).sort(),
    );
  });

  it("labels every line it writes, so the panels can count them", () => {
    const { state, initiativeId } = apply(emptyState());
    const actions = Object.values(state.days).flatMap((d) => d.actions);
    const blocks = Object.values(state.days).flatMap((d) => d.scheduleItems);

    expect(actions.length).toBeGreaterThan(30);
    expect(actions.every((a) => a.initiativeId === initiativeId)).toBe(true);
    expect(blocks.every((i) => i.initiativeId === initiativeId)).toBe(true);
  });

  it("renames the habits already there instead of making second copies", () => {
    const before = stateWith({
      habits: {
        h1: habit("h1", "Gym"),
        h2: habit("h2", "morning pages"),
        h3: habit("h3", "meditate"),
        h4: habit("h4", "walkies"),
      },
    });

    const { state, initiativeId } = apply(before);
    const byId = state.habits;

    expect(byId.h1.name).toBe("lift");
    expect(byId.h1.targetPerWeek).toBe(3);
    expect(byId.h1.targetDays).toEqual([2, 3, 5]);
    expect(byId.h2.name).toBe("evening wind-down");
    // Untouched, unlabelled, exactly as they were.
    expect(byId.h3).toEqual(habit("h3", "meditate"));
    expect(byId.h4).toEqual(habit("h4", "walkies"));
    // Only run was missing, so only run is new.
    expect(Object.keys(byId)).toHaveLength(5);
    expect(state.initiatives[initiativeId].habitIds).toHaveLength(3);
  });

  it("leaves the days that were already there alone", () => {
    const before = stateWith({
      days: {
        "2026-10-02": dayWith("2026-10-02", { notes: "already written" }),
      },
    });

    const { state } = apply(before);
    expect(state.days["2026-10-02"].notes).toBe("already written");
    expect(state.days["2026-10-02"].actions).toHaveLength(1);
  });

  it("is safe to run twice", () => {
    const once = apply(emptyState());
    const twice = applySeed(once.state, selfLoveLockIn(), now);

    /*
     * The button is a button, and buttons get pressed again. A second run
     * finds the same initiative, the same habits and the same lines, and
     * changes nothing rather than laying a second two months on top.
     */
    expect(Object.keys(twice.state.initiatives)).toHaveLength(1);
    expect(twice.initiativeId).toBe(once.initiativeId);
    expect(Object.keys(twice.state.habits)).toHaveLength(3);

    const count = (s: ClaroState) =>
      Object.values(s.days).flatMap((d) => [...d.actions, ...d.scheduleItems]).length;
    expect(count(twice.state)).toBe(count(once.state));
  });

  it("keeps the identity statement and the reviews written since", () => {
    const once = apply(emptyState());
    const edited: ClaroState = {
      ...once.state,
      initiatives: {
        [once.initiativeId]: answerReview(
          { ...once.state.initiatives[once.initiativeId], identity: "someone who keeps her word" },
          "2026-10-11",
          "week",
          "kept",
          "all three",
        ),
      },
    };

    const again = applySeed(edited, selfLoveLockIn(), now);
    const lock = again.state.initiatives[again.initiativeId];

    expect(lock.identity).toBe("someone who keeps her word");
    expect(lock.reviews).toHaveLength(1);
  });
});
