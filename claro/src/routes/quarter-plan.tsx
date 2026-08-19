import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { AddItem } from "@/components/AddItem";
import { AppShell } from "@/components/AppShell";
import { EditableText } from "@/components/EditableText";
import { GoalTag } from "@/components/GoalTag";
import { SortableRows } from "@/components/SortableRows";
import { PlanPrompt } from "@/components/quarter/PlanPrompt";
import { PlanStepper } from "@/components/quarter/PlanStepper";
import { useClaro } from "@/lib/claro-store";
import { formatQuarterMonths, formatQuarterShort } from "@/lib/dates";
import { newId } from "@/lib/id";
import { addCapped, removeById, toggleById, updateById } from "@/lib/mutations";
import {
  PLAN_STAGES,
  STAGE_META,
  hasAnything,
  isSettled,
  nextStage,
  previousStage,
  reopenPlan,
  settlePlan,
  sideQuestsLeft,
  startPlan,
  type PlanStage,
} from "@/lib/quarter-plan";
import { cn } from "@/lib/utils";
import {
  DOMAINS,
  DOMAIN_META,
  MAX_SIDE_QUESTS,
  type Domain,
  type Quarter,
  type QuarterId,
} from "@/lib/types";

export const Route = createFileRoute("/quarter-plan")({
  validateSearch: (search: Record<string, unknown>): { q?: string; s?: PlanStage } => {
    // Genuinely optional keys, or `search` becomes required on every Link here.
    const next: { q?: string; s?: PlanStage } = {};
    if (typeof search.q === "string" && /^\d{4}-Q[1-4]$/.test(search.q)) next.q = search.q;
    if (PLAN_STAGES.includes(search.s as PlanStage)) next.s = search.s as PlanStage;
    return next;
  },
  component: () => (
    <AppShell>
      <PlanWorkspace />
    </AppShell>
  ),
  head: () => ({ meta: [{ title: "Plan the quarter: Claro" }] }),
});

