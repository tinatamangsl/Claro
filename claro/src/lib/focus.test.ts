import { describe, expect, it } from "vitest";

import { focusLadder, parkDistraction, selectFocus } from "./focus";
import { blankDay, blankPriority, blankQuarter, blankWeek } from "./storage";
import type { ActionItem, Day, Priority, Quarter, Week } from "./types";

const NOW = new Date("2026-08-18T09:30:00.000Z");

const dayWith = (patch: Partial<Day>): Day => ({ ...blankDay("2026-08-18"), ...patch });

const p = (patch: Partial<Priority>): Priority => ({ ...blankPriority(), ...patch });

const action = (patch: Partial<ActionItem>): ActionItem => ({
  id: "a1",
  text: "Something",
  bucket: "task",
  done: false,
  createdAt: NOW.toISOString(),
  ...patch,
});

describe("selectFocus — what to return to", () => {
  it("returns priority 1 when it is set and unfinished", () => {
    const day = dayWith({ priority1: p({ text: "Ship the store", done: false, goal: null }) });

    expect(selectFocus(day)).toEqual({
      kind: "priority",
      rank: 1,
      priority: day.priority1,
    });
  });

  it("moves to priority 2 once priority 1 is done", () => {
    const day = dayWith({
      priority1: p({ text: "Ship the store", done: true, goal: null }),
      priority2: p({ text: "Call the accountant", done: false, goal: null }),
    });

    const focus = selectFocus(day);
    expect(focus.kind).toBe("priority");
    if (focus.kind === "priority") expect(focus.rank).toBe(2);
  });

  it("prefers priority 1 even when priority 2 is also unfinished", () => {
    const day = dayWith({
      priority1: p({ text: "First", done: false, goal: null }),
      priority2: p({ text: "Second", done: false, goal: null }),
    });

    const focus = selectFocus(day);
    if (focus.kind === "priority") expect(focus.priority.text).toBe("First");
    else throw new Error("expected a priority");
  });

  it("skips a blank priority 1 and offers priority 2", () => {
    const day = dayWith({
      priority2: p({ text: "The only real one", done: false, goal: null }),
    });

    const focus = selectFocus(day);
    if (focus.kind === "priority") expect(focus.rank).toBe(2);
    else throw new Error("expected a priority");
  });

  it("treats whitespace-only text as unset", () => {
    const day = dayWith({ priority1: p({ text: "   ", done: false, goal: null }) });

    expect(selectFocus(day)).toEqual({ kind: "empty" });
  });

  it("returns empty when neither priority has been written yet", () => {
    expect(selectFocus(blankDay("2026-08-18"))).toEqual({ kind: "empty" });
  });

  it("reports done with the top unfinished project once both priorities are complete", () => {
    const day = dayWith({
      priority1: p({ text: "Done one", done: true, goal: null }),
      priority2: p({ text: "Done two", done: true, goal: null }),
      actions: [
        action({ id: "t1", text: "A task", bucket: "task" }),
        action({ id: "p1", text: "Rewrite the pricing page", bucket: "project" }),
        action({ id: "p2", text: "A later project", bucket: "project" }),
      ],
    });

    const focus = selectFocus(day);
    expect(focus.kind).toBe("done");
    if (focus.kind === "done") expect(focus.next?.text).toBe("Rewrite the pricing page");
  });

  it("offers nothing further when every project is finished", () => {
    const day = dayWith({
      priority1: p({ text: "Done", done: true, goal: null }),
      actions: [action({ id: "p1", bucket: "project", done: true })],
    });

    expect(selectFocus(day)).toEqual({ kind: "done", next: null });
  });

  it("does not offer a quick tick or a task as the next thing", () => {
    const day = dayWith({
      priority1: p({ text: "Done", done: true, goal: null }),
      actions: [
        action({ id: "q1", bucket: "quickTick" }),
        action({ id: "t1", bucket: "task" }),
      ],
    });

    expect(selectFocus(day)).toEqual({ kind: "done", next: null });
  });

  it("ignores a blank project when picking what is next", () => {
    const day = dayWith({
      priority1: p({ text: "Done", done: true, goal: null }),
      actions: [
        action({ id: "p1", text: "  ", bucket: "project" }),
        action({ id: "p2", text: "Real project", bucket: "project" }),
      ],
    });

    const focus = selectFocus(day);
    if (focus.kind === "done") expect(focus.next?.id).toBe("p2");
    else throw new Error("expected done");
  });
});

