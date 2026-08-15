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
  readDay,
  readQuarter,
  readWeek,
  saveNow,
  scheduleSave,
  type SaveResult,
} from "./storage";
import type { ClaroState, Day, ISODate, Quarter, QuarterId, Week, WeekId } from "./types";

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
