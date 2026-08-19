import { describe, expect, it } from "vitest";

import {
  addMaintenance,
  addTask,
  clearPlan,
  focusBlockMs,
  focusSlots,
  isPlanned,
  maintenanceOf,
  meaningfulProject,
  planProgress,
  scheduleFocusBlock,
  setFocusHours,
  setMeaningfulProject,
  startPlan,
  tasksOf,
} from "./plan333";
import { blankDay } from "./storage";
import type { Day } from "./types";

const NOW = new Date("2026-08-19T09:00:00.000Z");
const day = (): Day => blankDay("2026-08-19");

describe("starting a 3-3-3 day", () => {
  it("marks the day without touching any work already on it", () => {
    const before = setMeaningfulProject(day(), "Ship the store", NOW);
    const after = startPlan(before, NOW);

    expect(isPlanned(after)).toBe(true);
    expect(meaningfulProject(after)).toBe("Ship the store");
  });

  it("defaults to three hours but does not require them", () => {
    expect(startPlan(day(), NOW).plan333?.focusHours).toBe(3);
    expect(startPlan(day(), NOW, 1.5).plan333?.focusHours).toBe(1.5);
  });

  it("does not restart a plan that already exists", () => {
    const planned = startPlan(day(), NOW);
    expect(startPlan(planned, new Date("2026-08-19T15:00:00.000Z"))).toBe(planned);
  });

  it("lets the hours be changed to suit the actual day", () => {
    const planned = setFocusHours(startPlan(day(), NOW), 1);
    expect(planned.plan333?.focusHours).toBe(1);
  });

  it("keeps the hours within something a day can hold", () => {
    const planned = startPlan(day(), NOW);
    expect(setFocusHours(planned, 0).plan333?.focusHours).toBe(0.5);
    expect(setFocusHours(planned, 99).plan333?.focusHours).toBe(12);
  });

  it("leaves every piece of work behind when the plan is cleared", () => {
    let d = startPlan(day(), NOW);
    d = setMeaningfulProject(d, "Ship the store", NOW);
    d = addTask(d, "Draft the note", NOW);

    const cleared = clearPlan(d);
    expect(isPlanned(cleared)).toBe(false);
    expect(meaningfulProject(cleared)).toBe("Ship the store");
    expect(tasksOf(cleared)).toHaveLength(1);
  });
});

describe("filling in the three areas", () => {
  it("puts the meaningful project in priority 1, not a second place", () => {
    const d = setMeaningfulProject(day(), "Ship the store", NOW);

    expect(d.priority1.text).toBe("Ship the store");
    expect(d.priority1.id).not.toBeNull();
  });

  it("puts shorter tasks and maintenance in different buckets", () => {
    let d = addTask(day(), "Draft the release note", NOW);
    d = addMaintenance(d, "Empty the inbox", NOW);

    expect(tasksOf(d).map((t) => t.text)).toEqual(["Draft the release note"]);
    expect(maintenanceOf(d).map((t) => t.text)).toEqual(["Empty the inbox"]);
    expect(d.actions).toHaveLength(2);
  });

  it("ignores blank entries rather than creating empty rows", () => {
    const d = addTask(day(), "   ", NOW);
    expect(d.actions).toHaveLength(0);
  });

  it("stamps where the work came from", () => {
    const d = addTask(day(), "Draft the note", NOW);
    expect(d.actions[0].originDayId).toBe("2026-08-19");
  });
});

describe("progress, without a score", () => {
  it("reports what is there, and calls an incomplete plan incomplete without penalty", () => {
    let d = setMeaningfulProject(day(), "Ship it", NOW);
    d = addTask(d, "One", NOW);

    expect(planProgress(d)).toEqual({
      hasProject: true,
      tasks: 1,
      maintenance: 0,
      complete: false,
    });
  });

  it("is complete once all three areas hold something", () => {
    let d = setMeaningfulProject(day(), "Ship it", NOW);
    for (const t of ["One", "Two", "Three"]) d = addTask(d, t, NOW);
    for (const m of ["Inbox", "Washing", "Invoices"]) d = addMaintenance(d, m, NOW);

    expect(planProgress(d).complete).toBe(true);
  });

  it("counts work the user added the ordinary way, not only through the flow", () => {
    const d: Day = {
      ...day(),
      actions: [
        { id: "a", text: "Typed in directly", bucket: "task", done: false, createdAt: "x" },
      ],
    };

    expect(planProgress(d).tasks).toBe(1);
  });

  it("still counts work that is already done", () => {
    let d = addTask(day(), "One", NOW);
    d = { ...d, actions: d.actions.map((a) => ({ ...a, done: true })) };

    expect(planProgress(d).tasks).toBe(1);
  });
});

describe("scheduling the focus block", () => {
  it("asks for as many hours as the plan says", () => {
    const d = startPlan(day(), NOW, 3);
    expect(focusSlots(d, "09:00")).toEqual(["09:00", "10:00", "11:00"]);
  });

  it("adapts to a shorter plan", () => {
    const d = startPlan(day(), NOW, 1);
    expect(focusSlots(d, "14:00")).toEqual(["14:00"]);
  });

  it("stops at the end of the schedule grid rather than running past it", () => {
    const d = startPlan(day(), NOW, 5);
    expect(focusSlots(d, "21:00")).toEqual(["21:00", "22:00"]);
  });

  it("writes the project into the free hours", () => {
    let d = startPlan(setMeaningfulProject(day(), "Ship the store", NOW), NOW, 2);
    d = scheduleFocusBlock(d, "09:00");

    expect(d.scheduleItems.map((i) => i.time)).toEqual(["09:00", "10:00"]);
    expect(d.scheduleItems[0].text).toBe("Ship the store");
  });

  it("never overwrites an hour the user has already written in", () => {
    let d = startPlan(setMeaningfulProject(day(), "Ship the store", NOW), NOW, 3);
    d = { ...d, scheduleItems: [{ id: "s1", time: "10:00", text: "Call with Dan" }] };
    d = scheduleFocusBlock(d, "09:00");

    const at10 = d.scheduleItems.filter((i) => i.time === "10:00");
    expect(at10).toHaveLength(1);
    expect(at10[0].text).toBe("Call with Dan");
    expect(d.scheduleItems.map((i) => i.time).sort()).toEqual(["09:00", "10:00", "11:00"]);
  });

  it("does nothing without a project to schedule", () => {
    const d = startPlan(day(), NOW, 2);
    expect(scheduleFocusBlock(d, "09:00")).toBe(d);
  });

  it("turns the plan's hours into a focus block length", () => {
    expect(focusBlockMs(startPlan(day(), NOW, 3))).toBe(3 * 60 * 60_000);
    expect(focusBlockMs(startPlan(day(), NOW, 1.5))).toBe(90 * 60_000);
  });
});
