import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { formatDayId } from "./dates";
import {
  clearState,
  emptyState,
  flushSave,
  loadState,
  readActiveFocusSession,
  readDay,
  readQuarter,
  readWeek,
  saveNow,
  scheduleSave,
  type SaveResult,
} from "./storage";
import { removeHabitCompletions, toggleCompletion } from "./habits";
import { applyRollover, queueCarried, takeCarried } from "./rollover";
import type {
  ClaroState,
  CycleEntry,
  CycleState,
  Day,
  Habit,
  FocusSession,
  ISODate,
  Interruption,
  Quarter,
  SoundPrefs,
  QuarterId,
  Week,
  WeekId,
} from "./types";

export type SaveStatus = "idle" | "saved" | "error";

type ClaroContextValue = {
  /** False during SSR and the first client render. Views must not render until true. */
  ready: boolean;
  state: ClaroState;
  /** Today's date id. Empty string until `ready`. */
  today: ISODate;
  saveStatus: SaveStatus;

  quarter: (id: QuarterId) => Quarter;
  week: (id: WeekId) => Week;
  day: (id: ISODate) => Day;

  updateQuarter: (id: QuarterId, recipe: (q: Quarter) => Quarter) => void;
  updateWeek: (id: WeekId, recipe: (w: Week) => Week) => void;
  updateDay: (id: ISODate, recipe: (d: Day) => Day) => void;

  /**
   * The one canonical focus session, or null. Every view reads it from here —
   * no component keeps timer state of its own, so a second timer cannot exist.
   */
  activeSession: FocusSession | null;
  startSession: (session: FocusSession) => void;
  updateSession: (recipe: (session: FocusSession) => FocusSession) => void;
  /** Stops pointing at the live session. The record itself is kept. */
  clearActiveSession: () => void;

  logInterruption: (interruption: Interruption) => void;
  updateInterruption: (id: string, patch: Partial<Interruption>) => void;

  /**
   * Schedule a carried item onto another day. It waits in that day's review
   * area rather than filling a slot, because the user deferred the decision —
   * not just the work.
   */
  moveCarried: (fromDayId: ISODate, toDayId: ISODate, itemId: string) => void;

  /** Habits. Completions are one row per habit per day. */
  addHabit: (habit: Habit) => void;
  patchHabit: (id: string, patch: Partial<Habit>) => void;
  /** Deletes the habit and its history together — no orphaned completions. */
  deleteHabit: (id: string) => void;
  toggleHabitDone: (habitId: string, dayId: ISODate, now: Date) => void;

  /** Private cycle awareness, kept apart from planning and focus records. */
  cycle: CycleState;
  setCycleEnabled: (enabled: boolean, now: Date) => void;
  logCycleStart: (entry: CycleEntry) => void;
  deleteCycleEntry: (id: string) => void;
  deleteAllCycleData: () => void;

  sound: SoundPrefs;
  setSound: (patch: Partial<SoundPrefs>) => void;

  resetAll: () => void;
};

const ClaroContext = createContext<ClaroContextValue | null>(null);

type Snapshot = { state: ClaroState; today: ISODate };

const EMPTY = emptyState();

