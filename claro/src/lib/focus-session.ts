/**
 * The focus session state machine.
 *
 * Everything here is pure and takes `now` explicitly — no clock, no timers, no
 * React. The session stores absolute timestamps rather than a countdown, which
 * is what makes it survive a refresh: reload, recompute, carry on.
 */

import { newId } from "./id";
import {
  RETURN_BLOCK_MS,
  type FocusOutcome,
  type FocusSession,
  type ISODate,
  type FocusTargetRef,
  type Interruption,
} from "./types";

const iso = (d: Date) => d.toISOString();
const ms = (value: string) => Date.parse(value);

/** The IANA zone of the browser. Call from an event handler, never during render. */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function startFocusSession(input: {
  dayId: ISODate;
  /** What the block is for, at any level of the hierarchy. */
  target: FocusTargetRef | null;
  intention: string;
  plannedMs: number;
  now: Date;
  timeZone: string;
}): FocusSession {
  const target = input.target;
  return {
    id: newId(),
    dayId: input.dayId,
    // Still written for a priority target so an older build reading this store
    // finds what it expects; `target` is what this build reads.
    priority:
      target?.kind === "priority" ? { dayId: target.dayId, rank: target.rank } : null,
    target,
    intention: input.intention,
    plannedMs: input.plannedMs,
    startedAt: iso(input.now),
    timeZone: input.timeZone,
    phase: "running",
    elapsedBeforeMs: 0,
    segmentStartedAt: iso(input.now),
    returnBlockEndsAt: null,
    endedAt: null,
    outcome: null,
  };
}

// ------------------------------------------------------------------ derived

export function mainElapsedMs(session: FocusSession, now: Date): number {
  const segment = session.segmentStartedAt
    ? Math.max(0, now.getTime() - ms(session.segmentStartedAt))
    : 0;
  return session.elapsedBeforeMs + segment;
}

export function mainRemainingMs(session: FocusSession, now: Date): number {
  return Math.max(0, session.plannedMs - mainElapsedMs(session, now));
}

export function returnRemainingMs(session: FocusSession, now: Date): number {
  if (!session.returnBlockEndsAt) return 0;
  return Math.max(0, ms(session.returnBlockEndsAt) - now.getTime());
}

/** 0 → just started, 1 → block spent. Used for the progress hairline. */
export function progressRatio(session: FocusSession, now: Date): number {
  if (session.plannedMs <= 0) return 1;
  return Math.min(1, mainElapsedMs(session, now) / session.plannedMs);
}

/** Still worth returning to — anything that isn't resolved. */
export function isSessionOpen(session: FocusSession | null): boolean {
  return session !== null && session.phase !== "closed";
}

export function isCounting(session: FocusSession): boolean {
  return session.phase === "running" || session.phase === "returning";
}

// -------------------------------------------------------------- transitions

/**
 * The block stops draining the moment the user says they were pulled away.
 * Time spent away costs them nothing — that is the whole point.
 */
export function markDistracted(session: FocusSession, now: Date): FocusSession {
  if (session.phase !== "running") return session;
  return {
    ...session,
    phase: "interrupted",
    elapsedBeforeMs: mainElapsedMs(session, now),
    segmentStartedAt: null,
  };
}

/**
 * A deliberate stop. Identical arithmetic to being distracted, but a different
 * state and no log entry — pausing to answer the door is not an interruption
 * worth recording, and recording it would make the log untrustworthy.
 */
export function pauseSession(session: FocusSession, now: Date): FocusSession {
  if (session.phase !== "running" && session.phase !== "returning") return session;
  return {
    ...session,
    phase: "paused",
    elapsedBeforeMs: mainElapsedMs(session, now),
    segmentStartedAt: null,
    returnBlockEndsAt: null,
  };
}

/** Stop the block now and go to the end choices, keeping the time actually spent. */
export function endBlockNow(session: FocusSession, now: Date): FocusSession {
  if (session.phase === "ended" || session.phase === "closed") return session;
  return {
    ...session,
    phase: "ended",
    endedAt: iso(now),
    elapsedBeforeMs: mainElapsedMs(session, now),
    segmentStartedAt: null,
    returnBlockEndsAt: null,
  };
}

export function beginReturnBlock(session: FocusSession, now: Date): FocusSession {
  if (session.phase !== "interrupted") return session;
  return {
    ...session,
    phase: "returning",
    returnBlockEndsAt: iso(new Date(now.getTime() + RETURN_BLOCK_MS)),
  };
}

/** Straight back into the remaining block, from a pause, an interruption or the on-ramp. */
export function resumeFocus(session: FocusSession, now: Date): FocusSession {
  const resumable = ["paused", "interrupted", "returning"];
  if (!resumable.includes(session.phase)) return session;
  return {
    ...session,
    phase: "running",
    segmentStartedAt: iso(now),
    returnBlockEndsAt: null,
  };
}

export function closeSession(
  session: FocusSession,
  outcome: FocusOutcome,
  now: Date,
): FocusSession {
  return {
    ...session,
    phase: "closed",
    outcome,
    segmentStartedAt: null,
    elapsedBeforeMs: mainElapsedMs(session, now),
  };
}

/**
 * Advance the session for time that actually passed — including while the tab
 * was closed. Idempotent, and returns the same object when nothing changed so
 * callers can commit only on a real transition.
 */
export function settleSession(session: FocusSession, now: Date): FocusSession {
  let next = session;

  if (
    next.phase === "returning" &&
    next.returnBlockEndsAt &&
    now.getTime() >= ms(next.returnBlockEndsAt)
  ) {
    // Resume from the instant the return block ended, not from now, so a long
    // absence doesn't quietly eat the rest of the block.
    next = {
      ...next,
      phase: "running",
      segmentStartedAt: next.returnBlockEndsAt,
      returnBlockEndsAt: null,
    };
  }

  if (next.phase === "running" && mainRemainingMs(next, now) === 0) {
    const segmentStart = next.segmentStartedAt ? ms(next.segmentStartedAt) : now.getTime();
    const ranOutAt = segmentStart + (next.plannedMs - next.elapsedBeforeMs);
    next = {
      ...next,
      phase: "ended",
      endedAt: iso(new Date(ranOutAt)),
      elapsedBeforeMs: next.plannedMs,
      segmentStartedAt: null,
    };
  }

  return next;
}

// ------------------------------------------------------------ interruptions

export function createInterruption(input: {
  session: FocusSession;
  now: Date;
  timeZone: string;
}): Interruption {
  return {
    id: newId(),
    focusSessionId: input.session.id,
    dayId: input.session.dayId,
    occurredAt: iso(input.now),
    timeZone: input.timeZone,
    reason: null,
    returnBlockStarted: false,
    returnedAt: null,
  };
}

// ------------------------------------------------------------------ display

/** mm:ss, rounded up so the final second is actually seen. */
export function formatRemaining(remaining: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
