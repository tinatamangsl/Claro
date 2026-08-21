import { describe, expect, it } from "vitest";

import { changesSince, currentSnapshot, hasChanges, snapshotNow } from "./cycle-recalibration";
import { blankCycle } from "./storage";
import type { CycleState, ISODate } from "./types";

type Spec = ISODate | [ISODate, ISODate | null];

const cycleWith = (...specs: Spec[]): CycleState => ({
  ...blankCycle(),
  settings: { enabled: true, optedInAt: "2026-01-01T09:00:00.000Z", cycleLength: null },
  entries: Object.fromEntries(
    specs.map((spec, i) => {
      const [startDate, endDate] = Array.isArray(spec) ? spec : [spec, null];
      return [`e${i}`, { id: `e${i}`, startDate, endDate, loggedAt: "x" }];
    }),
  ),
});

const NOW = new Date("2026-08-21T09:00:00.000Z");

describe("noticing a change", () => {
  it("says nothing at all when nothing moved", () => {
    const cycle = cycleWith("2026-06-01", "2026-06-29", "2026-07-27");
    const seen = { ...cycle, lastSeen: snapshotNow(cycle, NOW) };

    expect(changesSince(seen)).toEqual([]);
    expect(hasChanges(seen)).toBe(false);
  });

  it("says nothing when there is not enough history to estimate from", () => {
    expect(changesSince(cycleWith("2026-06-01"))).toEqual([]);
    expect(changesSince(blankCycle())).toEqual([]);
  });

  it("reports the first estimate once it exists", () => {
    const changes = changesSince(cycleWith("2026-06-01", "2026-06-29", "2026-07-27"));

    expect(changes.map((c) => c.id)).toContain("first-estimate");
    expect(changes[0].body).toContain("4 weeks");
    expect(changes[0].body).toContain("dates you entered");
  });

  it("reports a moved median, naming both numbers", () => {
    // Two gaps of 28 give a median of 28. Two later gaps of 35 pull the median
    // of four to 31.5, which rounds to 32. A median moves slowly on purpose.
    const before = cycleWith("2026-03-01", "2026-03-29", "2026-04-26");
    const after: CycleState = {
      ...cycleWith("2026-03-01", "2026-03-29", "2026-04-26", "2026-05-31", "2026-07-05"),
      lastSeen: snapshotNow(before, NOW),
    };

    const moved = changesSince(after).find((c) => c.id === "gap-moved");
    expect(moved).toBeDefined();
    expect(moved!.body).toContain("from 28 to 32 days");
    expect(moved!.body).toContain("across 4 recorded gaps");
    // And it keeps the two numbers apart while it does so.
    expect(moved!.body).toContain("first day of one period to the first day of the next");
  });

  it("reports a changed duration range without judging it", () => {
    const before = cycleWith(["2026-06-01", "2026-06-04"], "2026-06-29", "2026-07-27");
    const after: CycleState = {
      ...cycleWith(["2026-06-01", "2026-06-04"], ["2026-06-29", "2026-07-04"], "2026-07-27"),
      lastSeen: snapshotNow(before, NOW),
    };

    const change = changesSince(after).find((c) => c.id === "durations");
    expect(change!.body).toContain("4 to 6 days");
    expect(change!.body).toContain("passes no judgement");
  });

  it("never promises to change a plan, on any card", () => {
    const before = cycleWith("2026-06-01", "2026-06-29", "2026-07-27");
    const after: CycleState = {
      ...cycleWith(["2026-06-01", "2026-06-04"], "2026-06-29", "2026-07-27", "2026-09-03"),
      lastSeen: snapshotNow(before, NOW),
    };

    const text = changesSince(after)
      .map((c) => `${c.title} ${c.body}`)
      .join(" ")
      .toLowerCase();

    for (const banned of [
      "prioritis",
      "prioritiz",
      "will schedule",
      "apply to",
      "your calendar",
      "high-stakes",
      "low-load",
      "protect",
      "claro has learned",
      "we recommend",
    ]) {
      expect(text).not.toContain(banned);
    }
  });

  it("makes no physiological claim on any card", () => {
    const after: CycleState = cycleWith(["2026-06-01", "2026-06-04"], "2026-06-29", "2026-07-27");
    const text = changesSince(after)
      .map((c) => `${c.title} ${c.body}`)
      .join(" ")
      .toLowerCase();

    for (const banned of ["luteal", "follicular", "ovulat", "hormone", "fertil", "your body"]) {
      expect(text).not.toContain(banned);
    }
  });
});

describe("the snapshot", () => {
  it("records the numbers the user was shown", () => {
    const cycle = cycleWith(["2026-06-01", "2026-06-04"], "2026-06-29", "2026-07-27");

    expect(currentSnapshot(cycle)).toEqual({
      typicalGap: 28,
      basedOn: 2,
      durationMin: 4,
      durationMax: 4,
      observations: 0,
    });
  });

  it("stamps when it was taken, so a later change can be measured against it", () => {
    expect(snapshotNow(cycleWith(), NOW).seenAt).toBe(NOW.toISOString());
  });

  it("clears the change once it has been acknowledged", () => {
    const cycle = cycleWith("2026-06-01", "2026-06-29", "2026-07-27");
    expect(hasChanges(cycle)).toBe(true);

    expect(hasChanges({ ...cycle, lastSeen: snapshotNow(cycle, NOW) })).toBe(false);
  });
});
