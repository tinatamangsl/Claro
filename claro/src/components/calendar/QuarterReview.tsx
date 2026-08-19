import { ChevronRight } from "lucide-react";

import { GoalProgressList } from "@/components/calendar/GoalProgressList";
import {
  formatFocusTotal,
  formatMonthLong,
  type MonthId,
  type QuarterSummary,
} from "@/lib/calendar";
import { formatQuarterShort } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * Three months, read only.
 *
 * This exists to answer one question: what did I consistently make space for
 * this quarter. It is a review layer, not a planning level, so nothing here is
 * editable and nothing is scored.
 */
export function QuarterReview({
  summary,
  currentMonth,
  onOpenMonth,
}: {
  summary: QuarterSummary;
  currentMonth: MonthId;
  onOpenMonth: (monthId: MonthId) => void;
}) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="eyebrow">The three months</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {summary.months.map((month) => (
            <button
              key={month.monthId}
              type="button"
              onClick={() => onOpenMonth(month.monthId)}
              aria-label={`Open ${formatMonthLong(month.monthId)}`}
              className={cn(
                "surface group p-4 text-left transition-colors hover:border-foreground/35",
                month.monthId === currentMonth && "border-gold/60",
              )}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="display text-[1.15rem]">
                  {formatMonthLong(month.monthId)}
                </span>
                <ChevronRight
                  aria-hidden
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                />
              </span>

              {month.empty ? (
                <span className="mt-2 block text-[0.82rem] leading-relaxed text-muted-foreground">
                  Nothing recorded.
                </span>
              ) : (
                <dl className="mt-3 space-y-1.5">
                  <Row
                    label="Days with a habit kept"
                    value={`${month.daysWithHabit} of ${month.daysInMonth}`}
                  />
                  <Row label="Priorities completed" value={String(month.prioritiesDone)} />
                  <Row label="Actions completed" value={String(month.actionsDone)} />
                  <Row label="Focused time" value={formatFocusTotal(month.focusMs)} />
                </dl>
              )}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-baseline gap-2.5">
          <h2 className="eyebrow">Goals this quarter</h2>
          <span className="text-[11px] text-muted-foreground">
            from the priorities you linked
          </span>
        </div>
        <div className="paper-panel mt-3 p-4">
          <GoalProgressList goals={summary.goals} />
        </div>
      </section>

      <section>
        <h2 className="eyebrow">Across {formatQuarterShort(summary.quarterId)}</h2>
        <div className="paper-panel mt-3 p-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
            <Block label="Days with a habit kept" value={String(summary.daysWithHabit)} />
            <Block label="Habits kept" value={String(summary.habitsKept)} />
            <Block label="Priorities completed" value={String(summary.prioritiesDone)} />
            <Block label="Focused time" value={formatFocusTotal(summary.focusMs)} />
          </dl>
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] leading-snug text-muted-foreground">{label}</dt>
      <dd className="tnum shrink-0 text-[0.85rem]">{value}</dd>
    </div>
  );
}

function Block({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] leading-snug text-muted-foreground">{label}</dt>
      <dd className="tnum mt-0.5 text-[1.1rem]">{value}</dd>
    </div>
  );
}
