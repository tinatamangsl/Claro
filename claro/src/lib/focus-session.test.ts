import { describe, expect, it } from "vitest";

import {
  beginReturnBlock,
  closeSession,
  endBlockNow,
  mainElapsedMs,
  pauseSession,
  createInterruption,
  formatRemaining,
  isSessionOpen,
  mainRemainingMs,
  markDistracted,
  progressRatio,
  resumeFocus,
  returnRemainingMs,
  settleSession,
  startFocusSession,
} from "./focus-session";
import { FOCUS_BLOCK_MS, RETURN_BLOCK_MS, type FocusSession } from "./types";

const T0 = new Date("2026-08-18T09:00:00.000Z");
const at = (msFromStart: number) => new Date(T0.getTime() + msFromStart);
const MINUTE = 60_000;

const start = (plannedMs = FOCUS_BLOCK_MS): FocusSession =>
  startFocusSession({
    dayId: "2026-08-18",
    priority: { dayId: "2026-08-18", rank: 1 },
    intention: "Ship the store",
    plannedMs,
    now: T0,
    timeZone: "Europe/London",
  });

describe("starting a session", () => {
  it("begins counting immediately, with the full block remaining", () => {
    const s = start();

    expect(s.phase).toBe("running");
    expect(s.segmentStartedAt).toBe(T0.toISOString());
    expect(s.elapsedBeforeMs).toBe(0);
    expect(mainRemainingMs(s, T0)).toBe(FOCUS_BLOCK_MS);
  });

  it("records what it is for, and the local context it happened in", () => {
    const s = start();

    expect(s.dayId).toBe("2026-08-18");
    expect(s.priority).toEqual({ dayId: "2026-08-18", rank: 1 });
    expect(s.intention).toBe("Ship the store");
    expect(s.timeZone).toBe("Europe/London");
    expect(s.id).toBeTruthy();
  });

  it("supports the short just-begin block", () => {
    expect(mainRemainingMs(start(5 * MINUTE), T0)).toBe(5 * MINUTE);
  });

  it("counts down as real time passes", () => {
    const s = start();

    expect(mainRemainingMs(s, at(10 * MINUTE))).toBe(15 * MINUTE);
    expect(progressRatio(s, at(10 * MINUTE))).toBeCloseTo(10 / 25, 5);
  });

  it("never reports negative time left", () => {
    expect(mainRemainingMs(start(), at(90 * MINUTE))).toBe(0);
    expect(progressRatio(start(), at(90 * MINUTE))).toBe(1);
  });
});

describe("being distracted", () => {
  it("freezes the block instead of letting it drain", () => {
    const distracted = markDistracted(start(), at(10 * MINUTE));

    expect(distracted.phase).toBe("interrupted");
    expect(distracted.segmentStartedAt).toBeNull();
    expect(distracted.elapsedBeforeMs).toBe(10 * MINUTE);

    // An hour of being away costs the session nothing.
    expect(mainRemainingMs(distracted, at(70 * MINUTE))).toBe(15 * MINUTE);
  });

  it("waits indefinitely — an open interruption never times out on its own", () => {
    const distracted = markDistracted(start(), at(10 * MINUTE));

    expect(settleSession(distracted, at(600 * MINUTE))).toBe(distracted);
  });

  it("resumes the remaining block when the user comes straight back", () => {
    const resumed = resumeFocus(markDistracted(start(), at(10 * MINUTE)), at(12 * MINUTE));

    expect(resumed.phase).toBe("running");
    expect(resumed.segmentStartedAt).toBe(at(12 * MINUTE).toISOString());
    expect(mainRemainingMs(resumed, at(12 * MINUTE))).toBe(15 * MINUTE);
  });
});

