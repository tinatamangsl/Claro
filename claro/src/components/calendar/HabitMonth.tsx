import { formatDayLong, formatDayOfMonth } from "@/lib/dates";
import {
  formatFocusTotal,
  monthCompletions,
  monthGrid,
  type MonthId,
  type MonthSummary,
} from "@/lib/calendar";
import { activeHabits } from "@/lib/habits";
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
  /** One summary per day, from the shared aggregation. */
  summary: MonthSummary;
  /** Whether that day carries a written reflection. */
  reflectionOn: (dayId: ISODate) => boolean;
  onOpenDay: (dayId: ISODate) => void;
};

/**
 * The month at a glance: how full each day was, and nothing more.
 *
 * A day's mark reflects how many of that day's habits were kept, as a quiet
 * fill. There is no score, no ranking and no run — an empty day is simply
 * empty, drawn like any other.
 */
export function HabitMonth({
  monthId,
  habits,
  completions,
  todayId,
  cycle,
  summary,
  reflectionOn,
  onOpenDay,
}: Props) {
  const active = activeHabits(habits);
  const byDay = monthCompletions(active, completions, monthId);
  const summaries = new Map(summary.days.map((d) => [d.dayId, d]));
  const reflections = new Set(
    summary.days.filter((d) => reflectionOn(d.dayId)).map((d) => d.dayId),
  );

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
          const stats = summaries.get(cell.dayId);
          const ratio = day && day.total > 0 ? day.done / day.total : 0;
          const started = cycle ? isLoggedStart(cycle, cell.dayId) : false;
          const completedCount =
            (stats?.prioritiesDone ?? 0) + (stats?.actionsDone ?? 0) + (stats?.scheduleDone ?? 0);
          // Backed by the day's own record, so the legend never promises a mark
          // that is not there.
          const reflected = reflections.has(cell.dayId);

          return (
            <button
              key={cell.dayId}
              type="button"
              onClick={() => onOpenDay(cell.dayId)}
              aria-label={
                cell.inMonth && day && stats
                  ? [
                      formatDayLong(cell.dayId),
                      `${day.done} of ${day.total} habits kept`,
                      `${completedCount} things completed`,
                      stats.scheduleTotal > 0
                        ? `${stats.scheduleTotal} scheduled`
                        : null,
                      stats.focusMs > 0 ? `${formatFocusTotal(stats.focusMs)} focused` : null,
                      reflected ? "reflection captured" : null,
                    ]
                      .filter(Boolean)
                      .join(", ")
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

              {/*
                What is booked, as a number rather than a fourth dot. Three
                marks was already the limit of what a 46px cell can carry, and
                "how much is on that day" is a count, not a yes or no.
              */}
              {cell.inMonth && (stats?.scheduleTotal ?? 0) > 0 && (
                <span
                  // Set apart from the day number, which it otherwise reads as
                  // part of: "24" beside "5" is 245.
                  className="tnum absolute top-0.5 right-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-foreground/10 px-1 text-[9px] leading-none text-muted-foreground"
                >
                  {stats!.scheduleTotal}
                </span>
              )}

              {/* A day that held completed work carries a quiet dot. */}
              {cell.inMonth && completedCount > 0 && (
                <span
                  aria-hidden
                  className="absolute bottom-1 left-1 h-1 w-1 rounded-full bg-foreground/40"
                />
              )}
              {/* And one that held a focus block carries the gold mark. */}
              {cell.inMonth && (stats?.focusMs ?? 0) > 0 && (
                <span
                  aria-hidden
                  className="absolute right-1 bottom-[3px] h-1.5 w-1.5 rounded-full bg-gold"
                />
              )}
              {/* A written reflection: an outline, so it reads apart from a fill. */}
              {cell.inMonth && reflected && (
                <span
                  aria-hidden
                  className="absolute bottom-[3px] left-1 h-1.5 w-1.5 rounded-full border border-primary"
                />
              )}
              {started && (
                <span
                  aria-hidden
                  title="Logged start"
                  className="absolute right-1 bottom-1 h-1.5 w-1.5 rounded-full bg-primary"
                />
              )}
            </button>
          );
        })}
      </div>

    </div>
  );
}
