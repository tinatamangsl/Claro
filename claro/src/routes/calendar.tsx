import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { NotebookPen } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { PeriodHeader } from "@/components/PeriodHeader";
import { Breadcrumbs } from "@/components/calendar/Breadcrumbs";
import { CyclePanel } from "@/components/calendar/CyclePanel";
import { Legend } from "@/components/calendar/Legend";
import { MonthPlanPanel } from "@/components/calendar/MonthPlanPanel";
import { HabitMonth } from "@/components/calendar/HabitMonth";
import { HabitConsistencyList, MonthStats } from "@/components/calendar/MonthStats";
import { GoalProgressList } from "@/components/calendar/GoalProgressList";
import { QuarterReview } from "@/components/calendar/QuarterReview";
import { YearReview } from "@/components/calendar/YearReview";
import { useClaro } from "@/lib/claro-store";
import {
  anchorOf,
  drillPath,
  firstDayOfMonth,
  firstDayOfQuarter,
  formatMonthLong,
  monthOfDay,
  monthsOfQuarter,
  quarterOfMonth,
  shiftMonthId,
  summariseMonth,
  summariseQuarter,
  summariseYear,
  weeksOfMonth,
  yearOfMonth,
  type Crumb,
  type MonthId,
} from "@/lib/calendar";
import { formatQuarterMonths, formatQuarterShort } from "@/lib/dates";
import { hasReflection } from "@/lib/daily-review";
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
  validateSearch: (search: Record<string, unknown>): { d?: string; v?: View } => {
    // One date anchors every view, so drilling in and out never loses the day.
    // Every key genuinely optional, or `search` becomes required on every Link.
    const next: { d?: string; v?: View } = {};
    if (typeof search.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.d)) next.d = search.d;
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
    monthPlan,
    updateMonthPlan,
    day,
  } = useClaro();
  const { d, v } = Route.useSearch();
  const navigate = useNavigate();

  /**
   * One anchored day drives every view. Year, quarter, month and week are all
   * derived from it, so zooming out and back in returns you to the same day.
   */
  const anchor = anchorOf(d ?? today);
  const currentMonth = monthOfDay(today);
  const monthId: MonthId = anchor.monthId;
  const view: View = v ?? "month";
  const quarterId = anchor.quarterId;
  const year = anchor.year;

  const go = (next: { d?: string; v?: View }) =>
    navigate({ to: "/calendar", search: { d: next.d ?? anchor.dayId, v: next.v ?? view } });

  /** The two innermost crumbs leave Calendar for where the work actually is. */
  const drill = (target: Crumb["view"]) => {
    if (target === "week") {
      navigate({ to: "/week", search: { w: anchor.weekId } });
      return;
    }
    if (target === "day") {
      navigate({ to: "/today", search: { d: anchor.dayId } });
      return;
    }
    go({ v: target });
  };

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
          prev: () => go({ d: firstDayOfMonth(shiftMonthId(monthId, -1)) }),
          next: () => go({ d: firstDayOfMonth(shiftMonthId(monthId, 1)) }),
          prevLabel: "Previous month",
          nextLabel: "Next month",
          atNow: monthId === currentMonth,
          toNow: () => go({ d: today }),
          nowLabel: "This month",
        }
      : view === "quarter"
        ? {
            title: formatQuarterShort(quarterId),
            subtitle: formatQuarterMonths(quarterId),
            prev: () => go({ d: firstDayOfMonth(shiftMonthId(monthsOfQuarter(quarterId)[0], -3)) }),
            next: () => go({ d: firstDayOfMonth(shiftMonthId(monthsOfQuarter(quarterId)[0], 3)) }),
            prevLabel: "Previous quarter",
            nextLabel: "Next quarter",
            atNow: quarterId === quarterOfMonth(currentMonth),
            toNow: () => go({ d: today }),
            nowLabel: "This quarter",
          }
        : {
            title: String(year),
            subtitle: yearSummary.empty ? "Nothing recorded yet" : "Twelve months at a glance",
            prev: () => go({ d: firstDayOfMonth(shiftMonthId(monthId, -12)) }),
            next: () => go({ d: firstDayOfMonth(shiftMonthId(monthId, 12)) }),
            prevLabel: "Previous year",
            nextLabel: "Next year",
            atNow: year === yearOfMonth(currentMonth),
            toNow: () => go({ d: today }),
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

      <Breadcrumbs
        crumbs={drillPath(anchor)}
        current={view === "month" ? "month" : view}
        onGo={drill}
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
                  reflectionOn={(dayId) => hasReflection(day(dayId))}
                  onOpenDay={(dayId: ISODate) => navigate({ to: "/today", search: { d: dayId } })}
                />
              </div>
              <div className="mt-2">
                <Legend />
              </div>

              {/* The weeks this month touches, straight to the Week planner. */}
              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">Open a week</span>
                {weeksOfMonth(monthId).map((weekId) => (
                  <button
                    key={weekId}
                    type="button"
                    onClick={() => navigate({ to: "/week", search: { w: weekId } })}
                    className="btn btn-sm btn-quiet"
                  >
                    Week {Number(weekId.split("-W")[1])}
                  </button>
                ))}
              </div>
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

            <MonthPlanPanel
              monthId={monthId}
              plan={monthPlan(monthId)}
              onWrite={(patch) => updateMonthPlan(monthId, (p) => ({ ...p, ...patch }))}
            />

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
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-prose text-[0.88rem] leading-relaxed text-muted-foreground">
              A look back at what you made space for. Planning happens in its own workspace.
            </p>
            <Link
              to="/quarter-plan"
              search={{ q: quarterId }}
              className="btn btn-sm btn-primary shrink-0 gap-1.5"
            >
              <NotebookPen aria-hidden className="h-3.5 w-3.5" />
              Plan this quarter
            </Link>
          </div>
            <QuarterReview
            summary={quarter}
            currentMonth={currentMonth}
            onOpenMonth={(id) => go({ d: firstDayOfMonth(id), v: "month" })}
          />
        </>
      )}

      {view === "year" && (
        <YearReview
          summary={yearSummary}
          currentMonth={yearOfMonth(currentMonth) === year ? currentMonth : null}
          selectedQuarter={quarterId}
          onOpenMonth={(id) => go({ d: firstDayOfMonth(id), v: "month" })}
          onOpenQuarter={(id) => go({ d: firstDayOfQuarter(id), v: "quarter" })}
        />
      )}
    </div>
  );
}
