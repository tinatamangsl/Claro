import { describe, expect, it } from "vitest";

import { cycleMaySync, forUpload, isUntouched, merge, planSignIn } from "./sync";
import { blankDay, emptyState } from "./storage";
import type { ClaroState } from "./types";

/** A state with something real written in it. */
const withWork = (): ClaroState => {
  const state = emptyState();
  const day = blankDay("2026-09-04");
  return { ...state, days: { "2026-09-04": { ...day, notes: "wrote something" } } };
};

const withCycle = (consented: boolean): ClaroState => {
  const state = withWork();
  return {
    ...state,
    cycle: {
      ...state.cycle,
      settings: {
        enabled: true,
        optedInAt: "2026-01-01T09:00:00.000Z",
        cycleLength: null,
        syncConsentAt: consented ? "2026-09-04T09:00:00.000Z" : null,
      },
      entries: { e0: { id: "e0", startDate: "2026-08-01", endDate: "2026-08-05", loggedAt: "x" } },
    },
  };
};

describe("telling a fresh browser from one holding work", () => {
  it("counts a blank store as untouched, whatever its schema version", () => {
    expect(isUntouched(emptyState())).toBe(true);
    expect(isUntouched({ ...emptyState(), version: 0 })).toBe(true);
  });

  it("counts anything written as touched", () => {
    expect(isUntouched(withWork())).toBe(false);
  });
});

describe("what leaves the device", () => {
  it("withholds cycle notes from somebody who has not agreed to send them", () => {
    const payload = forUpload(withCycle(false));

    // Absent, not blanked: see the merge tests below for why that matters.
    expect("cycle" in payload).toBe(false);
    expect(cycleMaySync(withCycle(false))).toBe(false);
  });

  it("sends them once they have agreed", () => {
    const payload = forUpload(withCycle(true));

    expect(payload.cycle?.entries.e0.startDate).toBe("2026-08-01");
    expect(cycleMaySync(withCycle(true))).toBe(true);
  });

  it("has nothing to withhold when cycle notes were never turned on", () => {
    const payload = forUpload(withWork());

    expect(cycleMaySync(withWork())).toBe(true);
    expect(payload.cycle).toBeTruthy();
  });

  it("still sends everything else while cycle notes are withheld", () => {
    const payload = forUpload(withCycle(false));

    expect(payload.days["2026-09-04"].notes).toBe("wrote something");
  });
});

describe("bringing the account's copy down", () => {
  it("keeps the device's cycle notes when the server was never given any", () => {
    const local = withCycle(false);
    const remote = forUpload(local);

    /*
     * The server holding no cycle notes means it was never told about them,
     * never that they were deleted. Reading that silence as an instruction to
     * erase would destroy exactly the data this feature is most careful with.
     */
    const merged = merge(local, remote);
    expect(merged.cycle.entries.e0.startDate).toBe("2026-08-01");
    expect(merged.cycle.settings.enabled).toBe(true);
  });

  it("takes the server's cycle notes when it has them", () => {
    const local = withCycle(true);
    const remote = forUpload({
      ...withCycle(true),
      cycle: { ...withCycle(true).cycle, entries: {} },
    });

    expect(Object.keys(merge(local, remote).cycle.entries)).toEqual([]);
  });
});

describe("what to do the moment somebody signs in", () => {
  it("seeds the account from this device when the account is empty", () => {
    expect(planSignIn({ local: withWork(), remote: null })).toEqual({ action: "push" });
  });

  it("takes the account's copy onto a browser with nothing in it", () => {
    const remote = forUpload(withWork());
    expect(planSignIn({ local: emptyState(), remote })).toEqual({ action: "pull" });
  });

  it("treats identical content as settled rather than as a clash", () => {
    const local = withWork();
    expect(planSignIn({ local, remote: forUpload(local) })).toEqual({ action: "pull" });
  });

  it("refuses to choose when both sides hold different work", () => {
    const local = withWork();
    const other = emptyState();
    const remote = forUpload({
      ...other,
      days: { "2026-09-04": { ...blankDay("2026-09-04"), notes: "something else" } },
    });

    /*
     * The one case with a wrong answer. Picking either side silently throws
     * away somebody's writing, so the decision goes back to them. Last write
     * wins would be smaller code and would eventually eat a quarter of
     * planning.
     */
    expect(planSignIn({ local, remote })).toEqual({ action: "ask" });
  });

  it("does not call a withheld cycle a conflict on its own", () => {
    // Same state either side; the only difference is the branch deliberately
    // not uploaded. That must not read as two competing versions.
    const local = withCycle(false);
    expect(planSignIn({ local, remote: forUpload(local) })).toEqual({ action: "pull" });
  });
});
