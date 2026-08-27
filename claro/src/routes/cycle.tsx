import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, CalendarDays, ChevronDown, Lock, NotebookPen, Trash2 } from "lucide-react";
import { useState } from "react";

import { useIsWide } from "@/hooks/use-is-wide";

import { AppShell } from "@/components/AppShell";
import { useClaro } from "@/lib/claro-store";
import { EditableText } from "@/components/EditableText";
import { CycleCalendar } from "@/components/cycle/CycleCalendar";
import { CycleGlance } from "@/components/cycle/CycleGlance";
import { GuidanceCards } from "@/components/cycle/GuidanceCards";
import { PhaseInsight } from "@/components/cycle/PhaseInsight";
import { FloatingLog } from "@/components/cycle/FloatingLog";
import { QuickEnergy } from "@/components/cycle/QuickEnergy";
import { CycleNumbers } from "@/components/cycle/CycleNumbers";
import { PeriodHistory } from "@/components/cycle/PeriodHistory";
import { LoggedMeaning } from "@/components/cycle/LoggedMeaning";
import { PhasePanel } from "@/components/cycle/PhasePanel";
import { WhatClaroDoes } from "@/components/cycle/WhatClaroDoes";
import { RangeStepper } from "@/components/cycle/RangeStepper";
import { YearCalendar } from "@/components/cycle/YearCalendar";
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
import { describeNoteWarmly, noticedExcerpt, observations } from "@/lib/cycle-timeline";
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

/** The four record surfaces, behind one control instead of stacked five deep. */
const CYCLE_TABS = ["numbers", "phases", "history"] as const;

type CycleTab = (typeof CYCLE_TABS)[number];