describe("the five-minute way back in", () => {
  const distracted = () => markDistracted(start(), at(10 * MINUTE));

  it("runs for five minutes without touching the original block", () => {
    const returning = beginReturnBlock(distracted(), at(12 * MINUTE));

    expect(returning.phase).toBe("returning");
    expect(returnRemainingMs(returning, at(12 * MINUTE))).toBe(RETURN_BLOCK_MS);
    expect(returnRemainingMs(returning, at(14 * MINUTE))).toBe(3 * MINUTE);
    expect(mainRemainingMs(returning, at(14 * MINUTE))).toBe(15 * MINUTE);
  });

  it("hands back to the remaining original block when it ends", () => {
    const returning = beginReturnBlock(distracted(), at(12 * MINUTE));
    const settled = settleSession(returning, at(17 * MINUTE));

    expect(settled.phase).toBe("running");
    expect(settled.returnBlockEndsAt).toBeNull();
    // Resumes from the moment the return block ended, so no time is invented.
    expect(settled.segmentStartedAt).toBe(at(17 * MINUTE).toISOString());
    expect(mainRemainingMs(settled, at(17 * MINUTE))).toBe(15 * MINUTE);
  });

  it("is left alone while it is still running", () => {
    const returning = beginReturnBlock(distracted(), at(12 * MINUTE));

    expect(settleSession(returning, at(14 * MINUTE))).toBe(returning);
  });
});

describe("settling after the tab was closed", () => {
  it("ends the session at the moment the block actually ran out", () => {
    const settled = settleSession(start(), at(40 * MINUTE));

    expect(settled.phase).toBe("ended");
    expect(settled.endedAt).toBe(at(25 * MINUTE).toISOString());
    expect(mainRemainingMs(settled, at(40 * MINUTE))).toBe(0);
  });

  it("runs the return block and then the rest of the main block in one settle", () => {
    const returning = beginReturnBlock(markDistracted(start(), at(10 * MINUTE)), at(12 * MINUTE));

    // Closed the laptop mid return-block and came back an hour later.
    const settled = settleSession(returning, at(80 * MINUTE));

    expect(settled.phase).toBe("ended");
    // 17m: return block ends. 15m of main block left → ended at 32m.
    expect(settled.endedAt).toBe(at(32 * MINUTE).toISOString());
  });

  it("leaves a still-running session exactly as it was", () => {
    const s = start();

    expect(settleSession(s, at(5 * MINUTE))).toBe(s);
  });

  it("is idempotent", () => {
    const once = settleSession(start(), at(40 * MINUTE));

    expect(settleSession(once, at(90 * MINUTE))).toBe(once);
  });

  it("never reopens a closed session", () => {
    const closed = closeSession(settleSession(start(), at(40 * MINUTE)), "completed", at(41 * MINUTE));

    expect(settleSession(closed, at(200 * MINUTE))).toBe(closed);
  });
});

describe("finishing", () => {
  it("records how the session was resolved without touching the priority", () => {
    const ended = settleSession(start(), at(40 * MINUTE));
    const closed = closeSession(ended, "completed", at(41 * MINUTE));

    expect(closed.phase).toBe("closed");
    expect(closed.outcome).toBe("completed");
  });

  it("can be left without completing anything", () => {
    expect(closeSession(start(), "left", at(3 * MINUTE)).outcome).toBe("left");
  });

  it("knows which sessions are still worth resuming", () => {
    expect(isSessionOpen(null)).toBe(false);
    expect(isSessionOpen(start())).toBe(true);
    expect(isSessionOpen(markDistracted(start(), at(1 * MINUTE)))).toBe(true);
    expect(isSessionOpen(settleSession(start(), at(40 * MINUTE)))).toBe(true);
    expect(isSessionOpen(closeSession(start(), "left", at(1 * MINUTE)))).toBe(false);
  });
});

describe("the interruption record", () => {
  it("captures the session, the moment and the local context", () => {
    const s = start();
    const i = createInterruption({ session: s, now: at(10 * MINUTE), timeZone: "Europe/London" });

    expect(i.focusSessionId).toBe(s.id);
    expect(i.dayId).toBe("2026-08-18");
    expect(i.occurredAt).toBe(at(10 * MINUTE).toISOString());
    expect(i.timeZone).toBe("Europe/London");
    expect(i.id).toBeTruthy();
  });

  it("starts with no reason, no return block and no return", () => {
    const i = createInterruption({ session: start(), now: at(10 * MINUTE), timeZone: "UTC" });

    expect(i.reason).toBeNull();
    expect(i.returnBlockStarted).toBe(false);
    expect(i.returnedAt).toBeNull();
  });

  it("gives each interruption its own id", () => {
    const s = start();
    const a = createInterruption({ session: s, now: at(10 * MINUTE), timeZone: "UTC" });
    const b = createInterruption({ session: s, now: at(20 * MINUTE), timeZone: "UTC" });

    expect(a.id).not.toBe(b.id);
  });
});

