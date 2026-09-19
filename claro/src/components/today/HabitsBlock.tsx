import { Archive, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AddItem } from "@/components/AddItem";
import { Confetti } from "@/components/Confetti";
import { DragHandle } from "@/components/DragHandle";
import { SortAnnouncer } from "@/components/SortAnnouncer";
import { useSortable } from "@/hooks/use-sortable";
import { Picker } from "@/components/Picker";
import {
  formatDayLong,
  formatDayOfMonth,
  formatTimeLabel,
  formatWeekdayShort,
} from "@/lib/dates";
import {
  activeHabits,
  archivedHabits,
  isIntendedDay,
  weekLabel,
  countCompletions,
  isDoneOn,
} from "@/lib/habits";
import type { Habit, HabitCompletion, ISODate } from "@/lib/types";
import { zoneAt } from "@/lib/drop-zones";
import { cn } from "@/lib/utils";
import { HabitIntentEditor } from "./HabitIntentEditor";

type Props = {
  habits: Record<string, Habit>;
  completions: Record<string, HabitCompletion>;
  /** The day the page is showing — the column a celebration is judged on. */
  dayId: ISODate;
  /** The seven day ids of the week this day belongs to, Monday → Sunday. */
  weekDayIds: ISODate[];
  /** The real today, so days that haven't happened yet stay un-tickable. */
  todayId: ISODate;
  onAdd: (name: string) => void;
  onReorder: (habits: Habit[]) => void;
  onToggle: (habitId: string, dayId: ISODate) => void;
  onArchive: (habitId: string) => void;
  /** Renaming, and saying how often the habit is meant to happen. */
  onPatch: (habitId: string, patch: Partial<Habit>) => void;
  onRestore: (habitId: string) => void;
  onDelete: (habitId: string) => void;
  /** Dropping a habit onto an hour of the schedule. */
  onSchedule?: (habit: Habit, time: string) => void;
  onHoverHour?: (time: string | null) => void;
  /** Free hours, which give each row a way to be scheduled without dragging. */
  scheduleHours?: string[];
};

/**
 * One grid owns the columns; every row borrows them with `subgrid`.
 *
 * The first attempt at this gave the header and each row the same
 * `grid-template-columns` string and assumed that would line them up. It does
 * not: they are separate grid containers, so each sizes its own `auto` and
 * `1fr` tracks from its own contents. The header's leading track held an empty
 * span and collapsed to nothing while the rows' held a drag handle, and the
 * labels ended up 86px out from the circles they name.
 *
 * With `subgrid` there is one set of tracks, defined once here, and the header
 * and the rows are laid into it. Nothing can drift because nothing is measured
 * twice. The seven day columns are fixed so they stay square under their
 * labels; the name takes what is left.
 *
 * Below `sm` the week's count, the time picker and archive fall away, so the
 * track list is shorter and the row is tighter.
 */
const HABIT_GRID =
  "grid grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:grid-cols-[auto_minmax(0,1fr)_repeat(7,22px)_7rem_auto_auto]";

/**
 * The seven day cells: their own line on a phone, columns on a desktop.
 *
 * At 390px the seven cells plus the handle, the time picker and archive leave
 * roughly nothing for the name, and it ran straight over the circles. So below
 * `sm` they drop to a full-width row of their own, exactly as they did before
 * this became a grid. `display: contents` from `sm` up dissolves the wrapper so
 * the cells become direct children again and the subgrid keeps working.
 */
const DAY_CELLS =
  "max-sm:col-span-full max-sm:row-start-2 max-sm:mt-1 max-sm:flex max-sm:gap-1 sm:contents";

/** A header or habit line, laid into {@link HABIT_GRID}'s columns. */
const HABIT_ROW = "col-span-full grid grid-cols-subgrid items-center gap-x-2";

/**
 * Habits, shown a whole week at a time so the shape of a practice is visible
 * without any scoring. Consistency is a plain count — never a streak, and never
 * anything a missed day can take away.
 */