const TAB_META: Record<CycleTab, { label: string; heading: string; hint: string }> = {
  numbers: { label: "Numbers", heading: "Your numbers", hint: "from your own dates" },
  phases: { label: "Phases", heading: "Your cycle, part by part", hint: "what you logged" },
  history: { label: "History", heading: "Your logged periods", hint: "edit any of them" },
};

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
  const [scale, setScale] = useState<"month" | "year">("month");
  const [tab, setTab] = useState<CycleTab>("numbers");
  const wide = useIsWide();
  const [calendarOpen, setCalendarOpen] = useState(wide);
  const [recordsOpen, setRecordsOpen] = useState(wide);
  /** The period just recorded, so the page can explain it once. */
  const [justLogged, setJustLogged] = useState<string | null>(null);
  const {
    today,
    cycle,
    setCycleEnabled,
    setCycleEntries,
    deleteCycleEntry,
    writeCycleCheckIn,
    setCycleLength,
    deleteAllCycleData,
    writeGuidanceMatch,
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
        {/*
          No "Cycle at a glance" heading and no second privacy line.
          The lock badge above already says it is private, and the phase card
          below says what day it is: a title repeating both cost a screen of
          height on a phone to tell the reader nothing they could not see.
        */}
        <h1 className="sr-only">Cycle notes</h1>
      </header>

      {/*
        The order, which is the product decision on this page.

        The calendar used to be first, on the reasoning that it is what the
        page is for. It is what the page is *made of*; what somebody opens it
        for is "what about today?". So today comes first, as a question rather
        than a reading, then what some people find helpful, then the log, and
        only then the grid the rest of it is drawn from.
      */}
      <PhaseInsight
        cycle={cycle}
        todayId={today}
        onAnswer={(phase, answer) =>
          writeGuidanceMatch("phase", phase, today, answer, new Date())
        }
      />

      {/*
        The one reading everything below keys off, before everything below.
        It writes the same field the full form writes, so the quick row and the
        form can never hold two different answers about today.
      */}
      <QuickEnergy
        cycle={cycle}
        todayId={today}
        onWrite={(energy) => writeCycleCheckIn(today, { energy }, new Date())}
        onOpenLog={() => {
          document
            .getElementById("todays-log")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />

      <GuidanceCards
        cycle={cycle}
        todayId={today}
        onAnswer={(card, phase, answer) =>
          writeGuidanceMatch(card, phase, today, answer, new Date())
        }
      />

      {/*
        The deeper, user-led material is good and nobody was finding it: it sat
        behind a tab, inside a section, below the calendar. This surfaces it for
        the people who want it without putting it in front of the people who do
        not.
      */}
      <div className="-mt-6">
        <button
          type="button"
          onClick={() => {
            setTab("phases");
            setRecordsOpen(true);
            // After the section has been told to open, or it scrolls to a
            // summary that is still collapsed and the content lands off screen.
            requestAnimationFrame(() => {
              document
                .getElementById("cycle-records")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          }}
          className="text-[0.85rem] text-primary underline-offset-2 hover:underline"
        >
          Explore this phase in depth
        </button>
      </div>

      <section id="todays-log" className="scroll-mt-24">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 className="eyebrow">How are you feeling today?</h2>
          <span className="text-[11px] text-muted-foreground">private to you</span>
        </div>
        <div className="mt-3">
          <CheckIn
            todayId={today}
            note={checkInOn(cycle, today)}
            recent={recentCheckIns(cycle, 5)}
            onWrite={(patch) => writeCycleCheckIn(today, patch, new Date())}
          />
        </div>
      </section>

      <CycleGlance cycle={cycle} todayId={today} />

      <LongSection
        summary="Your cycle calendar"
        hint={scale === "month" ? "tap or drag any day" : "tap a month to open it"}
        open={calendarOpen}
        onToggle={setCalendarOpen}
      >
        <div className="flex justify-end">
          <ScaleToggle scale={scale} onChange={setScale} />
        </div>

        <div className="mt-3">
          {scale === "month" ? (
            <CycleCalendar
              cycle={cycle}
              todayId={today}
              onReplace={setCycleEntries}
              onDelete={deleteCycleEntry}
              onLogged={setJustLogged}
              noteOn={(dayId) => checkInOn(cycle, dayId)}
              onWriteNote={(dayId, patch) => writeCycleCheckIn(dayId, patch, new Date())}
            />
          ) : (
            <YearCalendar cycle={cycle} todayId={today} onOpenMonth={() => setScale("month")} />
          )}
        </div>
      </LongSection>

      {/* Then the action, and the three ways on. */}
      <LogPeriod
        cycle={cycle}
        todayId={today}
        onReplace={setCycleEntries}
        onLogged={setJustLogged}
      />

      <QuickActions />

      {/* What was just written down, and what it does and does not mean. */}
      {justLogged && (
        <LoggedMeaning
          cycle={cycle}
          todayId={today}
          startDate={justLogged}
          onReplace={setCycleEntries}
          onUndo={(id) => {
            deleteCycleEntry(id);
            setJustLogged(null);
          }}
          onMoved={setJustLogged}
          onDismiss={() => setJustLogged(null)}
        />
      )}

      {/*
        Four surfaces behind one control rather than stacked.
        Together they ran to five screens on a phone, which made the page an
        index nobody could hold in their head; separately each is one screen and
        the glance and the log stay above them, always.
      */}
      <LongSection
        id="cycle-records"
        summary={TAB_META[tab].heading}
        hint={TAB_META[tab].hint}
        open={recordsOpen}
        onToggle={setRecordsOpen}
      >
        <div
          role="tablist"
          aria-label="Your cycle records"
          className="mt-2.5 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1"
        >
          {CYCLE_TABS.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={tab === option}
              onClick={() => setTab(option)}
              className={cn(
                "rounded-lg py-1.5 text-[0.8rem] transition-colors",
                tab === option
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {TAB_META[option].label}
            </button>
          ))}
        </div>

        <div className="mt-3">
          {tab === "numbers" && (
            <CycleNumbers cycle={cycle} todayId={today} onSetLength={setCycleLength} />
          )}

          {tab === "phases" && (
            <>
              <PhasePanel cycle={cycle} todayId={today} />
              <Patterns cycle={cycle} />
            </>
          )}

          {tab === "history" && (
            <PeriodHistory
              cycle={cycle}
              todayId={today}
              onReplace={setCycleEntries}
              onDelete={deleteCycleEntry}
            />
          )}
        </div>
      </LongSection>

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

      <WhatClaroDoes />

      <FloatingLog
        targetId="todays-log"
        logged={checkInOn(cycle, today).energy !== null}
        onOpen={() => {
          const target = document.getElementById("todays-log");
          target?.scrollIntoView({ behavior: "smooth", block: "start" });
          // Focus the first energy control, so the tap that brought them here
          // leaves them able to answer rather than merely looking at it.
          target
            ?.querySelector<HTMLButtonElement>('[role="group"] button')
            ?.focus({ preventScroll: true });
        }}
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
  onLogged,
}: {
  cycle: CycleState;
  todayId: ISODate;
  onReplace: (entries: Record<string, CycleEntry>) => void;
  onLogged: (startDate: ISODate) => void;
}) {
  const [start, setStart] = useState<ISODate>(todayId);
  const [end, setEnd] = useState<ISODate | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const ongoing = ongoingPeriod(cycle);

  const apply = (result: LogResult, startDate?: ISODate) => {
    if (!result.ok) {
      setRefusal(describeRefusal(result, cycle, todayId));
      return false;
    }
    onReplace(result.entries);
    setRefusal(null);
    if (startDate) onLogged(startDate);
    return true;
  };

  return (
    <section className="surface-raised p-5">
      <h2 className="display text-[1.5rem] leading-tight">Log a period start</h2>
      <p className="mt-1 text-[0.85rem] text-muted-foreground">Today, or any day you remember.</p>

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
                todayId,
              )
            }
            className="btn btn-primary"
          >
            My period started today
          </button>
        )}
      </div>

      {/* Manual historical entry: nudged into place, never typed out. */}
      <div className="mt-5 border-t border-border/70 pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-[11px] text-muted-foreground">Add a past period</span>
          <span className="text-[10px] text-muted-foreground">
            Or drag across the days on the calendar below.
          </span>
        </div>

        <div className="mt-2.5">
          <RangeStepper
            from={start}
            to={end}
            todayId={todayId}
            onChange={(nextFrom, nextTo) => {
              setStart(nextFrom);
              setEnd(nextTo);
              setRefusal(null);
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => {
            const saved = apply(
              addPeriod(cycle, { startDate: start, endDate: end }, newId(), new Date(), todayId),
              start,
            );
            if (saved) {
              setStart(todayId);
              setEnd(null);
            }
          }}
          className="btn btn-sm btn-quiet mt-3"
        >
          Add this period
        </button>
      </div>

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
            key={`${observation.phase}:${observation.text}`}
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
  /*
   * One question at a time, revealed by answering the last one.
   *
   * All five fields at once is a form, and a form is a thing people abandon:
   * energy, mood, stress, a note and "what I actually notice" on screen
   * together read as work to be got through rather than three taps. Each step
   * appears when the one before it is answered, and the optional writing only
   * once the readings are done.
   *
   * A day already logged opens showing every step, because the reason to come
   * back to it is to change one of them, and hiding four behind a fifth would
   * make correcting stress mean re-answering energy.
   */
  const started = note.energy !== null;
  const showMood = started;
  const showStress = showMood && note.mood !== null;
  const showWriting = showStress && note.stress !== null;

  return (
    <section>
      {/* The heading lives on the section that holds this. */}
      <div className="surface space-y-4 p-4">
        <Scale
          legend="Energy"
          options={ENERGY_LEVELS}
          labels={ENERGY_LABELS}
          selected={note.energy}
          onSelect={(energy) => onWrite({ energy: energy as EnergyLevel | null })}
        />

        {showMood && (
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
        )}

        {showStress && (
          <Scale
            legend="Stress"
            options={STRESS_LEVELS}
            labels={STRESS_LABELS}
            selected={note.stress}
            onSelect={(stress) => onWrite({ stress: stress as StressLevel | null })}
          />
        )}

        {showWriting && (
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
        )}

        {/*
          Separate from the note above on purpose.
          That one answers Claro's questions. This one answers nothing: it is
          where somebody whose day does not match the general picture can say
          what is actually true, and it is the field the guidance cards defer
          to when they stop fitting.
        */}
        {showWriting && (
        <label className="block">
          <span className="block text-[0.85rem]">What I actually notice</span>
          <div className="paper-panel mt-2 px-3 pb-2">
            <EditableText
              value={note.noticed}
              onCommit={(text) => onWrite({ noticed: text })}
              multiline
              rows={2}
              ariaLabel="What I actually notice today"
              placeholder="what I actually notice"
              className="-ml-2 py-0 italic placeholder:italic"
            />
          </div>
        </label>
        )}

        {!started && (
          <p className="text-[11px] text-muted-foreground">
            Answer one and the next appears. Three taps on an ordinary day.
          </p>
        )}

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          These are your own notes for {formatDayShort(todayId)}. Claro does not read anything into
          them or change your plans because of them.
        </p>
      </div>

      {recent.length > 0 && (
        <div className="mt-4">
          <h3 className="eyebrow">Recent notes</h3>
          {/*
            Read back as language rather than as the record printed out.
            "Energy good, Mood steady, Stress moderate" is the row of a table;
            "Good energy, felt steady" is what somebody would actually say, and
            a middling stress reading on every row buried the two that mattered.
          */}
          <ul className="paper-panel mt-2 divide-y divide-subtle px-4">
            {recent.map((entry) => (
              <RecentNote key={entry.dayId} entry={entry} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** One row of the recent list, which opens to the whole day when tapped. */
function RecentNote({ entry }: { entry: ReturnType<typeof checkInOn> }) {
  const [open, setOpen] = useState(false);
  const summary = describeNoteWarmly(entry);
  const noticed = entry.noticed.trim();
  // Nothing to open when the row is already showing everything there is.
  const expandable = noticed !== "" || entry.note.trim() !== "" || entry.stress !== null;

  return (
    <li className="py-2 text-[0.85rem]">
      <button
        type="button"
        disabled={!expandable}
        aria-expanded={expandable ? open : undefined}
        onClick={() => setOpen((was) => !was)}
        className="flex w-full flex-wrap items-baseline gap-x-4 gap-y-1 text-left disabled:cursor-default"
      >
        <span className="tnum shrink-0">{formatDayShort(entry.dayId)}</span>
        <span className="min-w-0 flex-1 text-[0.82rem] text-muted-foreground">
          {summary}
          {noticed !== "" && (
            <span className="italic"> {noticedExcerpt(noticed)}</span>
          )}
        </span>
      </button>

      {open && expandable && (
        <div className="mt-1.5 space-y-1 pl-[3.5rem] text-[0.82rem] text-muted-foreground">
          {entry.stress && <p>Stress {STRESS_LABELS[entry.stress].toLowerCase()}</p>}
          {entry.note.trim() !== "" && <p>{entry.note}</p>}
          {noticed !== "" && <p className="italic">{noticed}</p>}
        </div>
      )}
    </li>
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

/**
 * A section that stays out of the way until it is wanted.
 *
 * A native `<details>` rather than state and a chevron: it is keyboard
 * reachable, findable by the browser's own in-page search, and it needs no
 * JavaScript to open.
 */
/**
 * A long section that opens itself when there is room.
 *
 * Collapsed on a phone and open above `md`. The cycle page reached 4,554px on a
 * 390px screen, most of it the calendar and the records behind the tabs, which
 * meant the log and the guidance were reachable only by scrolling past the two
 * heaviest things on the page. Controlled rather than an `open` attribute, so
 * "Explore this phase in depth" can open the records from elsewhere.
 */
function LongSection({
  summary,
  hint,
  open,
  onToggle,
  id,
  children,
}: {
  summary: string;
  hint: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <details
      id={id}
      open={open}
      onToggle={(event) => onToggle((event.currentTarget as HTMLDetailsElement).open)}
      className="group scroll-mt-24"
    >
      <summary className="flex cursor-pointer list-none items-baseline gap-2.5">
        <h2 className="eyebrow">{summary}</h2>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
        <ChevronDown
          aria-hidden
          className="ml-auto h-3.5 w-3.5 shrink-0 self-center text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function Disclosure({
  summary,
  hint,
  children,
}: {
  summary: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-baseline gap-2.5">
        <h2 className="eyebrow">{summary}</h2>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
        <ChevronDown
          aria-hidden
          className="ml-auto h-3.5 w-3.5 shrink-0 self-center text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/**
 * The three ways in, given equal weight.
 *
 * Logging a day, logging a period and reading the guide are different jobs; a
 * page that hides two of them behind the third makes the user hunt.
 */
function QuickActions() {
  const items = [
    { to: "/cycle-day" as const, icon: NotebookPen, label: "Log today", hint: "3 taps" },
    { to: "/cycle-day" as const, icon: CalendarDays, label: "This week", hint: "7 days", search: { view: "forecast" as const } },
    { to: "/cycle-guide" as const, icon: BookOpen, label: "Learn", hint: "with sources" },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <Link
          key={item.label}
          to={item.to}
          search={item.search}
          className="surface flex flex-col items-center gap-1.5 rounded-xl p-3.5 transition-colors hover:border-foreground/25"
        >
          <item.icon aria-hidden className="h-4 w-4 text-muted-foreground" />
          <span className="text-[0.85rem] font-medium">{item.label}</span>
          <span className="text-[10px] text-muted-foreground">{item.hint}</span>
        </Link>
      ))}
    </div>
  );
}

function ScaleToggle({
  scale,
  onChange,
}: {
  scale: "month" | "year";
  onChange: (next: "month" | "year") => void;
}) {
  return (
    <div className="flex rounded-full bg-muted p-0.5">
      {(["month", "year"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={scale === option}
          onClick={() => onChange(option)}
          className={cn(
            "rounded-full px-3 py-1 text-[11px] capitalize transition-colors",
            scale === option ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          {option}
        </button>
      ))}
    </div>
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
