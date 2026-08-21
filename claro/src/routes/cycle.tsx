import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BookOpen, Lock, Trash2 } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { useClaro } from "@/lib/claro-store";
import { EditableText } from "@/components/EditableText";
import { CycleCalendar } from "@/components/cycle/CycleCalendar";
import { CycleGlance } from "@/components/cycle/CycleGlance";
import { PeriodHistory } from "@/components/cycle/PeriodHistory";
import {
  addPeriod,
  checkInOn,
  describeRefusal,
  durationOf,
  endPeriod,
  hasAnyCycleData,
  ongoingPeriod,
  recentCheckIns,
  type LogResult,
} from "@/lib/cycle";
import { observations } from "@/lib/cycle-timeline";
import { SUPPORTIVE_PROMPTS, SUPPORT_NOTE } from "@/lib/cycle-guide";
import { formatDayShort } from "@/lib/dates";
import { newId } from "@/lib/id";
import { cn } from "@/lib/utils";
import type { CycleEntry, CycleState, ISODate } from "@/lib/types";
import {
  ENERGY_LABELS,
  ENERGY_LEVELS,
  MOOD_FACES,
  MOOD_FACE_META,
  STRESS_LABELS,
  STRESS_LEVELS,
  type EnergyLevel,
  type MoodFace,
  type StressLevel,
} from "@/lib/types";

export const Route = createFileRoute("/cycle")({
  component: () => (
    <AppShell>
      <CycleNotes />
    </AppShell>
  ),
  head: () => ({ meta: [{ title: "Cycle notes: Claro" }] }),
});

/**
 * Cycle at a glance.
 *
 * The order on this page is the product decision. What Claro estimated comes
 * first but quietly, because it is arithmetic; the loudest thing is the action
 * that records what actually happened. Everything below is the user's own data
 * read back to them, and nothing on the page changes a plan.
 */
export function CycleNotes() {
  const {
    today,
    cycle,
    setCycleEnabled,
    setCycleEntries,
    deleteCycleEntry,
    writeCycleCheckIn,
    deleteAllCycleData,
  } = useClaro();

  if (!cycle.settings.enabled) {
    return <OptIn onEnable={() => setCycleEnabled(true, new Date())} />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header className="border-b border-border pb-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock aria-hidden className="h-3 w-3" />
            Private, on this device
          </span>
          <Link to="/calendar" className="btn btn-sm btn-quiet gap-1.5">
            <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
            Back to Calendar
          </Link>
        </div>
        <h1 className="display mt-3 text-[2.4rem] sm:text-[2.9rem]">Cycle at a glance</h1>
        <p className="mt-2 max-w-prose text-[0.92rem] leading-relaxed text-muted-foreground">
          A place to record when a period starts and ends and, if you want to, how a day felt. Claro
          keeps this separate from your planning and never shares it.
        </p>
      </header>

      {/* The daily flow: the way in most mornings, so it comes first. */}
      <Link
        to="/cycle-day"
        className="surface-raised flex items-center justify-between gap-4 p-5 transition-colors hover:border-foreground/25"
      >
        <span className="min-w-0">
          <span className="display block text-[1.35rem] leading-tight">Log today</span>
          <span className="mt-0.5 block text-[0.85rem] text-muted-foreground">
            Energy, a word for the day, and anything you want to remember.
          </span>
        </span>
        <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>

      {/* 1. What Claro estimated, stated quietly and always labelled. */}
      <CycleGlance cycle={cycle} todayId={today} />

      {/* 2. The action, and the loudest thing on the page. */}
      <LogPeriod cycle={cycle} todayId={today} onReplace={setCycleEntries} />

      {/* 3. The calendar, where a range is drawn and edited. */}
      <section>
        <div className="flex items-baseline gap-2.5">
          <h2 className="eyebrow">Your cycle calendar</h2>
          <span className="text-[11px] text-muted-foreground">tap any day</span>
        </div>
        <div className="mt-3">
          <CycleCalendar
            cycle={cycle}
            todayId={today}
            onReplace={setCycleEntries}
            onDelete={deleteCycleEntry}
          />
        </div>
      </section>

      {/* 4. Every logged period, editable start and end. */}
      <section>
        <div className="flex items-baseline gap-2.5">
          <h2 className="eyebrow">Your logged periods</h2>
          <span className="text-[11px] text-muted-foreground">edit any of them</span>
        </div>
        <div className="mt-3">
          <PeriodHistory
            cycle={cycle}
            todayId={today}
            onReplace={setCycleEntries}
            onDelete={deleteCycleEntry}
          />
        </div>
      </section>

      {/* 5. The user's own notes, and what they show. */}
      <Patterns cycle={cycle} />

      <CheckIn
        todayId={today}
        note={checkInOn(cycle, today)}
        recent={recentCheckIns(cycle)}
        onWrite={(patch) => writeCycleCheckIn(today, patch, new Date())}
      />

      <PlanningPrompts />

      {/* 6. A quiet way through to the guidance, never in place of the actions. */}
      <section className="border-t border-border/70 pt-6">
        <Link
          to="/cycle-guide"
          className="inline-flex items-center gap-1.5 text-[0.88rem] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          <BookOpen aria-hidden className="h-3.5 w-3.5" />
          Understanding your menstrual cycle: guidance and sources
        </Link>
      </section>

      <DeleteAll
        enabled={hasAnyCycleData(cycle)}
        onDelete={deleteAllCycleData}
        onTurnOff={() => setCycleEnabled(false, new Date())}
      />
    </div>
  );
}

