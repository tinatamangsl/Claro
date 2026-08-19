import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { AddItem } from "@/components/AddItem";
import { AppShell } from "@/components/AppShell";
import { EditableText } from "@/components/EditableText";
import { GoalTag } from "@/components/GoalTag";
import { SortableRows } from "@/components/SortableRows";
import { CycleLink } from "@/components/cycle/CycleLink";
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
  PLAN_WEEKS,
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
        <CycleLink className="mt-3" />
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

      {stage === "foundation" && (
        <section className="space-y-6">
          <StageHeading stage="foundation" />
          <PlanPrompt
            question="A word or theme for this quarter"
            hint="One word is plenty."
            value={plan?.foundation.theme ?? ""}
            onCommit={(theme) => patch((c) => withFoundation(c, { theme }))}
          />
          <PlanPrompt
            question="The outcome you want to create by the end of this quarter"
            value={plan?.foundation.outcome ?? ""}
            placeholder="In your own words, before it becomes a goal."
            onCommit={(outcome) => patch((c) => withFoundation(c, { outcome }))}
          />
          <PlanPrompt
            question="Why this matters to you"
            value={plan?.foundation.whyItMatters ?? ""}
            onCommit={(whyItMatters) => patch((c) => withFoundation(c, { whyItMatters }))}
          />
          <PlanPrompt
            question="A headline you would be proud to write at the end of the quarter"
            hint="One sentence, written as though it has already happened."
            value={plan?.foundation.headline ?? ""}
            onCommit={(headline) => patch((c) => withFoundation(c, { headline }))}
          />
        </section>
      )}

      {stage === "goals" && (
        <section className="space-y-8">
          <StageHeading stage="goals" />

          <div className="space-y-4">
            <h3 className="text-[0.95rem]">Your three clearest goals for this quarter</h3>
            {[0, 1, 2].map((i) => (
              <PlanPrompt
                key={i}
                question={`Goal ${i + 1}`}
                value={plan?.clearestGoals[i] ?? ""}
                onCommit={(value) => patch((c) => withGoal(c, i, value))}
              />
            ))}
          </div>

          {DOMAINS.map((domain) => (
            <DomainPlan key={domain} domain={domain} quarter={record} patch={patch} />
          ))}
        </section>
      )}

      {stage === "systems" && (
        <section className="space-y-6">
          <StageHeading stage="systems" />
          <PlanPrompt
            question="Systems or routines that would make this quarter easier"
            value={plan?.systems.routines ?? ""}
            onCommit={(routines) => patch((c) => withSystems(c, { routines }))}
          />
          <PlanPrompt
            question="Habits you want to support"
            value={plan?.systems.habitsToSupport ?? ""}
            onCommit={(habitsToSupport) => patch((c) => withSystems(c, { habitsToSupport }))}
          />
          <PlanPrompt
            question="What you can automate, delegate or simplify"
            value={plan?.systems.simplify ?? ""}
            onCommit={(simplify) => patch((c) => withSystems(c, { simplify }))}
          />
          <PlanPrompt
            question="What you will consciously stop doing"
            hint="This one is usually the most useful."
            value={plan?.systems.stopDoing ?? ""}
            onCommit={(stopDoing) => patch((c) => withSystems(c, { stopDoing }))}
          />
          <PlanPrompt
            question="A weekly ritual that keeps you connected to the plan"
            value={plan?.systems.weeklyRitual ?? ""}
            onCommit={(weeklyRitual) => patch((c) => withSystems(c, { weeklyRitual }))}
          />
        </section>
      )}

      {stage === "people" && (
        <section className="space-y-6">
          <StageHeading stage="people" />
          <PlanPrompt
            question="People, roles or support you may need"
            value={plan?.people.support ?? ""}
            onCommit={(support) => patch((c) => withPeople(c, { support }))}
          />
          <PlanPrompt
            question="A mentor or advisor you can lean on"
            value={plan?.people.mentor ?? ""}
            onCommit={(mentor) => patch((c) => withPeople(c, { mentor }))}
          />
          <PlanPrompt
            question="Someone you want to support or empower"
            value={plan?.people.empower ?? ""}
            onCommit={(empower) => patch((c) => withPeople(c, { empower }))}
          />
          <PlanPrompt
            question="An accountability partner, if that helps you"
            hint="Optional, and entirely up to you."
            value={plan?.people.accountability ?? ""}
            onCommit={(accountability) => patch((c) => withPeople(c, { accountability }))}
          />
        </section>
      )}

      {stage === "execution" && (
        <section className="space-y-5">
          <StageHeading stage="execution" />
          <p className="max-w-prose text-[0.88rem] leading-relaxed text-muted-foreground">
            One intention per week, if it helps. Weeks can stay blank, and you can change any
            of them at any point in the quarter.
          </p>

          <ol className="space-y-2">
            {Array.from({ length: PLAN_WEEKS }, (_, i) => (
              <li key={i} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                <span className="tnum shrink-0 text-[11px] text-muted-foreground sm:mt-2.5 sm:w-14">
                  Week {i + 1}
                </span>
                <span className="paper-panel ruled min-w-0 flex-1 px-3 pb-1">
                  <EditableText
                    value={plan?.focusWeeks[i] ?? ""}
                    onCommit={(value) => patch((c) => withWeek(c, i, value))}
                    wrap
                    ariaLabel={`Focus for week ${i + 1}`}
                    placeholder="Leave blank if you would rather decide later."
                    className="ruled-text -ml-2 py-0"
                  />
                </span>
              </li>
            ))}
          </ol>
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

      <div className="mt-4">
        <PlanPrompt
          question="Evidence that progress is real"
          hint="Optional. Your own measure, if a measure helps at all."
          value={side.mainQuestEvidence}
          onCommit={(mainQuestEvidence) => onSide((s) => ({ ...s, mainQuestEvidence }))}
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
        heading="Foundation"
        entries={[
          ["Theme", plan?.foundation.theme],
          ["Outcome", plan?.foundation.outcome],
          ["Why it matters", plan?.foundation.whyItMatters],
          ["Headline", plan?.foundation.headline],
        ]}
      />
      <SummaryGroup
        heading="Clearest goals"
        entries={(plan?.clearestGoals ?? []).map((g, i) => [`Goal ${i + 1}`, g])}
      />
      <SummaryGroup
        heading="Systems"
        entries={[
          ["Routines", plan?.systems.routines],
          ["Habits to support", plan?.systems.habitsToSupport],
          ["Automate, delegate or simplify", plan?.systems.simplify],
          ["Stopping", plan?.systems.stopDoing],
          ["Weekly ritual", plan?.systems.weeklyRitual],
        ]}
      />
      <SummaryGroup
        heading="People"
        entries={[
          ["Support", plan?.people.support],
          ["Mentor or advisor", plan?.people.mentor],
          ["Someone to support", plan?.people.empower],
          ["Accountability", plan?.people.accountability],
        ]}
      />

      {(plan?.focusWeeks ?? []).some((w) => w.trim() !== "") && (
        <div>
          <h3 className="eyebrow">Twelve weeks</h3>
          <ol className="mt-2 space-y-1.5">
            {(plan?.focusWeeks ?? []).map((week, i) =>
              week.trim() === "" ? null : (
                <li key={i} className="flex items-start gap-3 text-[0.85rem] leading-snug">
                  <span className="tnum w-14 shrink-0 text-[11px] text-muted-foreground">
                    Week {i + 1}
                  </span>
                  <span className="min-w-0">{week}</span>
                </li>
              ),
            )}
          </ol>
        </div>
      )}

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
                ["Evidence of progress", side.mainQuestEvidence],
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

type Plan = NonNullable<Quarter["plan"]>;

function withFoundation(quarter: Quarter, patch: Partial<Plan["foundation"]>): Quarter {
  const plan = quarter.plan;
  if (!plan) return quarter;
  return { ...quarter, plan: { ...plan, foundation: { ...plan.foundation, ...patch } } };
}

function withSystems(quarter: Quarter, patch: Partial<Plan["systems"]>): Quarter {
  const plan = quarter.plan;
  if (!plan) return quarter;
  return { ...quarter, plan: { ...plan, systems: { ...plan.systems, ...patch } } };
}

function withPeople(quarter: Quarter, patch: Partial<Plan["people"]>): Quarter {
  const plan = quarter.plan;
  if (!plan) return quarter;
  return { ...quarter, plan: { ...plan, people: { ...plan.people, ...patch } } };
}

function withGoal(quarter: Quarter, index: number, value: string): Quarter {
  const plan = quarter.plan;
  if (!plan) return quarter;
  const clearestGoals = plan.clearestGoals.map((g, i) => (i === index ? value : g));
  return { ...quarter, plan: { ...plan, clearestGoals } };
}

function withWeek(quarter: Quarter, index: number, value: string): Quarter {
  const plan = quarter.plan;
  if (!plan) return quarter;
  const focusWeeks = plan.focusWeeks.map((w, i) => (i === index ? value : w));
  return { ...quarter, plan: { ...plan, focusWeeks } };
}
