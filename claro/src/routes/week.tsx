import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

import { AddItem } from "@/components/AddItem";
import { AppShell } from "@/components/AppShell";
import { EditableText } from "@/components/EditableText";
import { FocusOn } from "@/components/FocusOn";
import { CycleWeekCard } from "@/components/cycle/CycleWeekCard";
import { SortableRows } from "@/components/SortableRows";
import { PeriodHeader } from "@/components/PeriodHeader";
import { useClaro } from "@/lib/claro-store";
import {
  formatQuarterShort,
  formatWeekNumber,
  formatWeekRange,
  quarterOfWeek,
  shiftWeekId,
  weekOfDay,
} from "@/lib/dates";
import { newId } from "@/lib/id";
import { addCapped, removeById, toggleById, updateById } from "@/lib/mutations";
import {
  DOMAIN_META,
  DOMAINS,
  MAX_WEEK_ACTIONS,
  type Domain,
  type Week,
  type WeekId,
} from "@/lib/types";

export const Route = createFileRoute("/week")({
  validateSearch: (search: Record<string, unknown>): { w?: string } =>
    typeof search.w === "string" && /^\d{4}-W\d{2}$/.test(search.w) ? { w: search.w } : {},
  component: () => (
    <AppShell>
      <WeekView />
    </AppShell>
  ),
  head: () => ({ meta: [{ title: "Week: Claro" }] }),
});

function WeekView() {
  const { today, week, quarter, updateWeek, recordUndo } = useClaro();
  const { w } = Route.useSearch();
  const navigate = useNavigate();

  const currentWeekId = weekOfDay(today);
  const weekId: WeekId = w ?? currentWeekId;
  const record = week(weekId);

  const quarterId = quarterOfWeek(weekId);
  const parentQuarter = quarter(quarterId);

  const go = (id: WeekId) => navigate({ to: "/week", search: { w: id } });

  return (
    <div className="space-y-10">
      <PeriodHeader
        eyebrow="I will commit this week"
        title={formatWeekNumber(weekId)}
        subtitle={formatWeekRange(weekId)}
        onPrev={() => go(shiftWeekId(weekId, -1))}
        onNext={() => go(shiftWeekId(weekId, 1))}
        prevLabel="Previous week"
        nextLabel="Next week"
        onToday={weekId !== currentWeekId ? () => go(currentWeekId) : undefined}
        todayLabel="This week"
        parent={
          <Link
            to="/quarter"
            search={{ q: quarterId }}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {formatQuarterShort(quarterId)}
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        }
      />

      {/* The hierarchy made visible: this week answers to that quarter. */}
      <div className="surface-quiet relative overflow-hidden py-4 pl-6 pr-5 sm:pl-7">
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-gold/70" />
        <div className="flex items-baseline justify-between gap-3">
          <span className="eyebrow">This week answers to</span>
          <Link
            to="/quarter"
            search={{ q: quarterId }}
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Edit direction →
          </Link>
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 sm:gap-6">
          {DOMAINS.map((domain) => (
            <div key={domain}>
              <div className="eyebrow">{DOMAIN_META[domain].label}</div>
              <p className="mt-1.5 display text-[1.1rem] leading-snug">
                {parentQuarter[domain].mainQuest || (
                  <span className="text-muted-foreground">Not set yet</span>
                )}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/*
        Below the hierarchy on purpose: private, small and inert. It reports,
        it never adjusts the week, and weekly planning still leads the page.
      */}
      <CycleWeekCard className="sm:max-w-md" />

      <div className="grid items-stretch gap-8 md:grid-cols-2">
        {DOMAINS.map((domain) => (
          <WeekColumn
            key={domain}
            domain={domain}
            record={record}
            weekId={weekId}
            onUpdate={updateWeek}
            recordUndo={recordUndo}
          />
        ))}
      </div>
    </div>
  );
}

function WeekColumn({
  domain,
  record,
  weekId,
  onUpdate,
  recordUndo,
}: {
  domain: Domain;
  record: Week;
  weekId: WeekId;
  onUpdate: (id: WeekId, recipe: (w: Week) => Week) => void;
  recordUndo: (label: string) => void;
}) {
  const side = record[domain];
  const label = DOMAIN_META[domain].label;

  const patch = (recipe: (s: Week[Domain]) => Week[Domain]) =>
    onUpdate(weekId, (wk) => ({ ...wk, [domain]: recipe(wk[domain]) }));

  const atCap = side.actions.length >= MAX_WEEK_ACTIONS;

  const doneActions = side.actions.filter((a) => a.done).length;

  return (
    <div className="paper-page paper-bound tape relative flex h-full flex-col p-6 pt-8 sm:p-8 sm:pt-9">
      <span aria-hidden className="binding-holes" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="badge">{label}</span>
        {side.actions.length > 0 && (
          <span className="tnum text-[11px] text-muted-foreground">
            {doneActions} of {side.actions.length} done
          </span>
        )}
      </div>

      <div className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <div className="eyebrow">
            My main {domain === "work" ? "work" : "personal"} goal this week
          </div>
          <FocusOn
            compact
            target={{ kind: "weekGoal", weekId, domain, title: side.goal }}
          />
        </div>
        <EditableText
          value={side.goal}
          onCommit={(value) => patch((s) => ({ ...s, goal: value }))}
          multiline
          rows={1}
          ariaLabel={`${label} weekly goal`}
          placeholder="What has to move forward by Sunday?"
          className="mt-2.5 -ml-2 display text-[1.5rem] leading-[1.2] tracking-tight"
        />
      </div>

      <div className="mt-7 border-t border-border/70 pt-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="eyebrow">3 things I'll do to achieve this</h3>
          <span className="eyebrow tnum">
            {side.actions.length}/{MAX_WEEK_ACTIONS}
          </span>
        </div>
        <SortableRows
          items={side.actions}
          label={`${label} weekly action`}
          className="mt-3 divide-y divide-subtle"
          onReorder={(actions) => patch((s) => ({ ...s, actions }))}
          onToggle={(action) =>
            patch((s) => ({ ...s, actions: toggleById(s.actions, action.id) }))
          }
          onCommit={(action, value) =>
            patch((s) => ({ ...s, actions: updateById(s.actions, action.id, { text: value }) }))
          }
          onDelete={(action) => {
            recordUndo("Action deleted");
            patch((s) => ({ ...s, actions: removeById(s.actions, action.id) }));
          }}
          trailing={(action) => (
            <FocusOn
              compact
              target={{
                kind: "weekAction",
                weekId,
                domain,
                actionId: action.id,
                title: action.text,
              }}
              className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            />
          )}
        />
        <div className="mt-1">
          <AddItem
            label="Add an action"
            disabled={atCap}
            disabledHint="Three actions. Pick the ones that actually move it."
            onAdd={(text) =>
              patch((s) => ({
                ...s,
                actions: addCapped(
                  s.actions,
                  { id: newId(), text, done: false },
                  MAX_WEEK_ACTIONS,
                ),
              }))
            }
          />
        </div>
      </div>
    </div>
  );
}