/** Nothing is collected or shown until this is answered. */
function OptIn({ onEnable }: { onEnable: () => void }) {
  return (
    <div className="mx-auto max-w-2xl">
      <header className="border-b border-border pb-5">
        <span className="eyebrow">Optional</span>
        <h1 className="display mt-3 text-[2.4rem] sm:text-[2.9rem]">Cycle notes</h1>
      </header>

      <div className="surface mt-8 p-6">
        <p className="max-w-prose text-[0.95rem] leading-relaxed">
          If it is useful to you, Claro can keep a private record of when your periods start and
          end, and show a rough estimate of the next one worked out from your own entries only.
        </p>

        <ul className="mt-5 space-y-2 text-[0.88rem] leading-relaxed text-muted-foreground">
          {[
            "Stored on this device with everything else you write in Claro.",
            "Never shared, never sent anywhere, and never used to change your plans.",
            "You can delete all of it in one action, at any time.",
          ].map((line) => (
            <li key={line} className="flex items-start gap-2">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" />
              {line}
            </li>
          ))}
        </ul>

        <p className="mt-5 max-w-prose text-[0.85rem] leading-relaxed text-muted-foreground">
          Claro does not give medical, fertility or health advice, and it will not tell you what to
          eat, how to train, or what work to do. It records what you write and nothing else.
        </p>

        <button type="button" onClick={onEnable} className="btn btn-primary mt-6">
          Turn on cycle notes
        </button>
      </div>
    </div>
  );
}

/**
 * Recording a period, in the three ways it actually happens: it started today,
 * it ended today, or it happened a while ago and is being entered from memory.
 */
