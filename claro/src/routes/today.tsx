import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo } from "react";

import { AppShell } from "@/components/AppShell";
import { EditableText } from "@/components/EditableText";
import { BucketColumn } from "@/components/today/ActionLists";
import { CarriedForwardBlock } from "@/components/today/CarriedForwardBlock";
import { FocusView } from "@/components/today/FocusView";
import { HabitsBlock } from "@/components/today/HabitsBlock";
import { NonNegotiablesBlock } from "@/components/today/NonNegotiablesBlock";
import { PrioritiesBlock } from "@/components/today/PrioritiesBlock";
import { ScheduleBlock } from "@/components/today/ScheduleBlock";
import { WellbeingBlock } from "@/components/today/WellbeingBlock";
import { useClaro } from "@/lib/claro-store";
import {
  formatDayDate,
  formatDayWeekday,
  formatQuarterShort,
  formatWeekNumber,
  quarterOfDay,
  shiftDayId,
  weekDayIds,
  weekOfDay,
} from "@/lib/dates";
import { parkDistraction, selectFocus } from "@/lib/focus";
import { createHabit } from "@/lib/habits";
import { writePriority } from "@/lib/priorities";
import {
  keepCarriedAsAction,
  letGoCarried,
  promoteCarried,
} from "@/lib/rollover";
import {
  beginReturnBlock,
  closeSession,
  createInterruption,
  endBlockNow,
  formatRemaining,
  isCounting,
  isSessionOpen,
  localTimeZone,
  mainElapsedMs,
  markDistracted,
  pauseSession,
  resumeFocus,
  settleSession,
  startFocusSession,
} from "@/lib/focus-session";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { priorityKey } from "@/lib/types";
import type { Day, FocusSession, ISODate, Priority, PriorityKey } from "@/lib/types";

/** `?focus`, `?focus=1` and `?focus=true` all mean the same thing. */
const FOCUS_VALUES = new Set<unknown>([true, "", "1", "true"]);

export const Route = createFileRoute("/today")({
  validateSearch: (search: Record<string, unknown>): { d?: string; focus?: true } => {
    // Every key must be genuinely optional: returning `{ d: undefined }` would
    // make `search` a required prop on every <Link> pointing at this route.
    const next: { d?: string; focus?: true } = {};
    if (typeof search.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.d)) {
      next.d = search.d;
    }
    if (FOCUS_VALUES.has(search.focus)) next.focus = true;
    return next;
  },
  component: () => (
    <AppShell wide>
      <TodayView />
    </AppShell>
  ),
  head: () => ({ meta: [{ title: "Today — Claro" }] }),
});

