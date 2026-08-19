import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useNow } from "@/hooks/use-now";
import { useClaro } from "@/lib/claro-store";
import * as sound from "@/lib/sound";
import {
  beginReturnBlock,
  closeSession,
  createInterruption,
  endBlockNow,
  isCounting,
  localTimeZone,
  markDistracted,
  pauseSession,
  resumeFocus,
  settleSession,
  startFocusSession,
} from "@/lib/focus-session";
import type {
  FocusOutcome,
  FocusPhase,
  FocusTargetRef,
  InterruptionReason,
} from "@/lib/types";

/**
 * Which sessions have already had their end handled, and whether there was
 * sound at the time.
 *
 * The hook is instantiated by several components at once (the header control
 * and the page both use it), so the end-of-block side effect has to be owned
 * somewhere they share. Without this the first instance to run would pause the
 * sound and every later instance would conclude there had never been any.
 */
const endedSessions = new Map<string, boolean>();

/**
 * The one canonical focus session, and everything that can be done to it.
 *
 * Every entry point — Today, Week, Quarter, the header — goes through this hook
 * and through the store's single `activeFocusSessionId`. There is nowhere for a
 * second timer to live: starting one while another is open replaces the
 * pointer, it does not add a clock.
 *
 * Ending or completing a block never writes to the thing being worked on. The
 * only path to a completed priority is the explicit choice on the end screen,
 * which is why `complete` returns the target rather than acting on it.
 */
export function useFocusSession() {
  const {
    state,
    sound: prefs,
    activeSession,
    startSession,
    updateSession,
    clearActiveSession,
    logInterruption,
    updateInterruption,
    today,
  } = useClaro();

  // The app's only clock. It ticks solely while something is actually counting.
  const now = useNow(activeSession && isCounting(activeSession) ? 1000 : null);

  /** Displayed state is settled immediately; the commit follows in the effect. */
  const session = activeSession && now ? settleSession(activeSession, now) : activeSession;

  /**
   * The interruption still waiting to be resolved. Derived from the store
   * rather than component state, so a refresh mid-interruption loses nothing.
   */
  const openInterruption = useMemo(() => {
    if (!session) return null;
    return (
      Object.values(state.interruptions)
        .filter((i) => i.focusSessionId === session.id && i.returnedAt === null)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
        .at(-1) ?? null
    );
  }, [session, state.interruptions]);

  // Advance the machine for time that really passed, including while the tab
  // was closed. `settleSession` is idempotent, so this is a no-op most ticks.
  useEffect(() => {
    if (!now || !activeSession) return;
    if (settleSession(activeSession, now) === activeSession) return;

    // Settle whatever is current at commit time, not the copy captured above —
    // the user may have hit "I got distracted" between render and this effect.
    updateSession((s) => settleSession(s, now));

    if (activeSession.phase === "returning" && openInterruption) {
      updateInterruption(openInterruption.id, {
        returnedAt: activeSession.returnBlockEndsAt ?? now.toISOString(),
      });
    }
  }, [now, activeSession, openInterruption, updateSession, updateInterruption]);

  const start = useCallback(
    (target: FocusTargetRef | null, plannedMs: number) => {
      startSession(
        startFocusSession({
          dayId: today,
          target,
          intention: target?.title ?? "",
          plannedMs,
          now: new Date(),
          timeZone: localTimeZone(),
        }),
      );
    },
    [startSession, today],
  );

  const distracted = useCallback(() => {
    if (!session) return;
    const at = new Date();
    updateSession((s) => markDistracted(s, at));
    logInterruption(createInterruption({ session, now: at, timeZone: localTimeZone() }));
  }, [session, updateSession, logInterruption]);

  const chooseReason = useCallback(
    (reason: InterruptionReason) => {
      if (openInterruption) updateInterruption(openInterruption.id, { reason });
    },
    [openInterruption, updateInterruption],
  );

  const takeReturnBlock = useCallback(() => {
    updateSession((s) => beginReturnBlock(s, new Date()));
    if (openInterruption) updateInterruption(openInterruption.id, { returnBlockStarted: true });
  }, [updateSession, updateInterruption, openInterruption]);

  const resumeAfterInterruption = useCallback(() => {
    const at = new Date();
    updateSession((s) => resumeFocus(s, at));
    if (openInterruption) {
      updateInterruption(openInterruption.id, { returnedAt: at.toISOString() });
    }
  }, [updateSession, updateInterruption, openInterruption]);

  /** Resolves the session. It never touches the priority or goal it was for. */
  /**
   * Sound belongs to the block, so it stops the moment the block ends rather
   * than when the user later picks an outcome. That is also the only moment the
   * optional chime is allowed to sound, and the only place worth noting whether
   * there was any sound to have an opinion about.
   */
  const [endedWithSound, setEndedWithSound] = useState(false);
  const lastPhase = useRef<FocusPhase | null>(null);

  useEffect(() => {
    const phase = session?.phase ?? null;
    const previous = lastPhase.current;
    lastPhase.current = phase;

    if (phase === "ended" && session) {
      // Handled once for the session, then agreed on by every instance.
      if (!endedSessions.has(session.id)) {
        const wasPlaying = sound.isPlaying();
        endedSessions.set(session.id, wasPlaying);
        if (wasPlaying) sound.pause();
        if (prefs.endChime) void sound.chime(prefs.volume, prefs.muted);
      }
      setEndedWithSound(endedSessions.get(session.id) ?? false);
      return;
    }

    // A new or resumed block starts the question fresh.
    if (phase === null || phase === "running") setEndedWithSound(false);
    void previous;
  }, [session, prefs.endChime, prefs.volume, prefs.muted]);

  /**
   * Resolves the session. It never touches the priority or goal it was for, and
   * it always leaves the audio silent: a session that is over must not keep
   * playing behind the next screen, including one the user simply walked away
   * from without letting it finish.
   */
  const close = useCallback(
    (outcome: FocusOutcome) => {
      if (session) endedSessions.delete(session.id);
      updateSession((s) => closeSession(s, outcome, new Date()));
      clearActiveSession();
      if (sound.isPlaying()) sound.pause();
      setEndedWithSound(false);
    },
    [session, updateSession, clearActiveSession],
  );

  return {
    session,
    now,
    openInterruption,
    /** The preferences the sound controls read and write, wherever they render. */
    prefs,
    /** True when the block that just finished had sound playing. */
    endedWithSound,
    /** Clears the question once it has been answered or skipped. */
    dismissSoundQuestion: useCallback(() => {
      if (session) endedSessions.delete(session.id);
      setEndedWithSound(false);
    }, [session]),
    /** True while a session exists and has not been resolved. */
    isLive: session !== null && session.phase !== "closed",
    start,
    pause: useCallback(() => updateSession((s) => pauseSession(s, new Date())), [updateSession]),
    resume: useCallback(() => updateSession((s) => resumeFocus(s, new Date())), [updateSession]),
    endBlock: useCallback(() => updateSession((s) => endBlockNow(s, new Date())), [updateSession]),
    distracted,
    chooseReason,
    takeReturnBlock,
    resumeAfterInterruption,
    close,
  };
}