function PlanWorkspace() {
  const { today, quarter, updateQuarter } = useClaro();
  const { q, s } = Route.useSearch();
  const navigate = useNavigate();

  const currentQuarterId = quarterIdOf(today);
  const quarterId: QuarterId = q ?? currentQuarterId;
  const stage: PlanStage = s ?? "back";
  const record = quarter(quarterId);

  const go = (next: PlanStage) =>
    navigate({ to: "/quarter-plan", search: { q: quarterId, s: next } });

  const patch = (recipe: (qr: Quarter) => Quarter) => updateQuarter(quarterId, recipe);

  // Opening the workspace starts a plan. Nothing already written is disturbed.
  useEffect(() => {
    patch((current) => startPlan(current, new Date()));
    // Once per quarter, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quarterId]);

  const plan = record.plan;
  const back = previousStage(stage);
  const forward = nextStage(stage);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="border-b border-border pb-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="eyebrow">Planning workspace</span>
          <Link
            to="/quarter"
            search={{ q: quarterId }}
            className="btn btn-sm btn-quiet gap-1.5"
          >
            <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
            Back to the quarter
          </Link>
        </div>

        <h1 className="display mt-3 text-[2.4rem] sm:text-[2.9rem]">
          Plan {formatQuarterShort(quarterId)}
        </h1>
        <p className="tnum mt-1 text-[0.92rem] text-muted-foreground">
          {formatQuarterMonths(quarterId)}
        </p>
        <p className="mt-3 max-w-prose text-[0.88rem] leading-relaxed text-muted-foreground">
          Take these in any order, and leave anything blank that does not help. Everything you
          write is saved as you go and goes straight into this quarter.
        </p>
      </header>

      <PlanStepper quarter={record} stage={stage} onGo={go} />

      {stage === "back" && (
        <section className="space-y-6">
          <StageHeading stage="back" />
          <PlanPrompt
            question="What are you proud of from last quarter?"
            hint="It does not have to be finished work."
            value={plan?.reflection.proudOf ?? ""}
            placeholder="Anything that stands out when you look back."
            onCommit={(proudOf) =>
              patch((c) => withReflection(c, { proudOf }))
            }
          />
          <PlanPrompt
            question="What worked?"
            hint="The habits, hours or conditions that actually helped."
            value={plan?.reflection.whatWorked ?? ""}
            onCommit={(whatWorked) => patch((c) => withReflection(c, { whatWorked }))}
          />
          <PlanPrompt
            question="What do you want to carry forward, change, or let go of?"
            hint="Letting something go is a real answer."
            value={plan?.reflection.carryForward ?? ""}
            onCommit={(carryForward) => patch((c) => withReflection(c, { carryForward }))}
          />
        </section>
      )}

      {stage === "direction" && (
        <section className="space-y-6">
          <StageHeading stage="direction" />
          <PlanPrompt
            question="What matters most this quarter?"
            value={plan?.direction.mattersMost ?? ""}
            placeholder="In your own words, before it becomes a goal."
            onCommit={(mattersMost) => patch((c) => withDirection(c, { mattersMost }))}
          />
          <PlanPrompt
            question="What would make this quarter feel meaningful?"
            value={plan?.direction.meaningful ?? ""}
            onCommit={(meaningful) => patch((c) => withDirection(c, { meaningful }))}
          />
          <PlanPrompt
            question="What constraints, commitments or support should you plan around?"
            hint="Time you do not have, and help you do."
            value={plan?.direction.constraints ?? ""}
            onCommit={(constraints) => patch((c) => withDirection(c, { constraints }))}
          />
        </section>
      )}

      {stage === "define" && (
        <section className="space-y-8">
          <StageHeading stage="define" />
          {DOMAINS.map((domain) => (
            <DomainPlan key={domain} domain={domain} quarter={record} patch={patch} />
          ))}
        </section>
      )}

      {stage === "review" && (
        <section className="space-y-6">
          <StageHeading stage="review" />
          <PlanSummary quarter={record} />

          <div className="flex flex-wrap items-center gap-3 border-t border-border/70 pt-5">
            {isSettled(record) ? (
              <>
                <span className="flex items-center gap-1.5 text-[0.88rem] text-muted-foreground">
                  <Check aria-hidden className="h-3.5 w-3.5 text-positive" />
                  Settled. You can still change any of it.
                </span>
                <button
                  type="button"
                  onClick={() => patch(reopenPlan)}
                  className="btn btn-sm btn-ghost gap-1.5"
                >
                  <RotateCcw aria-hidden className="h-3.5 w-3.5" />
                  Reopen the plan
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => patch((c) => settlePlan(c, new Date()))}
                  className="btn btn-primary"
                >
                  Settle this plan
                </button>
                <span className="text-[11px] text-muted-foreground">
                  Everything is already saved. This just marks it as decided.
                </span>
              </>
            )}
          </div>

          <Link to="/quarter" search={{ q: quarterId }} className="btn btn-sm btn-quiet gap-1.5">
            Open the quarter
            <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        </section>
      )}

      <nav className="flex items-center justify-between gap-3 border-t border-border/70 pt-5">
        {back ? (
          <button type="button" onClick={() => go(back)} className="btn btn-sm btn-quiet gap-1.5">
            <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
            {STAGE_META[back].label}
          </button>
        ) : (
          <span />
        )}
        {forward && (
          <button
            type="button"
            onClick={() => go(forward)}
            className="btn btn-sm btn-quiet gap-1.5"
          >
            {STAGE_META[forward].label}
            <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </button>
        )}
      </nav>
    </div>
  );
}

function StageHeading({ stage }: { stage: PlanStage }) {
  return (
    <div>
      <h2 className="display text-[1.5rem]">{STAGE_META[stage].label}</h2>
      <p className="mt-1 text-[0.85rem] text-muted-foreground">{STAGE_META[stage].hint}</p>
    </div>
  );
}

