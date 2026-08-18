import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useMemo } from "react";

import { AppShell } from "@/components/AppShell";
import { EditableText } from "@/components/EditableText";
import { PeriodHeader } from "@/components/PeriodHeader";
import { ActionLists } from "@/components/today/ActionLists";
import { FocusView } from "@/components/today/FocusView";
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
  weekOfDay,
} from "@/lib/dates";
import { parkDistraction, selectFocus } from "@/lib/focus";
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
import type { Day, FocusSession, ISODate, Priority } from "@/lib/types";

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
    <AppShell>
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
  } = useClaro();
  const { d, focus } = Route.useSearch();
  const navigate = useNavigate();

  const dayId: ISODate = d ?? today;
  const record = day(dayId);

  const weekId = weekOfDay(dayId);
  const quarterId = quarterOfDay(dayId);
  const parentWeek = week(weekId);

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
  const patchPriority = (key: "priority1" | "priority2", p: Partial<Priority>) =>
    updateDay(dayId, (current) => ({ ...current, [key]: { ...current[key], ...p } }));
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
    if (session?.priority) patchPriority(`priority${session.priority.rank}`, { done: true });
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

  return (
    <div className="space-y-12">
      <PeriodHeader
        eyebrow={dayId === today ? "Execution · Today" : "Execution"}
        title={formatDayWeekday(dayId)}
        subtitle={formatDayDate(dayId)}
        onPrev={() => go(shiftDayId(dayId, -1))}
        onNext={() => go(shiftDayId(dayId, 1))}
        prevLabel="Previous day"
        nextLabel="Next day"
        onToday={dayId !== today ? () => go(today) : undefined}
        todayLabel="Today"
        parent={
          <span className="flex items-center gap-2">
            <Link
              to="/quarter"
              search={{ q: quarterId }}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {formatQuarterShort(quarterId)}
              <ArrowUpRight className="h-3 w-3" />
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
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </span>
        }
      />

      {/*
        The hero: one bound page carrying the day's intent and the session that
        serves it, rather than two cards that happen to sit near each other.
      */}
      <section className="paper-page paper-bound tape relative p-6 pt-8 sm:p-9 sm:pt-10">
        <span aria-hidden className="binding-holes" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="eyebrow">Today's focus</h2>
          <span className="annot hidden sm:block">one day, two things.</span>
        </div>

        <PrioritiesBlock day={record} week={parentWeek} onPatch={patchPriority} />

        {dayId === today && (
          <FocusControl session={session} now={now} onOpen={enterFocus} />
        )}
      </section>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
        <ScheduleBlock day={record} onChange={(scheduleItems) => patch({ scheduleItems })} />
        <ActionLists day={record} onChange={(actions) => patch({ actions })} />
      </div>

      <NonNegotiablesBlock
        day={record}
        onChange={(nonNegotiables) => patch({ nonNegotiables })}
      />

      <WellbeingBlock day={record} onPatch={patch} />

      <section>
        <div className="flex items-baseline gap-2.5">
          <h2 className="eyebrow">Notes</h2>
          <span className="text-[11px] text-muted-foreground">anything worth keeping</span>
        </div>
        <div className="paper-page tape tape-tr relative mt-4 p-5 pt-7 sm:p-6 sm:pt-8">
          {/* A writing surface, so the page's rules earn their place here. */}
          <EditableText
            value={record.notes}
            onCommit={(notes) => patch({ notes })}
            multiline
            rows={5}
            ariaLabel="Notes for today"
            placeholder="How did today actually go?"
            className="-ml-2 text-[0.95rem] leading-[28px]"
          />
        </div>
      </section>
    </div>
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
 * The single focus control on Today. One line, one button: it starts a block
 * when there is nothing running and returns you to the live one when there is.
 * Deliberately not a dashboard — no counts, no history, no second timer.
 */
function FocusControl({
  session,
  now,
  onOpen,
}: {
  session: FocusSession | null;
  now: Date | null;
  onOpen: () => void;
}) {
  const live = isSessionOpen(session) ? session : null;
  const elapsed = live ? (now ? mainElapsedMs(live, now) : live.elapsedBeforeMs) : 0;
  const left = live ? Math.max(0, live.plannedMs - elapsed) : 0;

  return (
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5">
      <div className="flex min-w-0 flex-wrap items-baseline gap-2.5">
        <span className="eyebrow">{live ? STATUS_COPY[live.phase] : "Focus session"}</span>
        {live ? (
          <>
            {live.phase !== "ended" && (
              <span className="tnum text-[0.9rem] text-foreground">
                {formatRemaining(left)} left
              </span>
            )}
            {live.intention && (
              <span className="truncate text-[0.85rem] text-muted-foreground">
                · {live.intention}
              </span>
            )}
          </>
        ) : (
          <span className="text-[0.85rem] text-muted-foreground">
            Give one of these a quiet block.
          </span>
        )}
      </div>
      <button type="button" onClick={onOpen} className="btn btn-sm btn-primary shrink-0">
        {live ? "Resume focus" : "Start focus"}
      </button>
    </div>
  );
}