function TodayView() {
  const {
    today,
    day,
    week,
    quarter,
    updateDay,
    state,
    activeSession,
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
  } = useClaro();
  const { d, focus } = Route.useSearch();
  const navigate = useNavigate();

  const dayId: ISODate = d ?? today;
  const record = day(dayId);

  const weekId = weekOfDay(dayId);
  const quarterId = quarterOfDay(dayId);
  const parentWeek = week(weekId);
  const parentQuarter = quarter(quarterId);

  // The app's only timer. It ticks solely while something is actually counting.
  const now = useNow(activeSession && isCounting(activeSession) ? 1000 : null);

  // Displayed state is settled immediately; the commit follows in the effect.
  const session = activeSession && now ? settleSession(activeSession, now) : activeSession;

  /**
   * The interruption still waiting to be resolved. Derived from the store rather
   * than held in component state, so a refresh mid-interruption loses nothing.
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

    // A return block handing back counts as having come back.
    if (activeSession.phase === "returning" && openInterruption) {
      updateInterruption(openInterruption.id, {
        returnedAt: activeSession.returnBlockEndsAt ?? now.toISOString(),
      });
    }
  }, [now, activeSession, openInterruption, updateSession, updateInterruption]);

  const go = (id: ISODate) => navigate({ to: "/today", search: { d: id } });
  const patch = (p: Partial<Day>) => updateDay(dayId, (current) => ({ ...current, ...p }));

  /** Writing into a blank slot is what creates a priority — see `writePriority`. */
  const patchPriority = (key: PriorityKey, p: Partial<Priority>) =>
    updateDay(dayId, (current) => ({
      ...current,
      [key]: writePriority(current[key], p, dayId, new Date()),
    }));

  const enterFocus = () => navigate({ to: "/today", search: { focus: true } });
  const leaveFocus = () => navigate({ to: "/today", search: {} });

  const beginBlock = (plannedMs: number) => {
    const target = selectFocus(record);
    const intention =
      target.kind === "priority"
        ? target.priority.text
        : target.kind === "done"
          ? (target.next?.text ?? "")
          : "";

    startSession(
      startFocusSession({
        dayId,
        priority: target.kind === "priority" ? { dayId, rank: target.rank } : null,
        intention,
        plannedMs,
        now: new Date(),
        timeZone: localTimeZone(),
      }),
    );
  };

  const reportDistraction = () => {
    if (!session) return;
    const at = new Date();
    updateSession((s) => markDistracted(s, at));
    logInterruption(createInterruption({ session, now: at, timeZone: localTimeZone() }));
  };

  const pauseBlock = () => updateSession((s) => pauseSession(s, new Date()));
  const resumeBlock = () => updateSession((s) => resumeFocus(s, new Date()));
  const endBlock = () => updateSession((s) => endBlockNow(s, new Date()));

  const takeReturnBlock = () => {
    updateSession((s) => beginReturnBlock(s, new Date()));
    if (openInterruption) updateInterruption(openInterruption.id, { returnBlockStarted: true });
  };

  const resumeNow = () => {
    const at = new Date();
    updateSession((s) => resumeFocus(s, at));
    if (openInterruption) {
      updateInterruption(openInterruption.id, { returnedAt: at.toISOString() });
    }
  };

  /** The only path to a completed priority is this explicit choice. */
  const completePriority = () => {
    if (session?.priority) patchPriority(priorityKey(session.priority.rank), { done: true });
    updateSession((s) => closeSession(s, "completed", new Date()));
    clearActiveSession();
  };

  const continueWorking = () => {
    const plannedMs = session?.plannedMs ?? 0;
    updateSession((s) => closeSession(s, "continued", new Date()));
    clearActiveSession();
    if (plannedMs > 0) beginBlock(plannedMs);
  };

  const leaveFinishedBlock = () => {
    updateSession((s) => closeSession(s, "left", new Date()));
    clearActiveSession();
    leaveFocus();
  };

  // Returning to focus is about now — it isn't offered while browsing another day.
  if (focus && dayId === today) {
    return (
      <FocusView
        day={record}
        week={parentWeek}
        quarter={quarter(quarterId)}
        session={session}
        openInterruption={openInterruption}
        now={now}
        onPatchPriority={patchPriority}
        onStart={beginBlock}
        onDistracted={reportDistraction}
        onPause={pauseBlock}
        onResumeBlock={resumeBlock}
        onEnd={endBlock}
        onChooseReason={(reason) => {
          if (openInterruption) updateInterruption(openInterruption.id, { reason });
        }}
        onReturnBlock={takeReturnBlock}
        onResume={resumeNow}
        onComplete={completePriority}
        onContinue={continueWorking}
        onLeave={leaveFinishedBlock}
        onPark={(text) => patch({ actions: parkDistraction(record.actions, text, new Date()) })}
        onExit={leaveFocus}
      />
    );
  }

  const live = isSessionOpen(session) ? session : null;
  const actions = (next: typeof record.actions) => patch({ actions: next });

  return (
    /*
      On a laptop the whole day is one screen: the outer column is pinned to the
      viewport, and the four inner columns take what is left. Below `lg` the
      height cap is dropped entirely and everything simply stacks and flows.
    */
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-14.5rem)] lg:min-h-[36rem]">
      {live && dayId === today && (
        <FocusStrip session={live} now={now} onOpen={enterFocus} />
      )}

      {/*
        One notebook opened flat: two pages, two columns each. A phone gets the
        same content in the same order, stacked.
      */}
      <div className="spread lg:min-h-0 lg:flex-1">
        <div className="spread-page flex min-h-0 flex-col gap-4">
          <DayHeading
            dayId={dayId}
            today={today}
            weekId={weekId}
            quarterId={quarterId}
            onPrev={() => go(shiftDayId(dayId, -1))}
            onNext={() => go(shiftDayId(dayId, 1))}
            onToday={dayId !== today ? () => go(today) : undefined}
          />

          <div className="grid min-h-0 flex-1 gap-5 sm:grid-cols-[1.05fr_1fr]">
            <ScheduleBlock
              day={record}
              onChange={(scheduleItems) => patch({ scheduleItems })}
              className="min-h-0"
            />

            <div className="flex min-h-0 flex-col gap-4">
              <BucketColumn
                bucket="quickTick"
                actions={record.actions}
                onChange={actions}
                className="min-h-0 flex-1"
              />
              <NonNegotiablesBlock
                day={record}
                onChange={(nonNegotiables) => patch({ nonNegotiables })}
              />
            </div>
          </div>

          <WellbeingBlock day={record} onPatch={patch} />
        </div>

        <div className="spread-page spread-seam flex min-h-0 flex-col gap-3">
          <section className="shrink-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="eyebrow">One day, three clear priorities</h2>
              {dayId === today && !live && (
                <button
                  type="button"
                  onClick={enterFocus}
                  className="btn btn-sm btn-primary shrink-0"
                >
                  Start focus
                </button>
              )}
            </div>

            <PrioritiesBlock day={record} quarter={parentQuarter} onPatch={patchPriority} />
          </section>

          <CarriedForwardBlock
            day={record}
            onPromote={(itemId) => updateDay(dayId, (current) => promoteCarried(current, itemId))}
            onKeepAsAction={(itemId) =>
              updateDay(dayId, (current) => keepCarriedAsAction(current, itemId, new Date()))
            }
            onSchedule={(itemId, toDayId) => moveCarried(dayId, toDayId, itemId)}
            onLetGo={(itemId) => updateDay(dayId, (current) => letGoCarried(current, itemId))}
          />

          <div className="grid min-h-0 flex-1 gap-5 sm:grid-cols-2 lg:min-h-[8.5rem]">
            <BucketColumn bucket="task" actions={record.actions} onChange={actions} />
            <BucketColumn bucket="project" actions={record.actions} onChange={actions} />
          </div>

          <HabitsBlock
            habits={state.habits}
            completions={state.habitCompletions}
            dayId={dayId}
            weekDayIds={weekDayIds(weekId)}
            todayId={today}
            onAdd={(name) => {
              const habit = createHabit(name, new Date());
              if (habit) addHabit(habit);
            }}
            onToggle={(habitId, on) => toggleHabitDone(habitId, on, new Date())}
            onArchive={(habitId) =>
              patchHabit(habitId, { archivedAt: new Date().toISOString() })
            }
            onRestore={(habitId) => patchHabit(habitId, { archivedAt: null })}
            onDelete={deleteHabit}
          />

          <section className="shrink-0">
            <div className="flex items-baseline gap-2">
              <h2 className="eyebrow">Notes</h2>
              <span className="text-[10px] text-muted-foreground">anything worth keeping</span>
            </div>
            {/* A writing surface, so the page's rules earn their place here. */}
            <div className="paper-panel rule-lines mt-2 px-3 py-1.5">
              <EditableText
                value={record.notes}
                onCommit={(notes) => patch({ notes })}
                multiline
                rows={2}
                ariaLabel="Notes for today"
                placeholder="How did today actually go?"
                className="-ml-2 py-0.5 text-[0.82rem] leading-[22px]"
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * The date, at the top of the left page — where it sits in a paper journal,
 * rather than in a separate band above the spread.
 */