function LogPeriod({
  cycle,
  todayId,
  onReplace,
}: {
  cycle: CycleState;
  todayId: ISODate;
  onReplace: (entries: Record<string, CycleEntry>) => void;
}) {
  const [start, setStart] = useState(todayId);
  const [end, setEnd] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);

  const ongoing = ongoingPeriod(cycle);

  const apply = (result: LogResult) => {
    if (!result.ok) {
      setRefusal(describeRefusal(result, cycle, todayId));
      return false;
    }
    onReplace(result.entries);
    setRefusal(null);
    return true;
  };

  return (
    <section className="surface-raised p-5">
      <h2 className="display text-[1.5rem] leading-tight">Log a period start</h2>
      <p className="mt-1 text-[0.85rem] text-muted-foreground">
        Today, or any dates in the past you remember. Add the end date whenever you know it.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {ongoing ? (
          <>
            <button
              type="button"
              onClick={() => apply(endPeriod(cycle, ongoing.id, todayId, todayId))}
              className="btn btn-primary"
            >
              My period ended today
            </button>
            <span className="text-[0.85rem] text-muted-foreground">
              Ongoing since {formatDayShort(ongoing.startDate)},{" "}
              <span className="tnum">{durationOf(cycle, ongoing, todayId)}</span> days so far.
            </span>
          </>
        ) : (
          <button
            type="button"
            onClick={() =>
              apply(
                addPeriod(cycle, { startDate: todayId, endDate: null }, newId(), new Date(), todayId),
              )
            }
            className="btn btn-primary"
          >
            My period started today
          </button>
        )}
      </div>

      {/* Manual historical entry: a whole past range in one go. */}
      <form
        className="mt-5 flex flex-wrap items-end gap-3 border-t border-border/70 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const saved = apply(
            addPeriod(
              cycle,
              { startDate: start, endDate: end === "" ? null : end },
              newId(),
              new Date(),
              todayId,
            ),
          );
          if (saved) {
            setStart(todayId);
            setEnd("");
          }
        }}
      >
        <span className="w-full text-[11px] text-muted-foreground">Add a past period</span>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">Started</span>
          <input
            type="date"
            value={start}
            max={todayId}
            aria-label="Start date of a past period"
            onChange={(e) => {
              setStart(e.target.value);
              setRefusal(null);
            }}
            className="tnum rounded-md border border-border bg-card px-2.5 py-1.5 text-[0.88rem]"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">Ended, if it has</span>
          <input
            type="date"
            value={end}
            max={todayId}
            min={start}
            aria-label="End date of a past period"
            onChange={(e) => {
              setEnd(e.target.value);
              setRefusal(null);
            }}
            className="tnum rounded-md border border-border bg-card px-2.5 py-1.5 text-[0.88rem]"
          />
        </label>

        <button type="submit" className="btn btn-sm btn-quiet">
          Add this period
        </button>
      </form>

      {refusal && (
        <p role="alert" className="mt-3 text-[0.85rem] leading-relaxed text-muted-foreground">
          {refusal}
        </p>
      )}
    </section>
  );
}

/**
 * Descriptions of the user's own notes. Never advice, never a cause, and
 * nothing at all until there is enough of their own history to describe.
 */
