import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { PeriodHeader } from "@/components/PeriodHeader";
import { CyclePanel } from "@/components/calendar/CyclePanel";
import { HabitMonth } from "@/components/calendar/HabitMonth";
import { HabitConsistencyList, MonthStats } from "@/components/calendar/MonthStats";
import { GoalProgressList } from "@/components/calendar/GoalProgressList";
import { QuarterReview } from "@/components/calendar/QuarterReview";
import { YearReview } from "@/components/calendar/YearReview";
import { useClaro } from "@/lib/claro-store";
import {
  formatMonthLong,
  monthOfDay,
  monthsOfQuarter,
  quarterOfMonth,
  shiftMonthId,
  summariseMonth,
  summariseQuarter,
  summariseYear,
  yearOfMonth,
  type MonthId,
} from "@/lib/calendar";
import { formatQuarterMonths, formatQuarterShort } from "@/lib/dates";
import { activeHabits } from "@/lib/habits";
import { newId } from "@/lib/id";
import { cn } from "@/lib/utils";
import type { ISODate } from "@/lib/types";

/** Month is the detailed view; Quarter and Year are read-only review layers. */
const VIEWS = ["month", "quarter", "year"] as const;
type View = (typeof VIEWS)[number];

const VIEW_LABEL: Record<View, string> = {
  month: "Month",
  quarter: "Quarter",
  year: "Year",
};

export const Route = createFileRoute("/calendar")({
  validateSearch: (search: Record<string, unknown>): { m?: string; v?: View } => {
    // Every key genuinely optional, or `search` becomes required on every Link.
    const next: { m?: string; v?: View } = {};
    if (typeof search.m === "string" && /^\d{4}-\d{2}$/.test(search.m)) next.m = search.m;
    if (VIEWS.includes(search.v as View)) next.v = search.v as View;
    return next;
  },
  component: () => (
    <AppShell>
      <CalendarView />
    </AppShell>
  ),
  head: () => ({ meta: [{ title: "Calendar: Claro" }] }),
});

