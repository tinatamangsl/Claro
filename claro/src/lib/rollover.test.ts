import { describe, expect, it } from "vitest";

import {
  ROLLOVER_HOUR,
  ROLLOVER_LOOKBACK_DAYS,
  applyRollover,
  isEligible,
  keepCarriedAsAction,
  letGoCarried,
  promoteCarried,
  rolloverAt,
  rolloverTargetDayId,
} from "./rollover";
import { blankDay, blankPriority, emptyState } from "./storage";
import type { ActionItem, ClaroState, Day, Priority } from "./types";

/**
 * Every clock in here is built from local parts on purpose. The rule is "10 PM
 * where the user is", so a test written in UTC would pass against an
 * implementation that is wrong for most of the world.
 */
const localTime = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0);

const priority = (patch: Partial<Priority> = {}): Priority => ({
  ...blankPriority(),
  id: "p-1",
  text: "Ship the store",
  originDayId: "2026-08-17",
  createdAt: "2026-08-17T09:00:00.000Z",
  ...patch,
});

const action = (patch: Partial<ActionItem> = {}): ActionItem => ({
  id: "a-1",
  text: "Email the accountant",
  bucket: "task",
  done: false,
  createdAt: "2026-08-17T09:00:00.000Z",
  ...patch,
});

const dayWith = (id: string, patch: Partial<Day>): Day => ({ ...blankDay(id), ...patch });

const stateWith = (...days: Day[]): ClaroState => ({
  ...emptyState(),
  days: Object.fromEntries(days.map((day) => [day.id, day])),
});

// ------------------------------------------------------------------ the rule

describe("when a day becomes eligible", () => {
  it("is 10 PM in the user's own local time, not UTC", () => {
    const at = rolloverAt("2026-08-18");

    expect(at.getHours()).toBe(ROLLOVER_HOUR);
    expect(at.getMinutes()).toBe(0);
    expect(at.getDate()).toBe(18);
    expect(at.getMonth()).toBe(7);
  });

  it("still lands on local 10 PM across a daylight-saving change", () => {
    // 29 March is the spring-forward date in much of Europe. Adding 22 hours to
    // midnight would land at 11 PM there; building from local parts does not.
    const at = rolloverAt("2026-03-29");

    expect(at.getHours()).toBe(ROLLOVER_HOUR);
    expect(at.getDate()).toBe(29);
  });

  it("is not eligible a minute before, and is eligible on the stroke", () => {
    expect(isEligible("2026-08-18", localTime(2026, 8, 18, 21, 59))).toBe(false);
    expect(isEligible("2026-08-18", localTime(2026, 8, 18, 22, 0))).toBe(true);
  });

  it("stays eligible on later days", () => {
    expect(isEligible("2026-08-18", localTime(2026, 8, 21, 9))).toBe(true);
  });

  it("sends work to today before 10 PM, and to tomorrow after it", () => {
    expect(rolloverTargetDayId(localTime(2026, 8, 18, 9))).toBe("2026-08-18");
    expect(rolloverTargetDayId(localTime(2026, 8, 18, 21, 59))).toBe("2026-08-18");
    // Working past 10 PM must never clear the page still being worked on.
    expect(rolloverTargetDayId(localTime(2026, 8, 18, 22, 0))).toBe("2026-08-19");
  });
});

// ------------------------------------------------------------------- carrying

describe("carrying unfinished work forward", () => {
  const yesterday = () => dayWith("2026-08-17", { priority1: priority() });
  const thisMorning = localTime(2026, 8, 18, 9);

  it("moves an unfinished priority into the first free slot", () => {
    const next = applyRollover(stateWith(yesterday()), thisMorning);

    expect(next.days["2026-08-18"].priority1.text).toBe("Ship the store");
  });

  it("preserves the original creation date and where it came from", () => {
    const carried = applyRollover(stateWith(yesterday()), thisMorning).days["2026-08-18"]
      .priority1;

    expect(carried.originDayId).toBe("2026-08-17");
    expect(carried.createdAt).toBe("2026-08-17T09:00:00.000Z");
    expect(carried.id).toBe("p-1");
  });

  it("arrives unfinished, whatever happened to it yesterday", () => {
    const next = applyRollover(stateWith(yesterday()), thisMorning);

    expect(next.days["2026-08-18"].priority1.done).toBe(false);
    expect(next.days["2026-08-18"].priority1.carriedTo).toBeNull();
  });

  it("leaves yesterday's own record standing, marked with where it went", () => {
    const next = applyRollover(stateWith(yesterday()), thisMorning);
    const source = next.days["2026-08-17"];

    expect(source.priority1.text).toBe("Ship the store");
    expect(source.priority1.carriedTo).toBe("2026-08-18");
  });

  it("leaves finished work where it is", () => {
    const state = stateWith(dayWith("2026-08-17", { priority1: priority({ done: true }) }));

    expect(applyRollover(state, thisMorning)).toBe(state);
  });

  it("leaves a blank slot alone", () => {
    const state = stateWith(dayWith("2026-08-17", { priority1: blankPriority() }));

    expect(applyRollover(state, thisMorning)).toBe(state);
  });

  it("does nothing at all to a day that has not reached its 10 PM", () => {
    const state = stateWith(dayWith("2026-08-18", { priority1: priority() }));

    expect(applyRollover(state, localTime(2026, 8, 18, 15))).toBe(state);
  });
});

