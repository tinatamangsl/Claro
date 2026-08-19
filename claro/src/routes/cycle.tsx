import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Lock, Trash2, X } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { useClaro } from "@/lib/claro-store";
import { EditableText } from "@/components/EditableText";
import { CycleGlance } from "@/components/cycle/CycleGlance";
import { StartHistory } from "@/components/cycle/StartHistory";
import {
  LOG_REFUSAL,
  MIN_ENTRIES_FOR_ESTIMATE,
  addStart,
  checkInOn,
  estimateNext,
  hasAnyCycleData,
  recentCheckIns,
  sortedEntries,
} from "@/lib/cycle";
import { observations } from "@/lib/cycle-timeline";
import { formatDayDate, formatDayLong, formatDayShort } from "@/lib/dates";
import { newId } from "@/lib/id";
import { cn } from "@/lib/utils";
import type { CycleEntry, CycleState } from "@/lib/types";
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

function CycleNotes() {
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
        <h1 className="display mt-3 text-[2.4rem] sm:text-[2.9rem]">Cycle notes</h1>
        <p className="mt-2 max-w-prose text-[0.92rem] leading-relaxed text-muted-foreground">
          A place to record when a period starts and, if you want to, how a day felt. Claro keeps
          this separate from your planning and never shares it.
        </p>
      </header>

      {/* 1. The main action, never behind anything. */}
      <LogStart cycle={cycle} todayId={today} onReplace={setCycleEntries} />

      {/* 2. The private timeline. */}
      <section>
        <h2 className="eyebrow">Cycle at a glance</h2>
        <div className="mt-3">
          <CycleGlance cycle={cycle} todayId={today} />
        </div>
      </section>

      {/* 3 and 4. The estimate, then the starts it was worked out from. */}
      <Estimate cycle={cycle} />

      <section>
        <div className="flex items-baseline gap-2.5">
          <h2 className="eyebrow">Your logged starts</h2>
          <span className="text-[11px] text-muted-foreground">edit any of them</span>
        </div>
        <div className="mt-3">
          <StartHistory
            cycle={cycle}
            todayId={today}
            onReplace={setCycleEntries}
            onDelete={deleteCycleEntry}
          />
        </div>
      </section>

      {/* 5. Optional reflections, and what the user's own notes show. */}
      <Patterns cycle={cycle} />

      <CheckIn
        todayId={today}
        note={checkInOn(cycle, today)}
        recent={recentCheckIns(cycle)}
        onWrite={(patch) => writeCycleCheckIn(today, patch, new Date())}
      />

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
          If it is useful to you, Claro can keep a private note of when your period starts, and
          show a rough estimate of the next one worked out from your own entries only.
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

function LogStart({
  cycle,
  todayId,
  onReplace,
}: {
  cycle: CycleState;
  todayId: string;
  onReplace: (entries: Record<string, CycleEntry>) => void;
}) {
  const [date, setDate] = useState(todayId);
  const [refusal, setRefusal] = useState<string | null>(null);

  const log = (startDate: string) => {
    const result = addStart(cycle, startDate, newId(), new Date(), todayId);
    if (!result.ok) {
      setRefusal(LOG_REFUSAL[result.reason]);
      return;
    }
    onReplace(result.entries);
    setRefusal(null);
  };

  return (
    <section className="surface p-5">
      <h2 className="display text-[1.35rem] leading-tight">Log a period start</h2>
      <p className="mt-1 text-[0.85rem] text-muted-foreground">
        Today, or any date in the past you remember.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <button type="button" onClick={() => log(todayId)} className="btn btn-primary">
          It started today
        </button>

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (date) log(date);
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Or another date</span>
            <input
              type="date"
              value={date}
              max={todayId}
              onChange={(e) => {
                setDate(e.target.value);
                setRefusal(null);
              }}
              className="tnum rounded-md border border-border bg-card px-2.5 py-1.5 text-[0.88rem]"
            />
          </label>
          <button type="submit" className="btn btn-sm btn-quiet">
            Add this date
          </button>
        </form>
      </div>

      {refusal && (
        <p role="alert" className="mt-3 text-[0.85rem] text-muted-foreground">
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
          <li key={`${observation.band}:${observation.text}`} className="text-[0.88rem] leading-relaxed">
            {observation.text}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        This is your own pattern, not a recommendation. Claro does not suggest what to do about it.
      </p>
    </section>
  );
}

/** Only ever the user's own median gap, and only once there is enough of it. */
function Estimate({ cycle }: { cycle: ReturnType<typeof useClaro>["cycle"] }) {
  const estimate = estimateNext(cycle);
  const logged = sortedEntries(cycle).length;

  return (
    <section>
      <h2 className="eyebrow">Your estimate</h2>
      <div className="surface mt-3 p-4">
        {estimate ? (
          <>
            <p className="text-[0.92rem]">
              <span className="text-muted-foreground">Next start, around </span>
              <span className="tnum font-medium">{formatDayDate(estimate.nextStart)}</span>
            </p>
            <p className="mt-1.5 text-[0.85rem] leading-relaxed text-muted-foreground">
              Worked out from your own median of {estimate.typicalGap} days, across{" "}
              {estimate.basedOn} recorded {estimate.basedOn === 1 ? "gap" : "gaps"}.
            </p>
            <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-[0.82rem] leading-relaxed text-muted-foreground">
              This is an estimate, not medical advice. Cycles vary, and a number worked out from a
              handful of dates will sometimes be wrong.
            </p>
          </>
        ) : (
          <>
            <p className="text-[0.9rem] leading-relaxed">
              Not enough of your own history yet.
            </p>
            <p className="mt-1.5 text-[0.85rem] leading-relaxed text-muted-foreground">
              After {MIN_ENTRIES_FOR_ESTIMATE} logged dates, Claro can show a rough estimate worked
              out from the gaps between them. You have logged {logged} so far.
            </p>
          </>
        )}
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
  todayId: string;
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
              Delete every logged date and every private note? This cannot be undone.
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
