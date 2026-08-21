import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { EditableText } from "@/components/EditableText";
import { ActionLists } from "@/components/today/ActionLists";
import { CarriedForwardBlock } from "@/components/today/CarriedForwardBlock";
import { FocusView } from "@/components/today/FocusView";
import { HabitsBlock } from "@/components/today/HabitsBlock";
import { PrioritiesBlock } from "@/components/today/PrioritiesBlock";
import { ScheduleBlock } from "@/components/today/ScheduleBlock";
import { WellbeingBlock } from "@/components/today/WellbeingBlock";
import { useClaro } from "@/lib/claro-store";
import { useFocusSession } from "@/hooks/use-focus-session";
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
import { activeHabits, createHabit, reorderHabits } from "@/lib/habits";
import { SoundPanel } from "@/components/SoundPanel";
import { Plan333 } from "@/components/today/Plan333";
import { newId } from "@/lib/id";
import {
  addMaintenance,
  addTask,
  clearPlan,
  focusBlockMs,
  meaningfulProject,
  scheduleFocusBlock,
  setFocusHours,
  startPlan,
} from "@/lib/plan333";
import {
  clearPriority,
  reorderPriorities,
  resolvePriorityKey,
  writePriority,
  type PriorityTarget,
} from "@/lib/priorities";
import { scheduleHabitToggle, toggleScheduleItem } from "@/lib/schedule";
import { CloseDay } from "@/components/today/CloseDay";
import { CyclePrompt } from "@/components/today/CyclePrompt";
import { CycleLink } from "@/components/cycle/CycleLink";
import { hasCheckIn } from "@/lib/cycle";
import {
  carryItem,
  closeDay,
  completeItem,
  isCloseEligible,
  letGoItem,
  reopenDay,
  tomorrowOf,
  writeReview,
  type Decision,
  type OpenItem,
} from "@/lib/day-close";
import {
  keepCarriedAsAction,
  letGoCarried,
  promoteCarried,
  queueCarried,
} from "@/lib/rollover";
import {
  breakRemainingMs,
  formatRemaining,
  isSessionOpen,
  mainElapsedMs,
} from "@/lib/focus-session";
import { cn } from "@/lib/utils";
import { FOCUS_BLOCK_MS, PRIORITY_KEYS, priorityKey } from "@/lib/types";
import type {
  Day,
  FocusSession,
  ISODate,
  Priority,
  PriorityKey,
  PriorityRank,
  SoundFeedbackResponse,
  DailyReview as DailyReviewRecord,
} from "@/lib/types";

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
  head: () => ({ meta: [{ title: "Daily: Claro" }] }),
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
    recordUndo,
    toggleHabitDone,
    sound: soundPrefs,
    recordSoundFeedback,
    cycle,
  } = useClaro();
  const { d, focus: focusMode } = Route.useSearch();
  const navigate = useNavigate();

  const dayId: ISODate = d ?? today;
  const record = day(dayId);

  const weekId = weekOfDay(dayId);
  const quarterId = quarterOfDay(dayId);
  const parentWeek = week(weekId);
  const parentQuarter = quarter(quarterId);

  /**
   * Whether this day has passed its 9 PM. Recomputed on every render and on a
   * slow tick, because a browser cannot be relied on to wake in the background:
   * opening the app, navigating, or coming back to the tab is what asks.
   */
  const [clock, setClock] = useState<Date | null>(null);
  useEffect(() => {
    const read = () => setClock(new Date());
    read();
    const tick = setInterval(read, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") read();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", read);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", read);
    };
  }, []);

  const [closing, setClosing] = useState(false);
  const [cycleDismissed, setCycleDismissed] = useState(false);

  const focus = useFocusSession();
  const { session, now, openInterruption } = focus;

  /**
   * Asked once, on the end screen, and only when the block that just finished
   * actually had sound. Skipping is a real answer and is recorded as one.
   */
  const rateSound = (response: SoundFeedbackResponse) => {
    if (session) {
      recordSoundFeedback({
        id: newId(),
        focusSessionId: session.id,
        response,
        soundscape: soundPrefs.soundscape,
        mode: soundPrefs.mode,
        at: new Date().toISOString(),
      });
    }
    focus.dismissSoundQuestion();
  };

  const go = (id: ISODate) => navigate({ to: "/today", search: { d: id } });
  const patch = (p: Partial<Day>) => updateDay(dayId, (current) => ({ ...current, ...p }));

  /**
   * Writing into a blank slot is what creates a priority, see `writePriority`.
   *
   * The slot is resolved from the target against the day as it is *now*, not
   * from a position captured when the row rendered. That is what makes editing
   * safe across a reorder: an id addresses the same work wherever it has moved.
   */
  const patchPriority = (target: PriorityTarget, p: Partial<Priority>) =>
    updateDay(dayId, (current) => {
      const key = resolvePriorityKey(current, target);
      if (!key) return current;
      return { ...current, [key]: writePriority(current[key], p, dayId, new Date()) };
    });

  const clearPriorityAt = (target: PriorityTarget) => {
    recordUndo("Priority cleared");
    updateDay(dayId, (current) => clearPriority(current, target));
  };

  const enterFocus = () => navigate({ to: "/today", search: { focus: true } });
  const leaveFocus = () => navigate({ to: "/today", search: {} });

  /** Starts a block on one of the day's three priorities, from anywhere on the page. */
  const focusOnPriority = (target: PriorityTarget, plannedMs?: number) => {
    const key = resolvePriorityKey(record, target);
    if (!key) return;
    const rank = (PRIORITY_KEYS.indexOf(key) + 1) as PriorityRank;
    focus.start({ kind: "priority", dayId, rank, title: record[key].text }, plannedMs);
    enterFocus();
  };

  const beginBlock = (plannedMs: number, breakMs = 0) => {
    const target = selectFocus(record);
    if (target.kind === "priority") {
      focus.start(
        { kind: "priority", dayId, rank: target.rank, title: target.priority.text },
        plannedMs,
        breakMs,
      );
      return;
    }
    const title = target.kind === "done" ? (target.next?.text ?? "") : "";
    focus.start(title ? { kind: "open", title } : null, plannedMs, breakMs);
  };

  /** The only path to a completed priority is this explicit choice. */
  const completePriority = () => {
    const target = session?.target;
    if (target?.kind === "priority") {
      patchPriority({ rank: target.rank }, { done: true });
    } else if (session?.priority) {
      patchPriority({ rank: session.priority.rank }, { done: true });
    }
    focus.close("completed");
  };

  const continueWorking = () => {
    const plannedMs = session?.plannedMs ?? 0;
    const breakMs = session?.breakMs ?? 0;
    const target = session?.target ?? null;
    focus.close("continued");
    // Same length and same break: continuing is another of what you were doing,
    // not a fresh decision to make while the momentum is there.
    if (plannedMs > 0) focus.start(target, plannedMs, breakMs);
  };

  const leaveFinishedBlock = () => {
    focus.close("left");
    leaveFocus();
  };

  /**
   * Ticking a schedule row. A linked row writes through to the record it points
   * at, so the schedule and the rest of the day never hold two answers: a
   * habit's completion lives outside the day and is toggled through the store,
   * everything else is a write to the day itself.
   */
  const toggleScheduleRow = (itemId: string) => {
    const habitId = scheduleHabitToggle(record, itemId);
    if (habitId) {
      toggleHabitDone(habitId, dayId, new Date());
      return;
    }
    updateDay(dayId, (current) => toggleScheduleItem(current, itemId));
  };

  /**
   * The user's decision about one unfinished thing.
   *
   * Nothing happens on a schedule, and nothing is ever active in two places:
   * carrying marks the original as carried in the same operation that places
   * the single instance on the destination day.
   */
  const decideOpenItem = (item: OpenItem, decision: Decision, toDayId?: string) => {
    if (decision === "complete") {
      updateDay(dayId, (current) => completeItem(current, item));
      return;
    }
    if (decision === "letGo") {
      recordUndo("Item let go");
      updateDay(dayId, (current) => letGoItem(current, item, new Date()));
      return;
    }

    const target = toDayId ?? shiftDayId(dayId, 1);
    if (target === dayId) return;

    // The source keeps its record and is marked as carried, so the automatic
    // rollover will not pick it up again. The destination receives it in its
    // review queue rather than having it forced into a slot.
    let carried: ReturnType<typeof carryItem>["carried"] = null;
    updateDay(dayId, (current) => {
      const result = carryItem(current, item, target);
      carried = result.carried;
      return result.day;
    });
    if (carried) updateDay(target, (current) => queueCarried(current, carried!));
  };

  // ------------------------------------------------------------ 3-3-3 plan

  const planDay = (recipe: (d: Day) => Day) => updateDay(dayId, recipe);

  const focusOnProject = () => {
    const project = meaningfulProject(record).trim();
    if (!project) return;
    focus.start({ kind: "priority", dayId, rank: 1, title: project }, focusBlockMs(record));
    enterFocus();
  };

  // Returning to focus is about now — it isn't offered while browsing another day.
  if (focusMode && dayId === today) {
    return (
      <FocusView
        day={record}
        week={parentWeek}
        quarter={parentQuarter}
        session={session}
        openInterruption={openInterruption}
        now={now}
        onPatchPriority={patchPriority}
        onStart={beginBlock}
        blockPrefs={focus.blockPrefs}
        onBlockPrefs={focus.setBlockPrefs}
        onAdjust={focus.adjust}
        onTakeBreak={focus.takeBreak}
        onSkipBreak={focus.skipBreak}
        onDistracted={focus.distracted}
        onPause={focus.pause}
        onResumeBlock={focus.resume}
        onEnd={focus.endBlock}
        onChooseReason={focus.chooseReason}
        onReturnBlock={focus.takeReturnBlock}
        onResume={focus.resumeAfterInterruption}
        onComplete={completePriority}
        onContinue={continueWorking}
        onLeave={leaveFinishedBlock}
        onPark={(text) => patch({ actions: parkDistraction(record.actions, text, new Date()) })}
        onExit={leaveFocus}
        askAboutSound={focus.endedWithSound}
        onSoundFeedback={rateSound}
        soundPanel={<SoundPanel compact />}
      />
    );
  }

  const closeEligible = clock !== null && isCloseEligible(dayId, clock);

  /**
   * Offered only when the user has turned cycle notes on and written a note for
   * this day. It asks; it never acts, and it never reads anything into the note.
   */
  const showCyclePrompt =
    !cycleDismissed && cycle.settings.enabled && hasCheckIn(cycle, dayId) && dayId === today;
  const live = isSessionOpen(session) ? session : null;

  /** A reorder is an id sequence, resolved against live state. See `reorderPriorities`. */
  const reorderPrioritiesTo = (ids: (string | null)[]) =>
    updateDay(dayId, (current) => reorderPriorities(current, ids));

  return (
    <div className="space-y-5">
      {live && dayId === today && (
        <FocusStrip session={live} now={now} onOpen={enterFocus} />
      )}

      {/*
        One notebook opened flat. The day's three priorities run across the top
        of the sheet, above both pages — everything else is what supports them.
      */}
      <div className="spread">
        <div className="spread-band">
          <DayHeading
            dayId={dayId}
            today={today}
            weekId={weekId}
            quarterId={quarterId}
            onPrev={() => go(shiftDayId(dayId, -1))}
            onNext={() => go(shiftDayId(dayId, 1))}
            onToday={dayId !== today ? () => go(today) : undefined}
          />

          <section className="mt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h2 className="eyebrow">Today's three priorities</h2>
                <span className="text-[10px] text-muted-foreground">
                  One day, three clear priorities.
                </span>
              </div>
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

            <PrioritiesBlock
              day={record}
              quarter={parentQuarter}
              onPatch={patchPriority}
              onReorder={reorderPrioritiesTo}
              onClear={clearPriorityAt}
              onFocus={dayId === today ? focusOnPriority : undefined}
            />
          </section>

          <Plan333
            day={record}
            onStart={() => planDay((d) => startPlan(d, new Date()))}
            onClear={() => planDay(clearPlan)}
            onSetHours={(hours) => planDay((d) => setFocusHours(d, hours))}
            onAddTask={(text) => planDay((d) => addTask(d, text, new Date()))}
            onAddMaintenance={(text) => planDay((d) => addMaintenance(d, text, new Date()))}
            onSchedule={(fromTime) => planDay((d) => scheduleFocusBlock(d, fromTime))}
            onFocus={focusOnProject}
          />

          <CarriedForwardBlock
            day={record}
            className="mt-5"
            onPromote={(itemId) => updateDay(dayId, (current) => promoteCarried(current, itemId))}
            onKeepAsAction={(itemId) =>
              updateDay(dayId, (current) => keepCarriedAsAction(current, itemId, new Date()))
            }
            onSchedule={(itemId, toDayId) => moveCarried(dayId, toDayId, itemId)}
            onLetGo={(itemId) => {
              recordUndo("Carried item let go");
              updateDay(dayId, (current) => letGoCarried(current, itemId));
            }}
          />
        </div>

        <div className="spread-pages">
          <div className="spread-page flex flex-col gap-6">
            <ScheduleBlock
              day={record}
              habits={state.habits}
              completions={state.habitCompletions}
              onChange={(scheduleItems) => patch({ scheduleItems })}
              onToggle={toggleScheduleRow}
            />
            <WellbeingBlock day={record} onPatch={patch} />

            <section>
              <div className="flex items-baseline gap-2">
                <h2 className="eyebrow">Notes</h2>
                <span className="text-[10px] text-muted-foreground">anything worth keeping</span>
              </div>
              {/* A writing surface, so the page's rules earn their place here. */}
              <div className="paper-panel ruled mt-2 px-3 pb-2">
                <EditableText
                  value={record.notes}
                  onCommit={(notes) => patch({ notes })}
                  multiline
                  rows={3}
                  ariaLabel="Notes for today"
                  placeholder="How did today actually go?"
                  className="ruled-text -ml-2 py-0"
                />
              </div>
            </section>
          </div>

          <div className="spread-page spread-seam flex flex-col gap-6">
            <section>
              <div className="flex items-baseline gap-2">
                <h2 className="eyebrow">Actions</h2>
                <span className="text-[10px] text-muted-foreground">grouped by effort</span>
              </div>
              <ActionLists
                actions={record.actions}
                onChange={(actions) => patch({ actions })}
                className="mt-2"
              />
            </section>

            <HabitsBlock
              habits={state.habits}
              completions={state.habitCompletions}
              dayId={dayId}
              weekDayIds={weekDayIds(weekId)}
              todayId={today}
              onAdd={(name) => {
                const habit = createHabit(name, new Date(), activeHabits(state.habits).length);
                if (habit) addHabit(habit);
              }}
              onReorder={(next) => {
                for (const [id, patchValue] of Object.entries(reorderHabits(next))) {
                  patchHabit(id, patchValue);
                }
              }}
              onToggle={(habitId, on) => toggleHabitDone(habitId, on, new Date())}
              onArchive={(habitId) =>
                patchHabit(habitId, { archivedAt: new Date().toISOString() })
              }
              onRestore={(habitId) => patchHabit(habitId, { archivedAt: null })}
              onDelete={deleteHabit}
            />

            {showCyclePrompt && <CyclePrompt onDismiss={() => setCycleDismissed(true)} />}

            <CloseDay
              day={record}
              eligible={closeEligible}
              open={closing}
              tomorrowId={tomorrowOf(dayId)}
              onOpen={() => setClosing(true)}
              onWrite={(patch: Partial<DailyReviewRecord>) =>
                updateDay(dayId, (current) => writeReview(current, patch, new Date()))
              }
              onDecide={decideOpenItem}
              onClose={() => {
                updateDay(dayId, (current) => closeDay(current, new Date()));
                setClosing(false);
              }}
              onReopen={() => {
                updateDay(dayId, reopenDay);
                setClosing(true);
              }}
            />
          </div>
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
        <CycleLink className="ml-auto" />
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
  returning: "Back in, five minutes",
  break: "On a break",
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
  // During a break the block has already finished, so counting down the block
  // would be reporting a clock that is not running.
  const onBreak = session.phase === "break";
  const elapsed = now ? mainElapsedMs(session, now) : session.elapsedBeforeMs;
  const blockLeft = Math.max(0, session.plannedMs - elapsed);
  const left = onBreak ? (now ? breakRemainingMs(session, now) : session.breakMs) : blockLeft;
  const total = onBreak ? session.breakMs : session.plannedMs;
  const ratio = total > 0 ? Math.min(1, Math.max(0, 1 - left / total)) : 0;

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
          {onBreak ? "Back to the break" : "Resume focus"}
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