// ---------------------------------------------------------- no duplication

describe("never carrying the same thing twice", () => {
  const thisMorning = localTime(2026, 8, 18, 9);
  const state = stateWith(
    dayWith("2026-08-17", { priority1: priority(), actions: [action()] }),
  );

  it("is a no-op the second time it runs", () => {
    const once = applyRollover(state, thisMorning);

    // Identity, not deep equality: an idempotent run must not even re-render.
    expect(applyRollover(once, thisMorning)).toBe(once);
  });

  it("does not accumulate copies over repeated opens", () => {
    let current = applyRollover(state, thisMorning);
    for (let i = 0; i < 5; i += 1) current = applyRollover(current, thisMorning);

    const today = current.days["2026-08-18"];
    expect(today.priority1.text).toBe("Ship the store");
    expect(today.priority2.text).toBe("");
    expect(today.carriedForward).toHaveLength(1);
  });

  it("refuses an item the target day already holds", () => {
    // Same id already sitting in today's second slot.
    const already = stateWith(
      dayWith("2026-08-17", { priority1: priority() }),
      dayWith("2026-08-18", { priority2: priority({ carriedTo: null }) }),
    );

    const next = applyRollover(already, thisMorning);

    expect(next.days["2026-08-18"].priority1.text).toBe("");
    expect(next.days["2026-08-18"].carriedForward).toEqual([]);
  });
});

// ---------------------------------------------------------- closed browser

describe("when the browser was shut at 10 PM", () => {
  it("catches up on every eligible day the next time Claro is opened", () => {
    const state = stateWith(
      dayWith("2026-08-14", { priority1: priority({ id: "fri", text: "Friday's thing" }) }),
      dayWith("2026-08-15", { priority1: priority({ id: "sat", text: "Saturday's thing" }) }),
    );

    // Opened Monday morning, having been closed all weekend.
    const next = applyRollover(state, localTime(2026, 8, 17, 9));
    const monday = next.days["2026-08-17"];

    expect([monday.priority1.text, monday.priority2.text]).toEqual([
      "Friday's thing",
      "Saturday's thing",
    ]);
  });

  it("moves work waiting for review onward rather than stranding it", () => {
    const stranded = dayWith("2026-08-16", {
      carriedForward: [
        {
          id: "old",
          text: "Still undecided",
          goal: null,
          origin: "action",
          bucket: "task",
          originDayId: "2026-08-14",
          createdAt: "2026-08-14T09:00:00.000Z",
        },
      ],
    });

    const next = applyRollover(stateWith(stranded), localTime(2026, 8, 18, 9));

    expect(next.days["2026-08-16"].carriedForward).toEqual([]);
    expect(next.days["2026-08-18"].carriedForward).toHaveLength(1);
    // The reference stays true to where the work actually started.
    expect(next.days["2026-08-18"].carriedForward[0].originDayId).toBe("2026-08-14");
  });

  it("does not empty a fortnight of unfinished work onto today", () => {
    const longAgo = dayWith("2026-08-01", { priority1: priority({ id: "ancient" }) });
    const recent = dayWith("2026-08-17", { priority1: priority({ id: "recent" }) });

    const next = applyRollover(stateWith(longAgo, recent), localTime(2026, 8, 18, 9));

    expect(next.days["2026-08-18"].priority1.id).toBe("recent");
    expect(next.days["2026-08-18"].priority2.text).toBe("");
    expect(next.days["2026-08-01"].priority1.carriedTo).toBeNull();
  });

  it("reaches back exactly as far as the lookback window says", () => {
    const edge = new Date(localTime(2026, 8, 18, 9));
    const oldestId = "2026-08-11"; // 18th minus 7 days

    expect(ROLLOVER_LOOKBACK_DAYS).toBe(7);
    const next = applyRollover(
      stateWith(dayWith(oldestId, { priority1: priority({ id: "edge" }) })),
      edge,
    );

    expect(next.days["2026-08-18"].priority1.id).toBe("edge");
  });
});

