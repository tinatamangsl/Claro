import { formatFocusTotal, type MonthSummary } from "@/lib/calendar";
import { consistencyLabel } from "@/lib/habits";

/**
 * The month's totals, as plain counts. There is no score here, nothing to
 * compare against anyone else, and nothing that a quiet month can lose.
 */
export function MonthStats({ month }: { month: MonthSummary }) {
  const stats: [string, string][] = [
    ["Days with a habit kept", `${month.daysWithHabit} of ${month.daysInMonth}`],
    ["Habits kept", String(month.habitsKept)],
    ["Priorities completed", String(month.prioritiesDone)],
    ["Actions completed", String(month.actionsDone)],
    ["Focused time", formatFocusTotal(month.focusMs)],
    ["Focus sessions", String(month.focusSessions)],
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
      {stats.map(([label, value]) => (
        <div key={label}>
          <dt className="text-[10px] leading-snug text-muted-foreground">{label}</dt>
          <dd className="tnum text-[0.95rem]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One habit's month, in the same calm language used on Today. */
export function HabitConsistencyList({ month }: { month: MonthSummary }) {
  if (month.perHabit.length === 0) {
    return (
      <p className="text-[0.82rem] leading-relaxed text-muted-foreground">
        No habits yet. Add one on Today and it will show up here.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-subtle">
      {month.perHabit.map(({ habit, kept }) => (
        <li
          key={habit.id}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2"
        >
          <span className="min-w-0 flex-1 text-[0.88rem] leading-snug">{habit.name}</span>
          <span className="tnum shrink-0 text-[11px] text-muted-foreground">
            {consistencyLabel(kept, "month")}
          </span>
        </li>
      ))}
    </ul>
  );
}
