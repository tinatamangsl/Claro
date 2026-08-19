import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { PeriodHeader } from "@/components/PeriodHeader";
import { CyclePanel } from "@/components/calendar/CyclePanel";
import { HabitMonth } from "@/components/calendar/HabitMonth";
import { useClaro } from "@/lib/claro-store";
import {
  daysWithAnyCompletion,
  formatMonthLong,
  monthDayIds,
  monthOfDay,
  shiftMonthId,
  type MonthId,
} from "@/lib/calendar";
import { activeHabits } from "@/lib/habits";
import { newId } from "@/lib/id";
import type { ISODate } from "@/lib/types";

export const Route = createFileRoute("/calendar")({
  validateSearch: (search: Record<string, unknown>): { m?: string } => {
    // Genuinely optional, or every <Link> here would need a search prop.
    return typeof search.m === "string" && /^\d{4}-\d{2}$/.test(search.m)
      ? { m: search.m }
      : {};
  },
  component: () => (
    <AppShell>
      <CalendarView />
    </AppShell>
  ),
  head: () => ({ meta: [{ title: "Month — Claro" }] }),
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
  const { m } = Route.useSearch();
  const navigate = useNavigate();

  const currentMonth = monthOfDay(today);
  const monthId: MonthId = m ?? currentMonth;
  const go = (id: MonthId) => navigate({ to: "/calendar", search: { m: id } });

  const habits = activeHabits(state.habits);
  const daysKept = daysWithAnyCompletion(habits, state.habitCompletions, monthId);
  const daysInMonth = monthDayIds(monthId).length;

  return (
    <div className="space-y-10">
      <PeriodHeader
        eyebrow="A month at a glance"
        title={formatMonthLong(monthId)}
        subtitle={
          habits.length === 0
            ? "No habits yet — add one on Today and it will show up here."
            : `${daysKept} of ${daysInMonth} days with something kept`
        }
        onPrev={() => go(shiftMonthId(monthId, -1))}
        onNext={() => go(shiftMonthId(monthId, 1))}
        prevLabel="Previous month"
        nextLabel="Next month"
        onToday={monthId !== currentMonth ? () => go(currentMonth) : undefined}
        todayLabel="This month"
      />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section>
          <div className="flex items-baseline gap-2.5">
            <h2 className="eyebrow">Habits</h2>
            <span className="text-[11px] text-muted-foreground">
              a pattern, not a score
            </span>
          </div>
          <div className="paper-panel mt-3 p-4">
            <HabitMonth
              monthId={monthId}
              habits={state.habits}
              completions={state.habitCompletions}
              todayId={today}
              cycle={cycle.settings.enabled ? cycle : null}
              onOpenDay={(dayId: ISODate) => navigate({ to: "/today", search: { d: dayId } })}
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
  );
}
