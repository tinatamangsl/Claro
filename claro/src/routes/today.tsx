import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo } from "react";

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
import { blankPriority } from "@/lib/storage";
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
import { writePriority } from "@/lib/priorities";
import {
  keepCarriedAsAction,
  letGoCarried,
  promoteCarried,
} from "@/lib/rollover";
import {
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
  head: () => ({ meta: [{ title: "Today: Claro" }] }),
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
    sound: soundPrefs,
    recordSoundFeedback,
  } = useClaro();
  const { d, focus: focusMode } = Route.useSearch();
  const navigate = useNavigate();

  const dayId: ISODate = d ?? today;
  const record = day(dayId);

  const weekId = weekOfDay(dayId);
  const quarterId = quarterOfDay(dayId);
  const parentWeek = week(weekId);
  const parentQuarter = quarter(quarterId);

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

  /** Writing into a blank slot is what creates a priority — see `writePriority`. */
  const patchPriority = (key: PriorityKey, p: Partial<Priority>) =>
    updateDay(dayId, (current) => ({
      ...current,
      [key]: writePriority(current[key], p, dayId, new Date()),
    }));

  const enterFocus = () => navigate({ to: "/today", search: { focus: true } });
  const leaveFocus = () => navigate({ to: "/today", search: {} });

  /** Starts a block on one of the day's three priorities, from anywhere on the page. */
  const focusOnPriority = (rank: PriorityRank, plannedMs = FOCUS_BLOCK_MS) => {
    const priority = record[priorityKey(rank)];
    focus.start(
      { kind: "priority", dayId, rank, title: priority.text },
      plannedMs,
    );
    enterFocus();
  };

  const beginBlock = (plannedMs: number) => {
    const target = selectFocus(record);
    if (target.kind === "priority") {
      focus.start(
        { kind: "priority", dayId, rank: target.rank, title: target.priority.text },
        plannedMs,
      );
      return;
    }
    const title = target.kind === "done" ? (target.next?.text ?? "") : "";
    focus.start(title ? { kind: "open", title } : null, plannedMs);
  };

  /** The only path to a completed priority is this explicit choice. */
  const completePriority = () => {
    const target = session?.target;
    if (target?.kind === "priority") {
      patchPriority(priorityKey(target.rank), { done: true });
    } else if (session?.priority) {
      patchPriority(priorityKey(session.priority.rank), { done: true });
    }
    focus.close("completed");
  };

  const continueWorking = () => {
    const plannedMs = session?.plannedMs ?? 0;
    const target = session?.target ?? null;
    focus.close("continued");
    if (plannedMs > 0) focus.start(target, plannedMs);
  };

  const leaveFinishedBlock = () => {
    focus.close("left");
    leaveFocus();
  };

  // ------------------------------------------------------------ 3-3-3 plan

  const planDay = (recipe: (d: Day) => Day) => updateDay(dayId, recipe);

  const focusOnProject = () => {
    const project = meaningfulProject(record).trim();
    if (!project) return;
    focus.start(
      { kind: "priority", dayId, rank: 1, title: project },
      focusBlockMs(record),
    );
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

  const live = isSessionOpen(session) ? session : null;

  /** A reorder rewrites all three slots at once, keeping each slot's identity. */
  const reorderPriorities = (next: Priority[]) =>
    updateDay(dayId, (current) => {
      const rewritten = { ...current };
      PRIORITY_KEYS.forEach((key, index) => {
        rewritten[key] = next[index] ?? blankPriority();
      });
      return rewritten;
    });

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

            <PrioritiesBlock
              day={record}
              quarter={parentQuarter}
              onPatch={patchPriority}
              onReorder={reorderPriorities}
              onFocus={dayId === today ? () => enterFocus() : undefined}
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
            onLetGo={(itemId) => updateDay(dayId, (current) => letGoCarried(current, itemId))}
          />
        </div>

        <div className="spread-pages">
          <div className="spread-page flex flex-col gap-6">
            <ScheduleBlock
              day={record}
              onChange={(scheduleItems) => patch({ scheduleItems })}
            />
            <WellbeingBlock day={record} onPatch={patch} />

            <section>
              <div className="flex items-baseline gap-2">
                <h2 className="eyebrow">Notes</h2>
                <span className="text-[10px] text-muted-foreground">anything worth keeping</span>
              </div>
              {/* A writing surface, so the page's rules earn their place here. */}
              <div className="paper-panel rule-lines mt-2 px-3 py-2">
                <EditableText
                  value={record.notes}
                  onCommit={(notes) => patch({ notes })}
                  multiline
                  rows={3}
                  ariaLabel="Notes for today"
                  placeholder="How did today actually go?"
                  className="-ml-2 text-[0.88rem] leading-[26px]"
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