/** One side of life: its Main Quest, why it matters, and its side quests. */
function DomainPlan({
  domain,
  quarter,
  patch,
}: {
  domain: Domain;
  quarter: Quarter;
  patch: (recipe: (q: Quarter) => Quarter) => void;
}) {
  const side = quarter[domain];
  const label = DOMAIN_META[domain].label;
  const left = sideQuestsLeft(quarter, domain);

  const onSide = (recipe: (s: Quarter[Domain]) => Quarter[Domain]) =>
    patch((c) => ({ ...c, [domain]: recipe(c[domain]) }));

  return (
    <div className="paper-page relative p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="badge">{label}</span>
        <GoalTag category={domain === "work" ? "workMain" : "lifeMain"} short />
      </div>

      <div className="mt-5">
        <label className="eyebrow" htmlFor={`${domain}-main`}>
          {label} Main Quest
        </label>
        <EditableText
          value={side.mainQuest}
          onCommit={(mainQuest) => onSide((s) => ({ ...s, mainQuest }))}
          multiline
          rows={1}
          ariaLabel={`${label} Main Quest`}
          placeholder={
            domain === "work"
              ? "The one work outcome that would define this quarter"
              : "The one personal outcome that would define this quarter"
          }
          className="mt-2 -ml-2 display text-[1.5rem] leading-[1.2]"
        />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <PlanPrompt
          question="Why does this matter?"
          value={side.mainQuestWhy}
          placeholder="The reason you would still want this in three months."
          onCommit={(mainQuestWhy) => onSide((s) => ({ ...s, mainQuestWhy }))}
        />
        <PlanPrompt
          question="What does enough look like?"
          hint="Your own bar, not a number."
          value={side.mainQuestEnough}
          onCommit={(mainQuestEnough) => onSide((s) => ({ ...s, mainQuestEnough }))}
        />
      </div>

      <div className="mt-6 border-t border-border/70 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2.5">
            <h3 className="eyebrow">{label} Side Quests</h3>
            <span className="text-[11px] text-muted-foreground">independent goals</span>
          </div>
          <span className="eyebrow tnum">
            {side.sideQuests.length}/{MAX_SIDE_QUESTS}
          </span>
        </div>

        <SortableRows
          items={side.sideQuests}
          label={`${label} side quest`}
          className="mt-2 divide-y divide-subtle"
          onReorder={(sideQuests) => onSide((s) => ({ ...s, sideQuests }))}
          onToggle={(sq) => onSide((s) => ({ ...s, sideQuests: toggleById(s.sideQuests, sq.id) }))}
          onCommit={(sq, value) =>
            onSide((s) => ({ ...s, sideQuests: updateById(s.sideQuests, sq.id, { text: value }) }))
          }
          onDelete={(sq) => onSide((s) => ({ ...s, sideQuests: removeById(s.sideQuests, sq.id) }))}
        />

        <AddItem
          label="Add a side quest"
          disabled={left === 0}
          disabledHint="Three is the limit. That is the point."
          onAdd={(text) =>
            onSide((s) => ({
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
  );
}

/** Reads the plan back, exactly as it now stands in the quarter. */
function PlanSummary({ quarter }: { quarter: Quarter }) {
  const plan = quarter.plan;

  if (!hasAnything(quarter)) {
    return (
      <p className="text-[0.9rem] leading-relaxed text-muted-foreground">
        Nothing written yet. Anything you add on the earlier stages appears here.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <SummaryGroup
        heading="Looking back"
        entries={[
          ["Proud of", plan?.reflection.proudOf],
          ["What worked", plan?.reflection.whatWorked],
          ["Carry forward, change or let go", plan?.reflection.carryForward],
        ]}
      />
      <SummaryGroup
        heading="Direction"
        entries={[
          ["Matters most", plan?.direction.mattersMost],
          ["Would feel meaningful", plan?.direction.meaningful],
          ["Planning around", plan?.direction.constraints],
        ]}
      />

      {DOMAINS.map((domain) => {
        const side = quarter[domain];
        const label = DOMAIN_META[domain].label;
        return (
          <div key={domain} className="surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <GoalTag category={domain === "work" ? "workMain" : "lifeMain"} short />
              <span className="eyebrow">{label} Main Quest</span>
            </div>
            <p className="display mt-2 text-[1.15rem] leading-snug">
              {side.mainQuest || "Not set yet"}
            </p>
            <SummaryGroup
              className="mt-3"
              entries={[
                ["Why it matters", side.mainQuestWhy],
                ["Enough looks like", side.mainQuestEnough],
              ]}
            />
            {side.sideQuests.length > 0 && (
              <ul className="mt-3 space-y-1">
                {side.sideQuests.map((sq) => (
                  <li key={sq.id} className="flex items-start gap-2 text-[0.85rem] leading-snug">
                    <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" />
                    <span className={cn(sq.done && "strike-done text-muted-foreground")}>
                      {sq.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SummaryGroup({
  heading,
  entries,
  className,
}: {
  heading?: string;
  entries: [string, string | undefined][];
  className?: string;
}) {
  const filled = entries.filter(([, value]) => (value ?? "").trim() !== "");
  if (filled.length === 0) return null;

  return (
    <div className={className}>
      {heading && <h3 className="eyebrow">{heading}</h3>}
      <dl className={cn("space-y-2.5", heading && "mt-2")}>
        {filled.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[10px] text-muted-foreground">{label}</dt>
            <dd className="text-[0.88rem] leading-relaxed whitespace-pre-wrap">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// Local rather than imported, so the route does not depend on Today's helpers.
function quarterIdOf(dayId: string): QuarterId {
  const [year, month] = dayId.split("-").map(Number);
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
}

function withReflection(quarter: Quarter, patch: Partial<NonNullable<Quarter["plan"]>["reflection"]>): Quarter {
  const plan = quarter.plan;
  if (!plan) return quarter;
  return { ...quarter, plan: { ...plan, reflection: { ...plan.reflection, ...patch } } };
}

function withDirection(quarter: Quarter, patch: Partial<NonNullable<Quarter["plan"]>["direction"]>): Quarter {
  const plan = quarter.plan;
  if (!plan) return quarter;
  return { ...quarter, plan: { ...plan, direction: { ...plan.direction, ...patch } } };
}