describe("parkDistraction — the intrusion gets a home", () => {
  it("appends the distraction as a quick tick", () => {
    const next = parkDistraction([], "Reply to Dan", NOW);

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ text: "Reply to Dan", bucket: "quickTick", done: false });
  });

  it("stamps createdAt from the injected clock, never its own", () => {
    const next = parkDistraction([], "Reply to Dan", NOW);

    expect(next[0].createdAt).toBe("2026-08-18T09:30:00.000Z");
  });

  it("trims surrounding whitespace", () => {
    expect(parkDistraction([], "   Book the dentist  ", NOW)[0].text).toBe("Book the dentist");
  });

  it("ignores an empty capture rather than storing a blank row", () => {
    const actions = [action({ id: "keep" })];

    expect(parkDistraction(actions, "   ", NOW)).toBe(actions);
  });

  it("keeps existing actions and their order", () => {
    const actions = [action({ id: "one" }), action({ id: "two" })];
    const next = parkDistraction(actions, "Third thing", NOW);

    expect(next.map((a) => a.id).slice(0, 2)).toEqual(["one", "two"]);
    expect(next).toHaveLength(3);
  });

  it("gives every parked item its own id", () => {
    const once = parkDistraction([], "First", NOW);
    const twice = parkDistraction(once, "Second", NOW);

    expect(twice[0].id).not.toBe(twice[1].id);
  });
});

describe("focusLadder — why this thing matters", () => {
  const week = (goal: string): Week => ({
    ...blankWeek("2026-W34"),
    work: { goal, actions: [] },
  });
  const quarter = (mainQuest: string): Quarter => ({
    ...blankQuarter("2026-Q3"),
    work: { mainQuest, sideQuests: [] },
  });

  it("stays silent when the priority is not linked to a domain", () => {
    expect(
      focusLadder(p({ text: "Ship it", done: false, goal: null }), week("A goal"), quarter("A quest")),
    ).toBeNull();
  });

  it("returns the linked week goal and quarter main quest", () => {
    expect(
      focusLadder(
        p({ text: "Ship it", done: false, goal: { category: "workMain" } }),
        week("Launch the beta"),
        quarter("Take Claro to real users"),
      ),
    ).toEqual({
      domainLabel: "Work Main Quest",
      goal: "Launch the beta",
      mainQuest: "Take Claro to real users",
    });
  });

  it("stays silent when the linked domain has neither a goal nor a main quest", () => {
    expect(
      focusLadder(p({ text: "Ship it", done: false, goal: { category: "workMain" } }), week("  "), quarter("")),
    ).toBeNull();
  });

  it("still shows the ladder when only one rung is filled in", () => {
    expect(
      focusLadder(p({ text: "Ship it", done: false, goal: { category: "workMain" } }), week("Launch the beta"), quarter("")),
    ).toEqual({ domainLabel: "Work Main Quest", goal: "Launch the beta", mainQuest: "" });
  });

  it("reads the life side when that is what the priority links to", () => {
    const w: Week = { ...blankWeek("2026-W34"), life: { goal: "Three runs", actions: [] } };
    const q: Quarter = { ...blankQuarter("2026-Q3"), life: { mainQuest: "Get strong", sideQuests: [] } };

    expect(focusLadder(p({ text: "Run", done: false, goal: { category: "lifeMain" } }), w, q)).toEqual({
      domainLabel: "Life Main Quest",
      goal: "Three runs",
      mainQuest: "Get strong",
    });
  });
});

describe("selectFocus — the third priority", () => {
  it("offers priority 3 once the first two are done", () => {
    const day = dayWith({
      priority1: p({ text: "One", done: true }),
      priority2: p({ text: "Two", done: true }),
      priority3: p({ text: "Three", done: false }),
    });

    expect(selectFocus(day)).toEqual({ kind: "priority", rank: 3, priority: day.priority3 });
  });

  it("skips a blank slot rather than letting it block the ones below", () => {
    const day = dayWith({ priority3: p({ text: "The only real one" }) });

    const focus = selectFocus(day);
    expect(focus.kind).toBe("priority");
    if (focus.kind === "priority") expect(focus.rank).toBe(3);
  });

  it("still prefers the earliest unfinished slot", () => {
    const day = dayWith({
      priority1: p({ text: "One", done: false }),
      priority2: p({ text: "Two", done: false }),
      priority3: p({ text: "Three", done: false }),
    });

    const focus = selectFocus(day);
    if (focus.kind === "priority") expect(focus.rank).toBe(1);
  });

  it("is done only when every written priority is done", () => {
    const day = dayWith({
      priority1: p({ text: "One", done: true }),
      priority2: p({ text: "Two", done: true }),
      priority3: p({ text: "Three", done: true }),
    });

    expect(selectFocus(day)).toEqual({ kind: "done", next: null });
  });
});