// ------------------------------------------------------------ full capacity

describe("when the day is already full", () => {
  const thisMorning = localTime(2026, 8, 18, 9);

  const fullToday = () =>
    dayWith("2026-08-18", {
      priority1: priority({ id: "t1", text: "Already mine 1" }),
      priority2: priority({ id: "t2", text: "Already mine 2" }),
      priority3: priority({ id: "t3", text: "Already mine 3" }),
    });

  it("puts carried work in the review area instead of overwriting anything", () => {
    const next = applyRollover(
      stateWith(dayWith("2026-08-17", { priority1: priority() }), fullToday()),
      thisMorning,
    );
    const today = next.days["2026-08-18"];

    expect(today.priority1.text).toBe("Already mine 1");
    expect(today.priority2.text).toBe("Already mine 2");
    expect(today.priority3.text).toBe("Already mine 3");
    expect(today.carriedForward.map((i) => i.text)).toEqual(["Ship the store"]);
  });

  it("fills only the slots that are genuinely blank", () => {
    const partly = dayWith("2026-08-18", {
      priority1: priority({ id: "t1", text: "Already mine" }),
    });
    const source = dayWith("2026-08-17", {
      priority1: priority({ id: "s1", text: "First carried" }),
      priority2: priority({ id: "s2", text: "Second carried" }),
      priority3: priority({ id: "s3", text: "Third carried" }),
    });

    const today = applyRollover(stateWith(source, partly), thisMorning).days["2026-08-18"];

    expect(today.priority1.text).toBe("Already mine");
    expect(today.priority2.text).toBe("First carried");
    expect(today.priority3.text).toBe("Second carried");
    // The one that didn't fit waits for a decision rather than displacing work.
    expect(today.carriedForward.map((i) => i.text)).toEqual(["Third carried"]);
  });

  it("sends unfinished actions to review rather than silently re-listing them", () => {
    const source = dayWith("2026-08-17", {
      actions: [action({ id: "a1" }), action({ id: "a2", done: true })],
    });

    const today = applyRollover(stateWith(source), thisMorning).days["2026-08-18"];

    expect(today.actions).toEqual([]);
    expect(today.carriedForward.map((i) => i.id)).toEqual(["a1"]);
  });
});

// --------------------------------------------------------------- decisions

describe("resolving something in the review area", () => {
  const item = {
    id: "c1",
    text: "Still worth doing",
    goal: null,
    origin: "priority" as const,
    bucket: null,
    originDayId: "2026-08-14",
    createdAt: "2026-08-14T09:00:00.000Z",
  };
  const withReview = () => dayWith("2026-08-18", { carriedForward: [item] });

  it("promotes it into a free slot, keeping its history", () => {
    const next = promoteCarried(withReview(), "c1");

    expect(next.priority1.text).toBe("Still worth doing");
    expect(next.priority1.originDayId).toBe("2026-08-14");
    expect(next.carriedForward).toEqual([]);
  });

  it("refuses to promote when all three slots are taken", () => {
    const full = {
      ...withReview(),
      priority1: priority({ id: "a" }),
      priority2: priority({ id: "b" }),
      priority3: priority({ id: "c" }),
    };

    expect(promoteCarried(full, "c1")).toBe(full);
  });

  it("keeps it as an action, with its original creation date", () => {
    const next = keepCarriedAsAction(withReview(), "c1", new Date("2026-08-18T09:00:00.000Z"));

    expect(next.actions).toHaveLength(1);
    expect(next.actions[0].createdAt).toBe("2026-08-14T09:00:00.000Z");
    expect(next.carriedForward).toEqual([]);
  });

  it("lets it go without a trace, because that is a legitimate answer", () => {
    expect(letGoCarried(withReview(), "c1").carriedForward).toEqual([]);
  });

  it("ignores an id that is not there", () => {
    const day = withReview();
    expect(letGoCarried(day, "nope")).toBe(day);
    expect(promoteCarried(day, "nope")).toBe(day);
  });
});