describe("formatRemaining", () => {
  it("shows a full block before any time has passed", () => {
    expect(formatRemaining(FOCUS_BLOCK_MS)).toBe("25:00");
  });

  it("pads minutes and seconds", () => {
    expect(formatRemaining(65_000)).toBe("01:05");
    expect(formatRemaining(5_000)).toBe("00:05");
  });

  it("rounds up so the last second is visible", () => {
    expect(formatRemaining(500)).toBe("00:01");
    expect(formatRemaining(0)).toBe("00:00");
  });

  it("never shows negative time", () => {
    expect(formatRemaining(-9_000)).toBe("00:00");
  });
});

describe("pausing deliberately", () => {
  it("freezes the block without logging anything", () => {
    const paused = pauseSession(start(), at(10 * MINUTE));

    expect(paused.phase).toBe("paused");
    expect(paused.segmentStartedAt).toBeNull();
    expect(paused.elapsedBeforeMs).toBe(10 * MINUTE);
    expect(mainRemainingMs(paused, at(90 * MINUTE))).toBe(15 * MINUTE);
  });

  it("is a different state from being interrupted", () => {
    expect(pauseSession(start(), at(MINUTE)).phase).not.toBe(
      markDistracted(start(), at(MINUTE)).phase,
    );
  });

  it("can pause the return block too, so it is never a dead end", () => {
    const returning = beginReturnBlock(markDistracted(start(), at(10 * MINUTE)), at(12 * MINUTE));
    const paused = pauseSession(returning, at(13 * MINUTE));

    expect(paused.phase).toBe("paused");
    expect(paused.returnBlockEndsAt).toBeNull();
    // The original block is untouched by a paused return block.
    expect(mainRemainingMs(paused, at(99 * MINUTE))).toBe(15 * MINUTE);
  });

  it("never advances on its own, however long it sits", () => {
    const paused = pauseSession(start(), at(10 * MINUTE));

    expect(settleSession(paused, at(600 * MINUTE))).toBe(paused);
  });

  it("resumes into the remaining block", () => {
    const resumed = resumeFocus(pauseSession(start(), at(10 * MINUTE)), at(50 * MINUTE));

    expect(resumed.phase).toBe("running");
    expect(mainRemainingMs(resumed, at(50 * MINUTE))).toBe(15 * MINUTE);
  });

  it("does nothing to a session that is already finished", () => {
    const ended = settleSession(start(), at(40 * MINUTE));

    expect(pauseSession(ended, at(41 * MINUTE))).toBe(ended);
  });
});

describe("ending a block early", () => {
  it("goes straight to the end choices, keeping the time actually spent", () => {
    const ended = endBlockNow(start(), at(9 * MINUTE));

    expect(ended.phase).toBe("ended");
    expect(ended.endedAt).toBe(at(9 * MINUTE).toISOString());
    expect(ended.elapsedBeforeMs).toBe(9 * MINUTE);
    expect(ended.segmentStartedAt).toBeNull();
  });

  it("can end a paused block", () => {
    const ended = endBlockNow(pauseSession(start(), at(10 * MINUTE)), at(30 * MINUTE));

    expect(ended.phase).toBe("ended");
    expect(ended.elapsedBeforeMs).toBe(10 * MINUTE);
  });

  it("does not restart a block that already ended", () => {
    const ended = settleSession(start(), at(40 * MINUTE));

    expect(endBlockNow(ended, at(41 * MINUTE))).toBe(ended);
  });

  it("leaves the priority alone — ending is not completing", () => {
    expect(endBlockNow(start(), at(9 * MINUTE)).outcome).toBeNull();
  });
});

describe("elapsed time without a clock", () => {
  it("is exact for a paused session, so the progress bar cannot reset", () => {
    const paused = pauseSession(start(), at(10 * MINUTE));

    expect(mainElapsedMs(paused, at(10 * MINUTE))).toBe(paused.elapsedBeforeMs);
  });
});
