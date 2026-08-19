import { formatFocusTotal, formatMonthShort, monthsOfQuarter, type MonthId, type QuarterSummary, type YearSummary } from "@/lib/calendar";
import { cn } from "@/lib/utils";

/**
 * Twelve months at a glance, grouped by quarter.
 *
 * The bar is a proportion of the month's own days, never a comparison between
 * months or against a target. A quiet month simply shows a short bar.
 */
export function YearReview({
  summary,
  currentMonth,
  selectedQuarter,
  onOpenMonth,
  onOpenQuarter,
}: {
  summary: YearSummary;
  /** The real current month, when it falls inside this year. */
  currentMonth: MonthId | null;
  selectedQuarter: QuarterSummary["quarterId"];
  onOpenMonth: (monthId: MonthId) => void;
  onOpenQuarter: (quarterId: string) => void;
}) {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        {summary.quarters.map((quarterId) => {
          const months = monthsOfQuarter(quarterId)
            .map((id) => summary.months.find((m) => m.monthId === id))
            .filter((m): m is YearSummary["months"][number] => Boolean(m));

          return (
            <section
              key={quarterId}
              className={cn(
                "surface p-4",
                quarterId === selectedQuarter && "border-gold/60",
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="eyebrow">{quarterId.replace("-", " ")}</h2>
                <button
                  type="button"
                  onClick={() => onOpenQuarter(quarterId)}
                  className="text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                >
                  Review this quarter
                </button>
              </div>

              <ul className="mt-3 space-y-2">
                {months.map((month) => {
                  const ratio =
                    month.daysInMonth === 0 ? 0 : month.daysWithHabit / month.daysInMonth;

                  return (
                    <li key={month.monthId}>
                      <button
                        type="button"
                        onClick={() => onOpenMonth(month.monthId)}
                        aria-label={`Open ${formatMonthShort(month.monthId)}, ${month.daysWithHabit} of ${month.daysInMonth} days with a habit kept`}
                        aria-current={month.monthId === currentMonth ? "date" : undefined}
                        className="group flex w-full items-center gap-3 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted"
                      >
                        <span
                          className={cn(
                            "w-9 shrink-0 text-[0.8rem]",
                            month.monthId === currentMonth
                              ? "font-medium text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {formatMonthShort(month.monthId)}
                        </span>

                        <span
                          aria-hidden
                          className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-border"
                        >
                          <span
                            className="block h-full rounded-full bg-positive/70"
                            style={{ width: `${Math.round(ratio * 100)}%` }}
                          />
                        </span>

                        <span className="tnum w-10 shrink-0 text-right text-[10px] text-muted-foreground">
                          {month.daysWithHabit}/{month.daysInMonth}
                        </span>
                        <span className="tnum hidden w-14 shrink-0 text-right text-[10px] text-muted-foreground sm:block">
                          {formatFocusTotal(month.focusMs)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <section className="paper-panel p-4">
        <h2 className="eyebrow">Across {summary.year}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
          {[
            ["Days with a habit kept", String(summary.daysWithHabit)],
            ["Habits kept", String(summary.habitsKept)],
            ["Priorities completed", String(summary.prioritiesDone)],
            ["Focused time", formatFocusTotal(summary.focusMs)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-[10px] leading-snug text-muted-foreground">{label}</dt>
              <dd className="tnum mt-0.5 text-[1.1rem]">{value}</dd>
            </div>
          ))}
        </dl>
        {summary.empty && (
          <p className="mt-3 text-[0.82rem] leading-relaxed text-muted-foreground">
            Nothing recorded in {summary.year} yet. Days fill in here as you use Claro.
          </p>
        )}
      </section>
    </div>
  );
}
