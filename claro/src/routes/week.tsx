import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

import { AddItem } from "@/components/AddItem";
import { AppShell } from "@/components/AppShell";
import { EditableText } from "@/components/EditableText";
import { ItemRow } from "@/components/ItemRow";
import { PeriodHeader } from "@/components/PeriodHeader";
import { Section } from "@/components/Section";
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
  head: () => ({ meta: [{ title: "Week — Claro" }] }),
});

function WeekView() {
  const { today, week, quarter, updateWeek } = useClaro();
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
        eyebrow="Commitment"
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
      <div className="surface p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <span className="eyebrow">Your quarter</span>
          <Link
            to="/quarter"
            search={{ q: quarterId }}
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Edit direction →
          </Link>
        </div>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {DOMAINS.map((domain) => (
            <div key={domain}>
              <div className="text-[11px] font-medium text-muted-foreground">
                {DOMAIN_META[domain].label} Main Quest
              </div>
              <p className="mt-1 font-[family-name:var(--font-display)] text-[1.15rem] leading-snug">
                {parentQuarter[domain].mainQuest || (
                  <span className="text-muted-foreground/60">Not set yet</span>
                )}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-10 md:grid-cols-2 md:gap-8">
        {DOMAINS.map((domain) => (
          <WeekColumn
            key={domain}
            domain={domain}
            record={record}
            weekId={weekId}
            onUpdate={updateWeek}
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
}: {
  domain: Domain;
  record: Week;
  weekId: WeekId;
  onUpdate: (id: WeekId, recipe: (w: Week) => Week) => void;
}) {
  const side = record[domain];
  const label = DOMAIN_META[domain].label;

  const patch = (recipe: (s: Week[Domain]) => Week[Domain]) =>
    onUpdate(weekId, (wk) => ({ ...wk, [domain]: recipe(wk[domain]) }));

  const atCap = side.actions.length >= MAX_WEEK_ACTIONS;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={
            domain === "work"
              ? "h-1.5 w-1.5 rounded-full bg-primary"
              : "h-1.5 w-1.5 rounded-full bg-gold"
          }
        />
        <h2 className="text-[1.15rem] font-medium tracking-tight">{label}</h2>
      </div>

      <div className="surface-raised p-6">
        <div className="eyebrow">
          My main {domain === "work" ? "work" : "personal"} goal this week
        </div>
        <EditableText
          value={side.goal}
          onCommit={(value) => patch((s) => ({ ...s, goal: value }))}
          multiline
          rows={1}
          ariaLabel={`${label} weekly goal`}
          placeholder="What has to move forward by Sunday?"
          className="mt-2.5 -ml-2 font-[family-name:var(--font-display)] text-[1.5rem] leading-[1.2] tracking-tight"
        />
      </div>

      <Section
        title="3 things I'll do to achieve this"
        counter={`${side.actions.length}/${MAX_WEEK_ACTIONS}`}
      >
        <div className="divide-y divide-subtle">
          {side.actions.map((action) => (
            <ItemRow
              key={action.id}
              text={action.text}
              done={action.done}
              label={`${label} weekly action`}
              onToggle={() => patch((s) => ({ ...s, actions: toggleById(s.actions, action.id) }))}
              onCommit={(value) =>
                patch((s) => ({ ...s, actions: updateById(s.actions, action.id, { text: value }) }))
              }
              onDelete={() => patch((s) => ({ ...s, actions: removeById(s.actions, action.id) }))}
            />
          ))}
        </div>
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
      </Section>
    </div>
  );
}
