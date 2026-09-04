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
  blankCheckIn,
  blankCycle,
  blankMonthPlan,
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
import { matchKey } from "./cycle-guidance";
import { removeHabitCompletions, toggleCompletion } from "./habits";
import { queueCarried, takeCarried } from "./rollover";
import type {
  GuidanceCard,
  MatchAnswer,
  ClaroState,
  CycleCheckIn,
  CycleEntry,
  CycleState,
  EstimateSnapshot,
  Day,
  FocusPrefs,
  Habit,
  FocusSession,
  ISODate,
  Interruption,
  MonthPlan,
  Quarter,
  SoundFeedback,
  SoundPrefs,
  SoundPreset,
  QuarterId,
  Week,
  WeekId,
} from "./types";

export type SaveStatus = "idle" | "saved" | "error";

/**
 * How many steps back the app can go.
 *
 * Every step holds a whole `ClaroState`, which is small enough that a bounded
 * stack costs nothing worth measuring, and deep enough that a run of deletions
 * can all be taken back.
 */
export const UNDO_LIMIT = 25;

export type UndoStep = {
  /** Ticks up, so a view can tell a fresh action from the same one re-rendered. */
  id: number;
  /** What is being undone, in the words the user would use. */
  label: string;
  state: ClaroState;
};

type ClaroContextValue = {
  /** False during SSR and the first client render. Views must not render until true. */
  ready: boolean;
  state: ClaroState;
  /** Today's date id. Empty string until `ready`. */
  today: ISODate;
  saveStatus: SaveStatus;

  /**
   * Taking something back.
   *
   * `recordUndo` snapshots the state *before* a destructive change, so the call
   * site marks the change rather than the store guessing which ones matter.
   * Editing text is not on the list: retyping is its own undo, and recording
   * every keystroke would bury the deletion somebody actually wants back.
   */
  recordUndo: (label: string) => void;
  undo: () => void;
  canUndo: boolean;
  /** The most recent undoable step, for the bar that offers it. */
  lastUndo: { id: number; label: string } | null;

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

  /**
   * The block length carried between sessions. Read by every entry point, so a
   * block started from Quarter is the length the user last chose, not 25.
   */
  focusPrefs: FocusPrefs;
  setFocusPrefs: (patch: Partial<FocusPrefs>) => void;
  /** Habits. Completions are one row per habit per day. */
  addHabit: (habit: Habit) => void;
  patchHabit: (id: string, patch: Partial<Habit>) => void;
  /** Deletes the habit and its history together — no orphaned completions. */
  deleteHabit: (id: string) => void;
  toggleHabitDone: (habitId: string, dayId: ISODate, now: Date) => void;

  /** A month's calm intention. One record per month, created on first write. */
  monthPlan: (id: string) => MonthPlan;
  updateMonthPlan: (id: string, recipe: (p: MonthPlan) => MonthPlan) => void;

  /** Private cycle awareness, kept apart from planning and focus records. */
  cycle: CycleState;
  setCycleEnabled: (enabled: boolean, now: Date) => void;
  /** Whether cycle notes may sync. Null withholds them from every upload. */
  setCycleSyncConsent: (at: string | null) => void;
  logCycleStart: (entry: CycleEntry) => void;
  /** Replaces the logged starts wholesale. Used by add, edit and delete. */
  setCycleEntries: (entries: Record<string, CycleEntry>) => void;
  writeGuidanceMatch: (
    card: GuidanceCard,
    phase: string,
    dayId: ISODate,
    answer: MatchAnswer,
    now: Date,
  ) => void;
  deleteCycleEntry: (id: string) => void;
  /** An optional private note about a day. Never written anywhere else. */
  writeCycleCheckIn: (dayId: ISODate, patch: Partial<CycleCheckIn>, now: Date) => void;
  /** One answer to one guide prompt. Blank clears it rather than storing "". */
  writeGuideAnswer: (promptId: string, text: string) => void;
  /** Replace the entire snapshot. Sync only, after a safe plan is chosen. */
  replaceState: (next: ClaroState) => void;
  /** Marks the current estimate as seen, so a change is announced only once. */
  acknowledgeCycleEstimate: (snapshot: EstimateSnapshot) => void;
  /** The typical length the user stated, used until their own gaps can speak. */
  setCycleLength: (days: number | null) => void;
  deleteAllCycleData: () => void;

  sound: SoundPrefs;
  setSound: (patch: Partial<SoundPrefs>) => void;

  /**
   * Named combinations the user saved. Applied only when they choose one:
   * nothing switches a preset from a project, task, energy, calendar or cycle.
   */
  soundPresets: Record<string, SoundPreset>;
  addPreset: (preset: SoundPreset) => void;
  patchPreset: (id: string, patch: Partial<SoundPreset>) => void;
  deletePreset: (id: string) => void;

  /** Private answers to the post-session question. Nothing reads them back yet. */
  recordSoundFeedback: (feedback: SoundFeedback) => void;

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
    /*
     * Nothing is carried automatically any more.
     *
     * Unfinished work now moves only through "Close my day", where the user
     * decides item by item. An automatic rollover would put the same work on
     * two days at once, which is exactly the problem the close flow exists to
     * fix, so it is deliberately not called here.
     */
    setSnap({ state: loadState(), today: formatDayId(new Date()) });
  }, []);

  // A tab left open past midnight should roll over to the new day on its own.
  useEffect(() => {
    if (!snap) return;
    const tick = setInterval(() => {
      const now = formatDayId(new Date());
      setSnap((prev) => (prev && prev.today !== now ? { ...prev, today: now } : prev));
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

  // A mirror of the live snapshot, so recording an undo never has to depend on
  // the state it is capturing and re-create every handler that uses it.
  const snapRef = useRef<Snapshot | null>(null);
  snapRef.current = snap;

  const [undoStack, setUndoStack] = useState<UndoStep[]>([]);
  const undoId = useRef(0);

  const recordUndo = useCallback((label: string) => {
    const current = snapRef.current;
    if (!current) return;
    undoId.current += 1;
    const step: UndoStep = { id: undoId.current, label, state: current.state };
    setUndoStack((stack) => [...stack, step].slice(-UNDO_LIMIT));
  }, []);

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      const step = stack[stack.length - 1];
      if (!step) return stack;
      setSnap((prev) => (prev ? { ...prev, state: step.state } : prev));
      return stack.slice(0, -1);
    });
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

  const setFocusPrefs = useCallback((patch: Partial<FocusPrefs>) => {
    setSnap((prev) =>
      prev
        ? {
            ...prev,
            state: { ...prev.state, focusPrefs: { ...prev.state.focusPrefs, ...patch } },
          }
        : prev,
    );
  }, []);

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
    recordUndo("Habit deleted");
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

  /** Read returns a blank plan; only a write materialises one. */
  const monthPlan = useCallback(
    (id: string) => state.monthPlans[id] ?? blankMonthPlan(id, new Date(0)),
    [state],
  );

  const updateMonthPlan = useCallback((id: string, recipe: (p: MonthPlan) => MonthPlan) => {
    setSnap((prev) => {
      if (!prev) return prev;
      const current = prev.state.monthPlans[id] ?? blankMonthPlan(id, new Date());
      return {
        ...prev,
        state: { ...prev.state, monthPlans: { ...prev.state.monthPlans, [id]: recipe(current) } },
      };
    });
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
              ...prev.state.cycle.settings,
              enabled,
              // Opting out keeps the entries; only the explicit delete removes them.
              optedInAt: enabled ? (prev.state.cycle.settings.optedInAt ?? now.toISOString()) : prev.state.cycle.settings.optedInAt,
            },
          },
        },
      };
    });
  }, []);

  /**
   * Whether cycle notes may leave the device, decided explicitly.
   *
   * Separate from `setCycleEnabled` because they are different questions asked
   * at different times. Somebody who turned cycle notes on before sync existed
   * agreed to a screen promising the data stayed here and went nowhere; that
   * cannot be read forward as agreement to upload it. Passing null withdraws
   * consent, after which `forUpload` stops including the branch again.
   */
  const setCycleSyncConsent = useCallback((at: string | null) => {
    setSnap((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        state: {
          ...prev.state,
          cycle: {
            ...prev.state.cycle,
            settings: { ...prev.state.cycle.settings, syncConsentAt: at },
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

  const setCycleEntries = useCallback((entries: Record<string, CycleEntry>) => {
    setSnap((prev) =>
      prev ? { ...prev, state: { ...prev.state, cycle: { ...prev.state.cycle, entries } } } : prev,
    );
  }, []);

  const deleteCycleEntry = useCallback((id: string) => {
    recordUndo("Period deleted");
    setSnap((prev) => {
      if (!prev) return prev;
      const entries = { ...prev.state.cycle.entries };
      delete entries[id];
      return { ...prev, state: { ...prev.state, cycle: { ...prev.state.cycle, entries } } };
    });
  }, []);

  const writeCycleCheckIn = useCallback(
    (dayId: ISODate, patch: Partial<CycleCheckIn>, now: Date) => {
      setSnap((prev) => {
        if (!prev) return prev;
        const current = prev.state.cycle.checkIns[dayId] ?? blankCheckIn(dayId, now);
        return {
          ...prev,
          state: {
            ...prev.state,
            cycle: {
              ...prev.state.cycle,
              checkIns: {
                ...prev.state.cycle.checkIns,
                [dayId]: { ...current, ...patch, dayId, updatedAt: now.toISOString() },
              },
            },
          },
        };
      });
    },
    [],
  );

  /**
   * One answer to one of the guide's reflective prompts.
   *
   * A blank answer removes the key rather than storing an empty string, so
   * clearing a box leaves no trace of having written in it. Nothing reads
   * these back except the prompt that wrote them: they are not scored, not
   * summarised, and never used to change anything on any other screen.
   */
  /**
   * Swap the whole snapshot for one that came from somewhere else.
   *
   * Only sync uses this, and only after `planSignIn` has decided it is safe:
   * either the device holds nothing, or the person was asked and chose. It is
   * deliberately blunt, because a partial merge across fourteen top-level keys
   * is a thing that would be wrong in ways nobody could see.
   */
  const replaceState = useCallback((next: ClaroState) => {
    setSnap((prev) => (prev ? { ...prev, state: next } : prev));
  }, []);

  const writeGuideAnswer = useCallback((promptId: string, text: string) => {
    setSnap((prev) => {
      if (!prev) return prev;
      const next = { ...prev.state.cycle.guideAnswers };
      if (text.trim()) next[promptId] = text;
      else delete next[promptId];
      return {
        ...prev,
        state: { ...prev.state, cycle: { ...prev.state.cycle, guideAnswers: next } },
      };
    });
  }, []);

  /**
   * What the reader said about one card today.
   *
   * Answering again on the same day corrects the earlier answer rather than
   * stacking beside it, which is what the `card:dayId` key buys. Nothing else
   * in the app reads this: it changes the wording of the card that was
   * answered, and nothing more.
   */
  const writeGuidanceMatch = useCallback(
    (card: GuidanceCard, phase: string, dayId: ISODate, answer: MatchAnswer, now: Date) => {
      setSnap((prev) => {
        if (!prev) return prev;
        const key = matchKey(card, dayId);
        return {
          ...prev,
          state: {
            ...prev.state,
            cycle: {
              ...prev.state.cycle,
              guidanceMatches: {
                ...prev.state.cycle.guidanceMatches,
                [key]: {
                  id: key,
                  card,
                  phase,
                  dayId,
                  answer,
                  answeredAt: now.toISOString(),
                },
              },
            },
          },
        };
      });
    },
    [],
  );

  /** The cycle length the user typed in, or null to go back to their own gaps. */
  const setCycleLength = useCallback((cycleLength: number | null) => {
    setSnap((prev) =>
      prev
        ? {
            ...prev,
            state: {
              ...prev.state,
              cycle: {
                ...prev.state.cycle,
                settings: { ...prev.state.cycle.settings, cycleLength },
              },
            },
          }
        : prev,
    );
  }, []);

  /**
   * Records the estimate the user has just been shown, so the same change is
   * not reported again. Writes nothing but the snapshot.
   */
  const acknowledgeCycleEstimate = useCallback((snapshot: EstimateSnapshot) => {
    setSnap((prev) =>
      prev
        ? { ...prev, state: { ...prev.state, cycle: { ...prev.state.cycle, lastSeen: snapshot } } }
        : prev,
    );
  }, []);

  /** Removes every cycle record and the opt-in itself. */
  const deleteAllCycleData = useCallback(() => {
    recordUndo("All cycle data deleted");
    setSnap((prev) =>
      prev
        ? {
            ...prev,
            state: {
              ...prev.state,
              // Everything goes: entries, private notes and the opt-in itself.
            cycle: blankCycle(),
            },
          }
        : prev,
    );
  }, []);

  const addPreset = useCallback((preset: SoundPreset) => {
    setSnap((prev) =>
      prev
        ? {
            ...prev,
            state: {
              ...prev.state,
              soundPresets: { ...prev.state.soundPresets, [preset.id]: preset },
            },
          }
        : prev,
    );
  }, []);

  const patchPreset = useCallback((id: string, patch: Partial<SoundPreset>) => {
    setSnap((prev) => {
      if (!prev) return prev;
      const current = prev.state.soundPresets[id];
      if (!current) return prev;
      return {
        ...prev,
        state: {
          ...prev.state,
          // The id is never patched: it is the preset's identity.
          soundPresets: { ...prev.state.soundPresets, [id]: { ...current, ...patch, id } },
        },
      };
    });
  }, []);

  const deletePreset = useCallback((id: string) => {
    recordUndo("Sound preset deleted");
    setSnap((prev) => {
      if (!prev) return prev;
      const soundPresets = { ...prev.state.soundPresets };
      delete soundPresets[id];
      return { ...prev, state: { ...prev.state, soundPresets } };
    });
  }, []);

  const recordSoundFeedback = useCallback((feedback: SoundFeedback) => {
    setSnap((prev) =>
      prev
        ? {
            ...prev,
            state: {
              ...prev.state,
              soundFeedback: { ...prev.state.soundFeedback, [feedback.id]: feedback },
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
      recordUndo,
      undo,
      canUndo: undoStack.length > 0,
      lastUndo:
        undoStack.length > 0
          ? { id: undoStack[undoStack.length - 1].id, label: undoStack[undoStack.length - 1].label }
          : null,
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
      focusPrefs: state.focusPrefs,
      setFocusPrefs,
      addHabit,
      patchHabit,
      deleteHabit,
      toggleHabitDone,
      monthPlan,
      updateMonthPlan,
      cycle: state.cycle,
      setCycleEnabled,
      setCycleSyncConsent,
      logCycleStart,
      setCycleEntries,
      writeGuidanceMatch,
      deleteCycleEntry,
      writeCycleCheckIn,
      writeGuideAnswer,
      replaceState,
      acknowledgeCycleEstimate,
      setCycleLength,
      deleteAllCycleData,
      sound: state.sound,
      setSound,
      soundPresets: state.soundPresets,
      addPreset,
      patchPreset,
      deletePreset,
      recordSoundFeedback,
      resetAll,
    }),
    [
      ready,
      state,
      recordUndo,
      undo,
      undoStack,
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
      setFocusPrefs,
      addHabit,
      patchHabit,
      deleteHabit,
      toggleHabitDone,
      monthPlan,
      updateMonthPlan,
      setCycleEnabled,
      setCycleSyncConsent,
      logCycleStart,
      setCycleEntries,
      deleteCycleEntry,
      writeCycleCheckIn,
      writeGuideAnswer,
      replaceState,
      acknowledgeCycleEstimate,
      setCycleLength,
      deleteAllCycleData,
      setSound,
      addPreset,
      patchPreset,
      deletePreset,
      recordSoundFeedback,
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