function DayHeading({
  dayId,
  today,
  weekId,
  quarterId,
  onPrev,
  onNext,
  onToday,
}: {
  dayId: ISODate;
  today: ISODate;
  weekId: string;
  quarterId: string;
  onPrev: () => void;
  onNext: () => void;
  onToday?: () => void;
}) {
  return (
    <header className="shrink-0 border-b border-border/70 pb-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="eyebrow">
          {dayId === today ? "I will execute today" : "Execution"}
        </span>
        <Link
          to="/quarter"
          search={{ q: quarterId }}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {formatQuarterShort(quarterId)}
          <ArrowUpRight aria-hidden className="h-3 w-3" />
        </Link>
        <span aria-hidden className="text-[11px] text-muted-foreground/40">
          ·
        </span>
        <Link
          to="/week"
          search={{ w: weekId }}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {formatWeekNumber(weekId)}
          <ArrowUpRight aria-hidden className="h-3 w-3" />
        </Link>
      </div>

      <div className="mt-1.5 flex flex-wrap items-end justify-between gap-x-5 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <h1 className="display text-[2rem] sm:text-[2.3rem]">{formatDayWeekday(dayId)}</h1>
          <p className="tnum text-[0.88rem] text-muted-foreground">{formatDayDate(dayId)}</p>
        </div>

        <div className="flex items-center gap-2">
          {onToday && (
            <button type="button" onClick={onToday} className="btn btn-sm btn-quiet">
              Today
            </button>
          )}
          <div className="flex items-center rounded-full border border-border bg-card">
            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous day"
              className="btn btn-icon btn-ghost"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span aria-hidden className="h-4 w-px bg-border" />
            <button
              type="button"
              onClick={onNext}
              aria-label="Next day"
              className="btn btn-icon btn-ghost"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

const STATUS_COPY: Record<FocusSession["phase"], string> = {
  running: "Focus session in progress",
  paused: "Focus session paused",
  interrupted: "Focus session paused",
  returning: "Back in — five minutes",
  ended: "Focus block finished",
  closed: "",
};

/**
 * The live session, across the top of the spread. One line, one button: it
 * takes you back to the block that is already running. Deliberately not a
 * dashboard — no counts, no history, and never a second timer.
 */
function FocusStrip({
  session,
  now,
  onOpen,
}: {
  session: FocusSession;
  now: Date | null;
  onOpen: () => void;
}) {
  const elapsed = now ? mainElapsedMs(session, now) : session.elapsedBeforeMs;
  const left = Math.max(0, session.plannedMs - elapsed);
  const ratio =
    session.plannedMs > 0 ? Math.min(1, Math.max(0, elapsed / session.plannedMs)) : 0;

  return (
    <section className="surface-raised relative overflow-hidden px-5 py-4 sm:px-7">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-gold" />

      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="eyebrow">{STATUS_COPY[session.phase]}</span>
          {session.phase !== "ended" && (
            <span className="tnum display text-[1.5rem] leading-none">
              {formatRemaining(left)}
            </span>
          )}
          {session.intention && (
            <span className="truncate text-[0.88rem] text-muted-foreground">
              {session.intention}
            </span>
          )}
        </div>

        <button type="button" onClick={onOpen} className="btn btn-sm btn-primary shrink-0">
          Resume focus
        </button>
      </div>

      <div aria-hidden className="mt-3 h-[3px] overflow-hidden rounded-full bg-border">
        <div
          className={cn("h-full rounded-full bg-gold transition-[width] duration-1000")}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
    </section>
  );
}
