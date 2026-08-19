import { Archive, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AddItem } from "@/components/AddItem";
import { Confetti } from "@/components/Confetti";
import { DragHandle } from "@/components/DragHandle";
import { SortAnnouncer } from "@/components/SortAnnouncer";
import { useSortable } from "@/hooks/use-sortable";
import { formatDayLong, formatDayOfMonth, formatWeekdayShort } from "@/lib/dates";
import {
  activeHabits,
  archivedHabits,
  consistencyLabel,
  countCompletions,
  isDoneOn,
} from "@/lib/habits";
import type { Habit, HabitCompletion, ISODate } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  onRestore: (habitId: string) => void;
  onDelete: (habitId: string) => void;
};

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
  onRestore,
  onDelete,
}: Props) {
  const [showArchived, setShowArchived] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const active = activeHabits(habits);
  const archived = archivedHabits(habits);

  const sortable = useSortable<Habit>({
    items: active,
    label: (habit) => habit.name,
    onReorder,
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

        {active.length > 0 && (
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2 border-b border-subtle py-1">
            <span className="hidden flex-1 sm:block" aria-hidden />
            <div className="flex w-full shrink-0 gap-1 sm:w-auto">
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
            <span className="hidden w-[5.5rem] shrink-0 sm:block" />
            <span className="w-6 shrink-0" />
          </div>
        )}

        <div className="divide-y divide-subtle">
          {sortable.ordered.map((habit) => (
            <div
              key={habit.id}
              ref={sortable.itemRef(habit.id)}
              className={cn(
                "group flex flex-wrap items-center gap-x-2 gap-y-2 rounded-md py-0.5",
                sortable.draggingId === habit.id &&
                  "bg-card/80 shadow-[0_8px_24px_-12px_hsl(30_22%_8%/0.3)]",
              )}
            >
              <DragHandle
                {...sortable.handleProps(habit)}
                dragging={sortable.draggingId === habit.id}
              />
              {/* Wraps rather than truncating — a habit's name is the whole label. */}
              <span className="min-w-0 flex-1 text-[0.9rem] leading-snug">{habit.name}</span>

              <div className="order-last flex w-full shrink-0 gap-1 sm:order-none sm:w-auto">
                {weekDayIds.map((id) => (
                  <DayCell
                    key={id}
                    habit={habit}
                    dayId={id}
                    done={isDoneOn(completions, habit.id, id)}
                    isViewed={id === dayId}
                    isFuture={id > todayId}
                    onToggle={() => onToggle(habit.id, id)}
                  />
                ))}
              </div>

              <span className="tnum hidden w-[5.5rem] shrink-0 text-right text-[10px] text-muted-foreground sm:block">
                {consistencyLabel(countCompletions(completions, habit.id, weekDayIds), "week")}
              </span>

              <button
                type="button"
                onClick={() => onArchive(habit.id)}
                aria-label={`Archive ${habit.name}`}
                className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Archive className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {active.length === 0 && (
            <p className="py-3 text-[0.85rem] text-muted-foreground">
              A habit is something you do for yourself. Ten pages, a walk, five quiet minutes.
            </p>
          )}
        </div>

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
  onToggle,
}: {
  habit: Habit;
  dayId: ISODate;
  done: boolean;
  isViewed: boolean;
  isFuture: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`${habit.name} on ${formatDayLong(dayId)}`}
      disabled={isFuture}
      onClick={onToggle}
      className={cn(
        "grid h-[22px] w-[22px] place-items-center rounded-md border transition-colors",
        done
          ? "border-positive bg-positive/85"
          : "border-border bg-card/70 hover:border-foreground/40",
        isViewed && !done && "border-gold/60 bg-gold/8",
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
