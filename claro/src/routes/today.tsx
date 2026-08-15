import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { EditableText } from "@/components/EditableText";
import { PeriodHeader } from "@/components/PeriodHeader";
import { ActionLists } from "@/components/today/ActionLists";
import { NonNegotiablesBlock } from "@/components/today/NonNegotiablesBlock";
import { PrioritiesBlock } from "@/components/today/PrioritiesBlock";
import { ScheduleBlock } from "@/components/today/ScheduleBlock";
import { WellbeingBlock } from "@/components/today/WellbeingBlock";
import { useClaro } from "@/lib/claro-store";
import {
  formatDayDate,
  formatDayWeekday,
  formatQuarterShort,
  formatWeekNumber,
  quarterOfDay,
  shiftDayId,
  weekOfDay,
} from "@/lib/dates";
import type { Day, ISODate } from "@/lib/types";

export const Route = createFileRoute("/today")({
  validateSearch: (search: Record<string, unknown>): { d?: string } =>
    typeof search.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.d) ? { d: search.d } : {},
  component: () => (
    <AppShell>
      <TodayView />
    </AppShell>
  ),
  head: () => ({ meta: [{ title: "Today — Claro" }] }),
});

function TodayView() {
  const { today, day, week, updateDay } = useClaro();
  const { d } = Route.useSearch();
  const navigate = useNavigate();

  const dayId: ISODate = d ?? today;
  const record = day(dayId);

  const weekId = weekOfDay(dayId);
  const quarterId = quarterOfDay(dayId);
  const parentWeek = week(weekId);

  const go = (id: ISODate) => navigate({ to: "/today", search: { d: id } });
  const patch = (p: Partial<Day>) => updateDay(dayId, (current) => ({ ...current, ...p }));

  return (
    <div className="space-y-12">
      <PeriodHeader
        eyebrow={dayId === today ? "Execution · Today" : "Execution"}
        title={formatDayWeekday(dayId)}
        subtitle={formatDayDate(dayId)}
        onPrev={() => go(shiftDayId(dayId, -1))}
        onNext={() => go(shiftDayId(dayId, 1))}
        prevLabel="Previous day"
        nextLabel="Next day"
        onToday={dayId !== today ? () => go(today) : undefined}
        todayLabel="Today"
        parent={
          <span className="flex items-center gap-2">
            <Link
              to="/quarter"
              search={{ q: quarterId }}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {formatQuarterShort(quarterId)}
              <ArrowUpRight className="h-3 w-3" />
            </Link>
            <span aria-hidden className="text-[11px] text-muted-foreground/40">
              ·
            </span>
            <Link
              to="/week"
              search={{ w: weekId }}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {formatWeekNumber(weekId)}
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </span>
        }
      />

      <PrioritiesBlock
        day={record}
        week={parentWeek}
        onPatch={(key, p) =>
          updateDay(dayId, (current) => ({ ...current, [key]: { ...current[key], ...p } }))
        }
      />

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-10">
        <ScheduleBlock day={record} onChange={(scheduleItems) => patch({ scheduleItems })} />
        <ActionLists day={record} onChange={(actions) => patch({ actions })} />
      </div>

      <NonNegotiablesBlock
        day={record}
        onChange={(nonNegotiables) => patch({ nonNegotiables })}
      />

      <WellbeingBlock day={record} onPatch={patch} />

      <section>
        <div className="flex items-baseline gap-2.5">
          <h2 className="eyebrow">Notes</h2>
          <span className="text-[11px] text-muted-foreground">anything worth keeping</span>
        </div>
        <div className="surface mt-3 p-4 sm:p-5">
          <EditableText
            value={record.notes}
            onCommit={(notes) => patch({ notes })}
            multiline
            rows={5}
            ariaLabel="Notes for today"
            placeholder="How did today actually go?"
            className="-ml-2 text-[0.92rem] leading-relaxed"
          />
        </div>
      </section>
    </div>
  );
}
