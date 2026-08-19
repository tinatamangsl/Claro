import { formatDayLong, formatDayOfMonth } from "@/lib/dates";
import { consistency, monthCompletions, monthGrid, type MonthId } from "@/lib/calendar";
import { activeHabits, consistencyLabel } from "@/lib/habits";
import { isLoggedStart } from "@/lib/cycle";
import { cn } from "@/lib/utils";
import type { CycleState, Habit, HabitCompletion, ISODate } from "@/lib/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Props = {
  monthId: MonthId;
  habits: Record<string, Habit>;
  completions: Record<string, HabitCompletion>;
  todayId: ISODate;
  /** Only ever read once the user has opted in. */
  cycle: CycleState | null;
  onOpenDay: (dayId: ISODate) => void;
};

/**
 * The month at a glance: how full each day was, and nothing more.
 *
 * A day's mark reflects how many of that day's habits were kept, as a quiet
 * fill. There is no score, no ranking and no run — an empty day is simply
 * empty, drawn like any other.
 */
export function HabitMonth({ monthId, habits, completions, todayId, cycle, onOpenDay }: Props) {
  const active = activeHabits(habits);
  const byDay = monthCompletions(active, completions, monthId);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((day) => (
          <span
            key={day}
            aria-hidden
            className="pb-1 text-center text-[10px] tracking-wide text-muted-foreground uppercase"
          >
            {day.slice(0, 1)}
          </span>
        ))}

        {monthGrid(monthId).map((cell) => {
          const day = byDay[cell.dayId];
          const ratio = day && day.total > 0 ? day.done / day.total : 0;
          const started = cycle ? isLoggedStart(cycle, cell.dayId) : false;

          return (
            <button
              key={cell.dayId}
              type="button"
              onClick={() => onOpenDay(cell.dayId)}
              aria-label={
                cell.inMonth && day
                  ? `${formatDayLong(cell.dayId)} — ${day.done} of ${day.total} habits kept`
                  : formatDayLong(cell.dayId)
              }
              aria-current={cell.dayId === todayId ? "date" : undefined}
              className={cn(
                "relative grid aspect-square place-items-center rounded-lg border text-[0.8rem] transition-colors",
                cell.inMonth
                  ? "border-border bg-card hover:border-foreground/35"
                  : "border-transparent text-muted-foreground/40",
                cell.dayId === todayId && "border-gold ring-1 ring-gold/40",
              )}
            >
              {/* The fill is the day's own completion, never a comparison. */}
              {cell.inMonth && ratio > 0 && (
                <span
                  aria-hidden
                  className="absolute inset-x-1 bottom-1 h-1 rounded-full bg-positive"
                  style={{ opacity: 0.35 + ratio * 0.65 }}
                />
              )}
              <span className={cn("tnum", day?.complete && "font-medium")}>
                {formatDayOfMonth(cell.dayId)}
              </span>
              {started && (
                <span
                  aria-hidden
                  title="Logged start"
                  className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary"
                />
              )}
            </button>
          );
        })}
      </div>

      {active.length > 0 && (
        <div className="mt-6">
          <h3 className="eyebrow">Consistency</h3>
          <div className="paper-panel mt-2 divide-y divide-subtle px-3">
            {active.map((habit) => {
              const counts = consistency(completions, habit.id, todayId);
              return (
                <div
                  key={habit.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2"
                >
                  <span className="min-w-0 flex-1 text-[0.88rem] leading-snug">{habit.name}</span>
                  <span className="tnum flex shrink-0 flex-wrap gap-x-4 text-[11px] text-muted-foreground">
                    <span>{consistencyLabel(counts.week, "week")}</span>
                    <span>{consistencyLabel(counts.month, "month")}</span>
                    <span>{counts.quarter} this quarter</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