export function HabitsBlock({
  habits,
  completions,
  dayId,
  weekDayIds,
  todayId,
  onAdd,
  onReorder,
  onToggle,
  onArchive,
  onPatch,
  onRestore,
  onDelete,
  onSchedule,
  onHoverHour,
  scheduleHours,
}: Props) {
  const [showArchived, setShowArchived] = useState(false);
  /** Which habit is being renamed or re-aimed. One at a time, inline. */
  const [editing, setEditing] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const active = activeHabits(habits);
  const archived = archivedHabits(habits);

  const sortable = useSortable<Habit>({
    items: active,
    label: (habit) => habit.name,
    onReorder,
    // A habit can be given an hour by dragging it onto one, the same way a
    // task can.
    externalDrop: onSchedule
      ? {
          zoneAt,
          onDrop: (habit, zone) => onSchedule(habit, zone.replace("hour:", "")),
          onHover: (zone) => onHoverHour?.(zone ? zone.replace("hour:", "") : null),
        }
      : undefined,
  });

  const allDone =
    active.length > 0 && active.every((habit) => isDoneOn(completions, habit.id, dayId));

  // Fires on the transition into "all done", once. Arriving at a day that was
  // already complete is not something that just happened, so it stays quiet.
  const seen = useRef<{ dayId: ISODate; allDone: boolean } | null>(null);
  useEffect(() => {
    const previous = seen.current;
    seen.current = { dayId, allDone };
    if (!previous || previous.dayId !== dayId) return;
    if (!previous.allDone && allDone) setCelebrating(true);
  }, [dayId, allDone]);

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="eyebrow">Habits</h2>
          <span className="text-[10px] text-muted-foreground">practices, not tasks</span>
        </div>
        {archived.length > 0 && (
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {showArchived ? "Hide archived" : `Archived (${archived.length})`}
          </button>
        )}
      </div>

      <div className="paper-panel relative mt-2 px-3 py-0.5">
        {celebrating && <Confetti onDone={() => setCelebrating(false)} />}
        <SortAnnouncer message={sortable.announcement} />

        <div className={HABIT_GRID}>
        {active.length > 0 && (
          <div className={cn(HABIT_ROW, "items-end border-b border-subtle py-1")}>
            {/*
              Every cell the rows have, so the two cannot drift. The header used
              to be a flex row whose first spacer was `flex-1`, while each habit
              row put a drag handle *before* its `flex-1` name: the day labels
              ended up a handle's width to the left of the circles they were
              naming, and the variable-width time picker pulled the right edge
              out of true as well. One grid, one set of tracks, no arithmetic.
            */}
            <span aria-hidden />
            <span aria-hidden />
            <div className={DAY_CELLS}>
            {weekDayIds.map((id) => (
              <span
                key={id}
                className={cn(
                  "tnum grid w-[22px] justify-items-center gap-0.5 text-[9px] leading-none",
                  id === dayId ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span aria-hidden>{formatWeekdayShort(id)}</span>
                <span aria-hidden className="text-[9px] text-muted-foreground/70">
                  {formatDayOfMonth(id)}
                </span>
              </span>
            ))}
            </div>
            <span aria-hidden />
            <span aria-hidden />
            <span aria-hidden />
          </div>
        )}

          {sortable.ordered.map((habit) => (
            <div
              key={habit.id}
              ref={sortable.itemRef(habit.id)}
              className={cn(
                HABIT_ROW,
                "group rounded-md border-t border-subtle py-0.5 first-of-type:border-t-0",
                sortable.draggingId === habit.id &&
                  "bg-card/80 shadow-[0_8px_24px_-12px_hsl(30_22%_8%/0.3)]",
              )}
            >
              <DragHandle
                {...sortable.handleProps(habit)}
                dragging={sortable.draggingId === habit.id}
              />
              {/* Wraps rather than truncating — a habit's name is the whole label. */}
              {/*
                The name is the affordance. A settings icon on every row would
                add a control to an already dense line to do what clicking the
                thing itself can do.
              */}
              <button
                type="button"
                onClick={() => setEditing((id) => (id === habit.id ? null : habit.id))}
                aria-expanded={editing === habit.id}
                aria-label={`Edit ${habit.name}`}
                className="min-w-0 rounded text-left text-[0.9rem] leading-snug hover:text-foreground"
              >
                {habit.name}
              </button>

              <div className={DAY_CELLS}>
              {weekDayIds.map((id) => (
                <DayCell
                  key={id}
                  habit={habit}
                  dayId={id}
                  done={isDoneOn(completions, habit.id, id)}
                  isViewed={id === dayId}
                  isFuture={id > todayId}
                  isIntended={isIntendedDay(habit, id)}
                  onToggle={() => onToggle(habit.id, id)}
                />
              ))}
              </div>

              <span className="tnum hidden text-right text-[10px] text-muted-foreground sm:block">
                {weekLabel(habit, completions, weekDayIds)}
              </span>

              {/* The way to put a habit on an hour that does not need a drag. */}
              {onSchedule && scheduleHours && scheduleHours.length > 0 ? (
                <Picker
                  value={null}
                  onChange={(time) => onSchedule(habit, time)}
                  label={`Put "${habit.name}" on the schedule`}
                  placeholder="Time"
                  align="right"
                  className="shrink-0"
                  triggerClassName="goal-trigger whitespace-nowrap text-muted-foreground"
                  options={scheduleHours.map((time) => ({
                    value: time,
                    label: formatTimeLabel(time),
                  }))}
                />
              ) : null}

              <button
                type="button"
                onClick={() => onArchive(habit.id)}
                aria-label={`Archive ${habit.name}`}
                className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Archive className="h-3.5 w-3.5" />
              </button>

              {editing === habit.id && (
                <HabitIntentEditor
                  habit={habit}
                  onPatch={(patch) => onPatch(habit.id, patch)}
                  onDone={() => setEditing(null)}
                />
              )}
            </div>
          ))}
        </div>

        {active.length === 0 && (
          <p className="py-3 text-[0.85rem] text-muted-foreground">
            A habit is something you do for yourself. Ten pages, a walk, five quiet minutes.
          </p>
        )}

        <AddItem
          label="Add a habit"
          placeholder="Meditate, read, move…"
          className="py-1 text-[0.8rem]"
          onAdd={onAdd}
        />
      </div>

      {showArchived && archived.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3">
          {archived.map((habit) => (
            <div key={habit.id} className="flex items-center gap-3 text-[0.85rem]">
              <span className="flex-1 truncate text-muted-foreground">{habit.name}</span>
              <button
                type="button"
                onClick={() => onRestore(habit.id)}
                aria-label={`Restore ${habit.name}`}
                className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(habit.id)}
                aria-label={`Delete ${habit.name} and its history`}
                className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** One tick box in one habit's week. A day that hasn't happened can't be ticked. */
function DayCell({
  habit,
  dayId,
  done,
  isViewed,
  isFuture,
  isIntended,
  onToggle,
}: {
  habit: Habit;
  dayId: ISODate;
  done: boolean;
  isViewed: boolean;
  isFuture: boolean;
  /** One of the weekdays this habit was pinned to, if any were pinned. */
  isIntended: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`${habit.name} on ${formatDayLong(dayId)}${isIntended ? ", one of your days" : ""}`}
      disabled={isFuture}
      onClick={onToggle}
      className={cn(
        "grid h-[22px] w-[22px] place-items-center rounded-md border transition-colors",
        done
          ? "border-positive bg-positive/85"
          : "border-border bg-card/70 hover:border-foreground/40",
        isViewed && !done && "border-gold/60 bg-gold/8",
        /*
          A pinned day is drawn a little firmer, never a different colour and
          never marked when it is not kept. The week should say "this is one of
          yours", not "you have failed this one": an unkept Tuesday looks
          exactly like an unkept Wednesday.
        */
        isIntended && !done && "border-foreground/30",
        isFuture && "cursor-not-allowed opacity-35 hover:border-border",
      )}
    >
      {done && (
        <svg viewBox="0 0 12 12" aria-hidden className="h-3 w-3 text-white">
          <path
            d="M2.5 6.5 5 9l4.5-5.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
