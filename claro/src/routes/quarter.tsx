import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AddItem } from "@/components/AddItem";
import { AppShell } from "@/components/AppShell";
import { EditableText } from "@/components/EditableText";
import { FocusOn } from "@/components/FocusOn";
import { SortableRows } from "@/components/SortableRows";
import { PeriodHeader } from "@/components/PeriodHeader";
import { useClaro } from "@/lib/claro-store";
import { formatQuarterMonths, formatQuarterShort, quarterOfDay, shiftQuarterId } from "@/lib/dates";
import { newId } from "@/lib/id";
import { addCapped, removeById, toggleById, updateById } from "@/lib/mutations";
import {
  DOMAIN_META,
  DOMAINS,
  MAX_SIDE_QUESTS,
  type Domain,
  type Quarter,
  type QuarterId,
} from "@/lib/types";

export const Route = createFileRoute("/quarter")({
  // Returning an object with a genuinely optional key (rather than `{ q: undefined }`)
  // keeps `search` optional on every <Link to="/quarter">.
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === "string" && /^\d{4}-Q[1-4]$/.test(search.q) ? { q: search.q } : {},
  component: () => (
    <AppShell>
      <QuarterView />
    </AppShell>
  ),
  head: () => ({ meta: [{ title: "Quarter — Claro" }] }),
});

function QuarterView() {
  const { today, quarter, updateQuarter } = useClaro();
  const { q } = Route.useSearch();
  const navigate = useNavigate();

  const currentQuarterId = quarterOfDay(today);
  const quarterId: QuarterId = q ?? currentQuarterId;
  const record = quarter(quarterId);

  const go = (id: QuarterId) => navigate({ to: "/quarter", search: { q: id } });

  return (
    <div className="space-y-12">
      <PeriodHeader
        eyebrow="My direction for this quarter"
        title={formatQuarterShort(quarterId)}
        subtitle={formatQuarterMonths(quarterId)}
        onPrev={() => go(shiftQuarterId(quarterId, -1))}
        onNext={() => go(shiftQuarterId(quarterId, 1))}
        prevLabel="Previous quarter"
        nextLabel="Next quarter"
        onToday={quarterId !== currentQuarterId ? () => go(currentQuarterId) : undefined}
        todayLabel="This quarter"
      />

      <div className="max-w-2xl">
        <p className="display text-[1.6rem] leading-[1.25] sm:text-[1.9rem]">
          What life are you trying to create?
        </p>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-muted-foreground">
          Name one thing that matters most in each half of it — everything below the quarter
          should serve these.
        </p>
      </div>

      <div className="grid items-stretch gap-8 md:grid-cols-2">
        {DOMAINS.map((domain) => (
          <QuarterColumn
            key={domain}
            domain={domain}
            record={record}
            quarterId={quarterId}
            onUpdate={updateQuarter}
          />
        ))}
      </div>
    </div>
  );
}

function QuarterColumn({
  domain,
  record,
  quarterId,
  onUpdate,
}: {
  domain: Domain;
  record: Quarter;
  quarterId: QuarterId;
  onUpdate: (id: QuarterId, recipe: (q: Quarter) => Quarter) => void;
}) {
  const side = record[domain];
  const label = DOMAIN_META[domain].label;

  const patch = (recipe: (s: Quarter[Domain]) => Quarter[Domain]) =>
    onUpdate(quarterId, (q) => ({ ...q, [domain]: recipe(q[domain]) }));

  const atCap = side.sideQuests.length >= MAX_SIDE_QUESTS;

  const doneQuests = side.sideQuests.filter((s) => s.done).length;

  return (
    <div className="paper-page paper-bound tape relative flex h-full flex-col p-6 pt-8 sm:p-8 sm:pt-9">
      <span aria-hidden className="binding-holes" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="badge">{label}</span>
        {side.sideQuests.length > 0 && (
          <span className="tnum text-[11px] text-muted-foreground">
            {doneQuests} of {side.sideQuests.length} side quests done
          </span>
        )}
      </div>

      {/* Main Quest — deliberately the loudest thing on the page. */}
      <div className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <div className="eyebrow">Main Quest</div>
          <FocusOn
            compact
            target={{ kind: "mainQuest", quarterId, domain, title: side.mainQuest }}
          />
        </div>
        <EditableText
          value={side.mainQuest}
          onCommit={(value) => patch((s) => ({ ...s, mainQuest: value }))}
          multiline
          rows={1}
          ariaLabel={`${label} main quest`}
          placeholder={
            domain === "work"
              ? "The one work outcome that would define this quarter…"
              : "The one personal outcome that would define this quarter…"
          }
          className="mt-2.5 -ml-2 display text-[1.75rem] leading-[1.18] tracking-tight sm:text-[2rem]"
        />
      </div>

      <div className="mt-7 border-t border-border/70 pt-5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2.5">
            <h3 className="eyebrow">Side Quests</h3>
            <span className="text-[11px] text-muted-foreground">independent goals</span>
          </div>
          <span className="eyebrow tnum">
            {side.sideQuests.length}/{MAX_SIDE_QUESTS}
          </span>
        </div>
        <SortableRows
          items={side.sideQuests}
          label={`${label} side quest`}
          className="mt-3 divide-y divide-subtle"
          onReorder={(sideQuests) => patch((s) => ({ ...s, sideQuests }))}
          onToggle={(sq) => patch((s) => ({ ...s, sideQuests: toggleById(s.sideQuests, sq.id) }))}
          onCommit={(sq, value) =>
            patch((s) => ({ ...s, sideQuests: updateById(s.sideQuests, sq.id, { text: value }) }))
          }
          onDelete={(sq) => patch((s) => ({ ...s, sideQuests: removeById(s.sideQuests, sq.id) }))}
          trailing={(sq) => (
            <FocusOn
              compact
              target={{
                kind: "sideQuest",
                quarterId,
                domain,
                questId: sq.id,
                title: sq.text,
              }}
              className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            />
          )}
        />
        <div className="mt-1">
          <AddItem
            label="Add a side quest"
            disabled={atCap}
            disabledHint={`Three is the limit — that's the point.`}
            onAdd={(text) =>
              patch((s) => ({
                ...s,
                sideQuests: addCapped(
                  s.sideQuests,
                  { id: newId(), text, done: false },
                  MAX_SIDE_QUESTS,
                ),
              }))
            }
          />
        </div>
      </div>
    </div>
  );
}