function Patterns({ cycle }: { cycle: CycleState }) {
  const found = observations(cycle);
  if (found.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline gap-2.5">
        <h2 className="eyebrow">What your notes show</h2>
        <span className="text-[11px] text-muted-foreground">your own pattern, nothing more</span>
      </div>

      <ul className="surface mt-3 space-y-2.5 p-4">
        {found.map((observation) => (
          <li
            key={`${observation.band}:${observation.text}`}
            className="text-[0.88rem] leading-relaxed"
          >
            {observation.text}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        This is a personal observation from your own notes, not medical advice and not a prediction.
        Claro does not suggest what to do about it.
      </p>
    </section>
  );
}

/**
 * Questions, and only questions.
 *
 * Nothing here writes anything. The point is that the decision about a plan
 * stays with the person, which it cannot do if the app has already made it.
 */
function PlanningPrompts() {
  return (
    <section>
      <div className="flex items-baseline gap-2.5">
        <h2 className="eyebrow">If you want to plan around this</h2>
        <span className="text-[11px] text-muted-foreground">your call, always</span>
      </div>

      <div className="surface-quiet mt-3 p-4">
        <ul className="space-y-2">
          {SUPPORTIVE_PROMPTS.map((prompt) => (
            <li key={prompt} className="flex items-start gap-2 text-[0.88rem] leading-relaxed">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" />
              {prompt}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Claro does not change your day, week, quarter, habits, goals, focus sessions or sound
          because of anything on this page. {SUPPORT_NOTE}
        </p>
      </div>
    </section>
  );
}

/** Neutral readings. No interpretation is offered, and none is stored. */
function CheckIn({
  todayId,
  note,
  recent,
  onWrite,
}: {
  todayId: ISODate;
  note: ReturnType<typeof checkInOn>;
  recent: ReturnType<typeof recentCheckIns>;
  onWrite: (patch: Partial<ReturnType<typeof checkInOn>>) => void;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2.5">
        <h2 className="eyebrow">How today felt</h2>
        <span className="text-[11px] text-muted-foreground">optional</span>
      </div>

      <div className="surface mt-3 space-y-4 p-4">
        <Scale
          legend="Energy"
          options={ENERGY_LEVELS}
          labels={ENERGY_LABELS}
          selected={note.energy}
          onSelect={(energy) => onWrite({ energy: energy as EnergyLevel | null })}
        />

        <fieldset>
          <legend className="text-[0.85rem]">Mood</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {MOOD_FACES.map((face) => {
              const selected = note.mood === face;
              return (
                <button
                  key={face}
                  type="button"
                  aria-pressed={selected}
                  aria-label={MOOD_FACE_META[face].label}
                  onClick={() => onWrite({ mood: selected ? null : (face as MoodFace) })}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    selected
                      ? "border-gold bg-gold/20 text-foreground"
                      : "border-border text-muted-foreground hover:border-foreground/40",
                  )}
                >
                  <span aria-hidden className="text-[0.95rem] leading-none">
                    {MOOD_FACE_META[face].emoji}
                  </span>
                  {MOOD_FACE_META[face].label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <Scale
          legend="Stress"
          options={STRESS_LEVELS}
          labels={STRESS_LABELS}
          selected={note.stress}
          onSelect={(stress) => onWrite({ stress: stress as StressLevel | null })}
        />

        <label className="block">
          <span className="block text-[0.85rem]">Anything you want to remember</span>
          <div className="paper-panel ruled mt-2 px-3 pb-2">
            <EditableText
              value={note.note}
              onCommit={(text) => onWrite({ note: text })}
              multiline
              rows={2}
              ariaLabel="A note about today"
              placeholder="Optional, and entirely your own words."
              className="ruled-text -ml-2 py-0"
            />
          </div>
        </label>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          These are your own notes for {formatDayShort(todayId)}. Claro does not read anything into
          them or change your plans because of them.
        </p>
      </div>

      {recent.length > 0 && (
        <div className="mt-4">
          <h3 className="eyebrow">Recent notes</h3>
          <ul className="paper-panel mt-2 divide-y divide-subtle px-4">
            {recent.map((entry) => (
              <li
                key={entry.dayId}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2 text-[0.85rem]"
              >
                <span className="tnum min-w-0 flex-1">{formatDayShort(entry.dayId)}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {[
                    entry.energy ? `Energy ${ENERGY_LABELS[entry.energy].toLowerCase()}` : null,
                    entry.mood ? `Mood ${MOOD_FACE_META[entry.mood].label.toLowerCase()}` : null,
                    entry.stress ? `Stress ${STRESS_LABELS[entry.stress].toLowerCase()}` : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Scale<T extends number>({
  legend,
  options,
  labels,
  selected,
  onSelect,
}: {
  legend: string;
  options: T[];
  labels: Record<T, string>;
  selected: T | null;
  onSelect: (value: T | null) => void;
}) {
  return (
    <fieldset>
      <legend className="text-[0.85rem]">
        {legend}
        <span className="ml-2 text-[10px] text-muted-foreground">low to high</span>
      </legend>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={selected === option}
            onClick={() => onSelect(selected === option ? null : option)}
            className={cn(
              "h-7 rounded-full border px-3 text-[11px] transition-colors",
              selected === option
                ? "border-gold bg-gold/20 text-foreground"
                : "border-border text-muted-foreground hover:border-foreground/40",
            )}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function DeleteAll({
  enabled,
  onDelete,
  onTurnOff,
}: {
  enabled: boolean;
  onDelete: () => void;
  onTurnOff: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="border-t border-border/70 pt-6">
      <h2 className="eyebrow">Your data</h2>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onTurnOff} className="btn btn-sm btn-quiet">
          Turn off cycle notes
        </button>
        <span className="text-[11px] text-muted-foreground">
          Turning it off hides this section and keeps what you have logged.
        </span>
      </div>

      <div className="mt-4">
        {confirming ? (
          <div className="surface flex flex-wrap items-center gap-3 border-destructive/40 p-4">
            <p className="min-w-0 flex-1 text-[0.88rem] leading-relaxed">
              Delete every logged period and every private note? This cannot be undone. Your
              planning, habits, goals and focus records are not touched.
            </p>
            <button
              type="button"
              onClick={() => {
                onDelete();
                setConfirming(false);
              }}
              className="btn btn-sm btn-quiet text-destructive"
            >
              Delete all cycle data
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="btn btn-sm btn-ghost"
            >
              Keep it
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={!enabled}
            onClick={() => setConfirming(true)}
            className="flex items-center gap-1.5 text-[0.85rem] text-muted-foreground transition-colors hover:text-destructive disabled:opacity-45"
          >
            <Trash2 aria-hidden className="h-3.5 w-3.5" />
            Delete all cycle data
          </button>
        )}
      </div>
    </section>
  );
}