export function ClaroProvider({ children }: { children: ReactNode }) {
  /**
   * The hydration contract: this is `null` on the server AND on the client's
   * first render, so both produce identical markup. Real data arrives in the
   * mount effect below, after hydration has committed.
   *
   * Reading localStorage in a `useState` initialiser instead would run during
   * the first client render and mismatch the server output — the single most
   * likely way to break this app.
   */
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  useEffect(() => {
    // Carry-forward is applied at load, not on a schedule: the browser is
    // usually shut at 10 PM, so "next time Claro is opened" is the only moment
    // that can be relied on.
    const now = new Date();
    const loaded = loadState();
    const rolled = applyRollover(loaded, now);
    setSnap({ state: rolled, today: formatDayId(now) });

    // The save effect below deliberately skips the first populated snapshot,
    // since that is only what we read off disk. A carry-forward is the
    // exception: it is a real change, and leaving it unwritten would mean the
    // source day is never marked as carried — so letting something go in the
    // review area would be undone by the very next load.
    if (rolled !== loaded) saveNow(rolled);
  }, []);

  // A tab left open past midnight — or past 10 PM — should catch up on its own.
  useEffect(() => {
    if (!snap) return;
    const tick = setInterval(() => {
      setSnap((prev) => {
        if (!prev) return prev;
        const now = new Date();
        const today = formatDayId(now);
        const state = applyRollover(prev.state, now);
        // `applyRollover` returns the same object when nothing moved, so an
        // idle tab neither re-renders nor writes to disk.
        if (state === prev.state && today === prev.today) return prev;
        return { state, today };
      });
    }, 60_000);
    return () => clearInterval(tick);
  }, [snap !== null]);

  const ready = snap !== null;
  const state = snap?.state ?? EMPTY;

  // Persist on change, debounced. Skipped on the very first populated snapshot,
  // which is just what we read off disk.
  const loadedOnce = useRef(false);
  useEffect(() => {
    if (!snap) return;
    if (!loadedOnce.current) {
      loadedOnce.current = true;
      return;
    }
    scheduleSave(snap.state, (result: SaveResult) => {
      setSaveStatus(result === "ok" ? "saved" : "error");
    });
  }, [snap?.state]);

  // Don't lose the last few hundred milliseconds of typing on tab close.
  useEffect(() => {
    const flush = () => flushSave();
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  const quarter = useCallback((id: QuarterId) => readQuarter(state, id), [state]);
  const week = useCallback((id: WeekId) => readWeek(state, id), [state]);
  const day = useCallback((id: ISODate) => readDay(state, id), [state]);

  /**
   * Read returns a blank record; only a write materialises one. Browsing to
   * next quarter therefore stores nothing until something is actually typed.
   */
  const updateQuarter = useCallback((id: QuarterId, recipe: (q: Quarter) => Quarter) => {
    setSnap((prev) => {
      if (!prev) return prev;
      const next = recipe(readQuarter(prev.state, id));
      return { ...prev, state: { ...prev.state, quarters: { ...prev.state.quarters, [id]: next } } };
    });
  }, []);

  const updateWeek = useCallback((id: WeekId, recipe: (w: Week) => Week) => {
    setSnap((prev) => {
      if (!prev) return prev;
      const next = recipe(readWeek(prev.state, id));
      return { ...prev, state: { ...prev.state, weeks: { ...prev.state.weeks, [id]: next } } };
    });
  }, []);

  const updateDay = useCallback((id: ISODate, recipe: (d: Day) => Day) => {
    setSnap((prev) => {
      if (!prev) return prev;
      const next = recipe(readDay(prev.state, id));
      return { ...prev, state: { ...prev.state, days: { ...prev.state.days, [id]: next } } };
    });
  }, []);

  const startSession = useCallback((session: FocusSession) => {
    setSnap((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        state: {
          ...prev.state,
          focusSessions: { ...prev.state.focusSessions, [session.id]: session },
          activeFocusSessionId: session.id,
        },
      };
    });
  }, []);

  const updateSession = useCallback((recipe: (session: FocusSession) => FocusSession) => {
    setSnap((prev) => {
      if (!prev) return prev;
      const current = readActiveFocusSession(prev.state);
      if (!current) return prev;

      const next = recipe(current);
      // Transitions are pure and idempotent; skip the write when nothing moved.
      if (next === current) return prev;

      return {
        ...prev,
        state: {
          ...prev.state,
          focusSessions: { ...prev.state.focusSessions, [next.id]: next },
        },
      };
    });
  }, []);

  const clearActiveSession = useCallback(() => {
    setSnap((prev) => {
      if (!prev || prev.state.activeFocusSessionId === null) return prev;
      return { ...prev, state: { ...prev.state, activeFocusSessionId: null } };
    });
  }, []);

  const logInterruption = useCallback((interruption: Interruption) => {
    setSnap((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        state: {
          ...prev.state,
          interruptions: { ...prev.state.interruptions, [interruption.id]: interruption },
        },
      };
    });
  }, []);

  const updateInterruption = useCallback((id: string, patch: Partial<Interruption>) => {
    setSnap((prev) => {
      if (!prev) return prev;
      const current = prev.state.interruptions[id];
      if (!current) return prev;
      return {
        ...prev,
        state: {
          ...prev.state,
          interruptions: { ...prev.state.interruptions, [id]: { ...current, ...patch } },
        },
      };
    });
  }, []);

  const moveCarried = useCallback(
    (fromDayId: ISODate, toDayId: ISODate, itemId: string) => {
      if (fromDayId === toDayId) return;
      setSnap((prev) => {
        if (!prev) return prev;
        const taken = takeCarried(readDay(prev.state, fromDayId), itemId);
        if (!taken.item) return prev;

        const destination = queueCarried(readDay(prev.state, toDayId), taken.item);
        return {
          ...prev,
          state: {
            ...prev.state,
            days: { ...prev.state.days, [fromDayId]: taken.day, [toDayId]: destination },
          },
        };
      });
    },
    [],
  );

  const addHabit = useCallback((habit: Habit) => {
    setSnap((prev) =>
      prev ? { ...prev, state: { ...prev.state, habits: { ...prev.state.habits, [habit.id]: habit } } } : prev,
    );
  }, []);

  const patchHabit = useCallback((id: string, patch: Partial<Habit>) => {
    setSnap((prev) => {
      if (!prev) return prev;
      const current = prev.state.habits[id];
      if (!current) return prev;
      return {
        ...prev,
        state: { ...prev.state, habits: { ...prev.state.habits, [id]: { ...current, ...patch } } },
      };
    });
  }, []);

  const deleteHabit = useCallback((id: string) => {
    setSnap((prev) => {
      if (!prev) return prev;
      const habits = { ...prev.state.habits };
      delete habits[id];
      return {
        ...prev,
        state: {
          ...prev.state,
          habits,
          habitCompletions: removeHabitCompletions(prev.state.habitCompletions, id),
        },
      };
    });
  }, []);

  const toggleHabitDone = useCallback((habitId: string, dayId: ISODate, now: Date) => {
    setSnap((prev) =>
      prev
        ? {
            ...prev,
            state: {
              ...prev.state,
              habitCompletions: toggleCompletion(prev.state.habitCompletions, habitId, dayId, now),
            },
          }
        : prev,
    );
  }, []);

  const setCycleEnabled = useCallback((enabled: boolean, now: Date) => {
    setSnap((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        state: {
          ...prev.state,
          cycle: {
            ...prev.state.cycle,
            settings: {
              enabled,
              // Opting out keeps the entries; only the explicit delete removes them.
              optedInAt: enabled ? (prev.state.cycle.settings.optedInAt ?? now.toISOString()) : prev.state.cycle.settings.optedInAt,
            },
          },
        },
      };
    });
  }, []);

  const logCycleStart = useCallback((entry: CycleEntry) => {
    setSnap((prev) =>
      prev
        ? {
            ...prev,
            state: {
              ...prev.state,
              cycle: {
                ...prev.state.cycle,
                entries: { ...prev.state.cycle.entries, [entry.id]: entry },
              },
            },
          }
        : prev,
    );
  }, []);

  const deleteCycleEntry = useCallback((id: string) => {
    setSnap((prev) => {
      if (!prev) return prev;
      const entries = { ...prev.state.cycle.entries };
      delete entries[id];
      return { ...prev, state: { ...prev.state, cycle: { ...prev.state.cycle, entries } } };
    });
  }, []);

  /** Removes every cycle record and the opt-in itself. */
  const deleteAllCycleData = useCallback(() => {
    setSnap((prev) =>
      prev
        ? {
            ...prev,
            state: {
              ...prev.state,
              cycle: { settings: { enabled: false, optedInAt: null }, entries: {} },
            },
          }
        : prev,
    );
  }, []);

  const setSound = useCallback((patch: Partial<SoundPrefs>) => {
    setSnap((prev) =>
      prev ? { ...prev, state: { ...prev.state, sound: { ...prev.state.sound, ...patch } } } : prev,
    );
  }, []);

  const resetAll = useCallback(() => {
    clearState();
    const fresh = emptyState();
    setSnap((prev) => (prev ? { ...prev, state: fresh } : prev));
    saveNow(fresh);
    setSaveStatus("saved");
  }, []);

  const value = useMemo<ClaroContextValue>(
    () => ({
      ready,
      state,
      today: snap?.today ?? "",
      saveStatus,
      quarter,
      week,
      day,
      updateQuarter,
      updateWeek,
      updateDay,
      activeSession: readActiveFocusSession(state),
      startSession,
      updateSession,
      clearActiveSession,
      logInterruption,
      updateInterruption,
      moveCarried,
      addHabit,
      patchHabit,
      deleteHabit,
      toggleHabitDone,
      cycle: state.cycle,
      setCycleEnabled,
      logCycleStart,
      deleteCycleEntry,
      deleteAllCycleData,
      sound: state.sound,
      setSound,
      resetAll,
    }),
    [
      ready,
      state,
      snap?.today,
      saveStatus,
      quarter,
      week,
      day,
      updateQuarter,
      updateWeek,
      updateDay,
      startSession,
      updateSession,
      clearActiveSession,
      logInterruption,
      updateInterruption,
      moveCarried,
      addHabit,
      patchHabit,
      deleteHabit,
      toggleHabitDone,
      setCycleEnabled,
      logCycleStart,
      deleteCycleEntry,
      deleteAllCycleData,
      setSound,
      resetAll,
    ],
  );

  return <ClaroContext.Provider value={value}>{children}</ClaroContext.Provider>;
}

export function useClaro(): ClaroContextValue {
  const value = useContext(ClaroContext);
  if (!value) throw new Error("useClaro must be used inside <ClaroProvider>");
  return value;
}
