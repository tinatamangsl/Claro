import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AddItem } from "@/components/AddItem";
import { AppShell } from "@/components/AppShell";
import { EditableText } from "@/components/EditableText";
import { ItemRow } from "@/components/ItemRow";
import { PeriodHeader } from "@/components/PeriodHeader";
import { Section } from "@/components/Section";
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
        eyebrow="Direction"
        title={formatQuarterShort(quarterId)}
        subtitle={formatQuarterMonths(quarterId)}
        onPrev={() => go(shiftQuarterId(quarterId, -1))}
        onNext={() => go(shiftQuarterId(quarterId, 1))}
        prevLabel="Previous quarter"
        nextLabel="Next quarter"
        onToday={quarterId !== currentQuarterId ? () => go(currentQuarterId) : undefined}
        todayLabel="This quarter"
      />

      <p className="max-w-xl text-[0.95rem] leading-relaxed text-muted-foreground">
        What life are you trying to create? Name one thing that matters most in each half of
        it — everything below the quarter should serve these.
      </p>

      <div className="grid gap-10 md:grid-cols-2 md:gap-8">
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

  return (
    <div className="space-y-7">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={
            domain === "work" ? "h-1.5 w-1.5 rounded-full bg-primary" : "h-1.5 w-1.5 rounded-full bg-gold"
          }
        />
        <h2 className="text-[1.15rem] font-medium tracking-tight">{label}</h2>
      </div>

      {/* Main Quest — deliberately the loudest thing on the page. */}
      <div className="surface-raised relative overflow-hidden p-6 sm:p-7">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px] bg-gold"
        />
        <div className="eyebrow">Main Quest</div>
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
          className="mt-2.5 -ml-2 font-[family-name:var(--font-display)] text-[1.75rem] leading-[1.18] tracking-tight sm:text-[2rem]"
        />
      </div>

      <Section
        title="Side Quests"
        hint="supporting goals"
        counter={`${side.sideQuests.length}/${MAX_SIDE_QUESTS}`}
      >
        <div className="divide-y divide-subtle">
          {side.sideQuests.map((sq) => (
            <ItemRow
              key={sq.id}
              text={sq.text}
              done={sq.done}
              label={`${label} side quest`}
              onToggle={() => patch((s) => ({ ...s, sideQuests: toggleById(s.sideQuests, sq.id) }))}
              onCommit={(value) =>
                patch((s) => ({ ...s, sideQuests: updateById(s.sideQuests, sq.id, { text: value }) }))
              }
              onDelete={() => patch((s) => ({ ...s, sideQuests: removeById(s.sideQuests, sq.id) }))}
            />
          ))}
        </div>
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
      </Section>
    </div>
  );
}
