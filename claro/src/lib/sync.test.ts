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
  it("sends cycle notes with everything else", () => {
    /*
     * They used to be withheld behind a second consent, because they had been
     * collected under a screen promising they stayed on the device. That screen
     * now says they go to your account, and the user asked for one account
     * holding everything rather than a branch needing its own permission.
     */
    expect("cycle" in forUpload(withCycle(false))).toBe(true);
    expect(cycleMaySync(withCycle(false))).toBe(true);
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

  it("takes the account when both sides hold different work", () => {
    const local = withWork();
    const remote = forUpload({
      ...emptyState(),
      days: { "2026-09-04": { ...blankDay("2026-09-04"), notes: "something else" } },
    });

    /*
     * A banner used to ask which to keep. The user asked for it gone: devices
     * should agree without interviewing anybody. The account wins rather than
     * the device because it is the copy every other device already agrees
     * with, so preferring it converges; preferring the device would make
     * whichever browser was opened last the winner and let two of them flip
     * the account back and forth. What it costs is this device's edits since
     * its last sync, which `overwriteBackupKey` stashes before they go.
     */
    expect(planSignIn({ local, remote })).toEqual({ action: "pull" });
  });

  it("seeds the account only when there is nothing in it", () => {
    // The one case that still writes rather than reads on sign-in.
    expect(planSignIn({ local: withCycle(false), remote: null })).toEqual({ action: "push" });
  });
});