function CalendarView() {
  const {
    today,
    state,
    cycle,
    setCycleEnabled,
    logCycleStart,
    deleteCycleEntry,
    deleteAllCycleData,
  } = useClaro();
  const { m, v } = Route.useSearch();
  const navigate = useNavigate();

  /**
   * One anchor month drives all three views, so switching view never loses
   * where you were and drilling down is just a change of view.
   */
  const currentMonth = monthOfDay(today);
  const monthId: MonthId = m ?? currentMonth;
  const view: View = v ?? "month";
  const quarterId = quarterOfMonth(monthId);
  const year = yearOfMonth(monthId);

  const go = (next: { m?: MonthId; v?: View }) =>
    navigate({ to: "/calendar", search: { m: next.m ?? monthId, v: next.v ?? view } });

  const habits = activeHabits(state.habits);

  // One shared aggregation. No view computes a total of its own.
  const month = summariseMonth(state, monthId, habits);
  const quarter = summariseQuarter(state, quarterId, habits);
  const yearSummary = summariseYear(state, year, habits);

  const header =
    view === "month"
      ? {
          title: formatMonthLong(monthId),
          subtitle: month.empty
            ? "Nothing recorded yet. Days fill in here as you use Claro."
            : `${month.daysWithHabit} of ${month.daysInMonth} days with a habit kept`,
          prev: () => go({ m: shiftMonthId(monthId, -1) }),
          next: () => go({ m: shiftMonthId(monthId, 1) }),
          prevLabel: "Previous month",
          nextLabel: "Next month",
          atNow: monthId === currentMonth,
          toNow: () => go({ m: currentMonth }),
          nowLabel: "This month",
        }
      : view === "quarter"
        ? {
            title: formatQuarterShort(quarterId),
            subtitle: formatQuarterMonths(quarterId),
            prev: () => go({ m: shiftMonthId(monthsOfQuarter(quarterId)[0], -3) }),
            next: () => go({ m: shiftMonthId(monthsOfQuarter(quarterId)[0], 3) }),
            prevLabel: "Previous quarter",
            nextLabel: "Next quarter",
            atNow: quarterId === quarterOfMonth(currentMonth),
            toNow: () => go({ m: currentMonth }),
            nowLabel: "This quarter",
          }
        : {
            title: String(year),
            subtitle: yearSummary.empty ? "Nothing recorded yet" : "Twelve months at a glance",
            prev: () => go({ m: shiftMonthId(monthId, -12) }),
            next: () => go({ m: shiftMonthId(monthId, 12) }),
            prevLabel: "Previous year",
            nextLabel: "Next year",
            atNow: year === yearOfMonth(currentMonth),
            toNow: () => go({ m: currentMonth }),
            nowLabel: "This year",
          };

  return (
    <div className="space-y-8">
      <PeriodHeader
        eyebrow="A calm look back"
        title={header.title}
        subtitle={header.subtitle}
        onPrev={header.prev}
        onNext={header.next}
        prevLabel={header.prevLabel}
        nextLabel={header.nextLabel}
        onToday={header.atNow ? undefined : header.toNow}
        todayLabel={header.nowLabel}
      />

      {/* The view switcher. Month is where the detail lives. */}
      <div
        role="tablist"
        aria-label="Calendar view"
        className="flex w-fit items-center gap-1 rounded-full border border-border bg-card p-1"
      >
        {VIEWS.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={view === option}
            onClick={() => go({ v: option })}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[0.82rem] transition-colors",
              view === option
                ? "bg-gold/20 font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {VIEW_LABEL[option]}
          </button>
        ))}
      </div>

      {view === "month" && (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="space-y-8">
            <section>
              <div className="flex items-baseline gap-2.5">
                <h2 className="eyebrow">Habits</h2>
                <span className="text-[11px] text-muted-foreground">a pattern, not a score</span>
              </div>
              <div className="paper-panel mt-3 p-4">
                <HabitMonth
                  monthId={monthId}
                  habits={state.habits}
                  completions={state.habitCompletions}
                  todayId={today}
                  cycle={cycle.settings.enabled ? cycle : null}
                  summary={month}
                  onOpenDay={(dayId: ISODate) =>
                    navigate({ to: "/today", search: { d: dayId } })
                  }
                />
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-1.5 w-1 rounded-full bg-positive" />
                  habits kept
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-1 w-1 rounded-full bg-foreground/40" />
                  something completed
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />
                  focus block
                </span>
              </p>
            </section>

            <section>
              <h2 className="eyebrow">Consistency</h2>
              <div className="paper-panel mt-3 px-4">
                <HabitConsistencyList month={month} />
              </div>
            </section>
          </div>

          <div className="space-y-8">
            <section>
              <h2 className="eyebrow">This month</h2>
              <div className="paper-panel mt-3 p-4">
                <MonthStats month={month} />
              </div>
            </section>

            <section>
              <div className="flex items-baseline gap-2.5">
                <h2 className="eyebrow">Goals</h2>
                <span className="text-[11px] text-muted-foreground">
                  from the priorities you linked
                </span>
              </div>
              <div className="paper-panel mt-3 p-4">
                <GoalProgressList
                  goals={summariseQuarter(state, quarterId, habits).goals}
                />
              </div>
            </section>

            <CyclePanel
              cycle={cycle}
              todayId={today}
              onEnable={(enabled) => setCycleEnabled(enabled, new Date())}
              onLogStart={(startDate) =>
                logCycleStart({ id: newId(), startDate, loggedAt: new Date().toISOString() })
              }
              onDeleteEntry={deleteCycleEntry}
              onDeleteAll={deleteAllCycleData}
            />
          </div>
        </div>
      )}

      {view === "quarter" && (
        <QuarterReview
          summary={quarter}
          currentMonth={currentMonth}
          onOpenMonth={(id) => go({ m: id, v: "month" })}
        />
      )}

      {view === "year" && (
        <YearReview
          summary={yearSummary}
          currentMonth={yearOfMonth(currentMonth) === year ? currentMonth : null}
          selectedQuarter={quarterId}
          onOpenMonth={(id) => go({ m: id, v: "month" })}
          onOpenQuarter={(id) => go({ m: monthsOfQuarter(id)[0], v: "quarter" })}
        />
      )}
    </div>
  );
}
