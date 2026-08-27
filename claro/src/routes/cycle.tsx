import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, CalendarDays, ChevronDown, Lock, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";


import { AppShell } from "@/components/AppShell";
import { useClaro } from "@/lib/claro-store";
import { EditableText } from "@/components/EditableText";
import { CycleCalendar } from "@/components/cycle/CycleCalendar";
import { GuidanceCards } from "@/components/cycle/GuidanceCards";
import { PhaseInsight } from "@/components/cycle/PhaseInsight";
import { FloatingLog } from "@/components/cycle/FloatingLog";
import { CycleNumbers } from "@/components/cycle/CycleNumbers";
import { CycleLengthChart } from "@/components/cycle/CycleLengthChart";
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
/*
 * The four surfaces below the fold, in the design's own order and wording.
 *
 * `log` carries both halves of "your log": the daily check-in form and the
 * logged periods, which used to be a separate History tab. They are the same
 * question asked at two scales, and splitting them across two tabs was part of
 * what made this page an index rather than a page.
 */
const CYCLE_TABS = ["phases", "log", "notes", "length"] as const;

type CycleTab = (typeof CYCLE_TABS)[number];

const TAB_META: Record<CycleTab, { label: string; heading: string; hint: string }> = {
  phases: { label: "About this phase", heading: "Your cycle, part by part", hint: "what you logged" },
  log: { label: "Your log", heading: "Your log", hint: "today, and every period" },
  notes: { label: "Recent notes", heading: "Recent notes", hint: "in your own words" },
  length: { label: "Cycle length", heading: "Your cycle length", hint: "from your own dates" },
};

export const Route = createFileRoute("/cycle")({
  component: () => (
    <AppShell wide>
      <CycleNotes />
    </AppShell>
  ),
  head: () => ({ meta: [{ title: "Cycle notes: Claro" }] }),
});

/**
 * Cycle at a glance.
 *
 * The order on this page is the product decision, and it has now been made
 * twice in opposite directions. It used to be calendar first, then today
 * first on the reasoning that the calendar is what the page is *made of*
 * while what somebody opens it for is "what about today?". The current design
 * puts the calendar back at the top and earns it a different way: the today
 * strip beneath it is four lines rather than a screen, and the guidance under
 * that is four collapsed rows rather than three open cards, so the grid can
 * lead without burying the thing people came to do.
 *
 * Everything below is the user's own data read back to them, and nothing on
 * the page changes a plan.
 */
export function CycleNotes() {
  const [scale, setScale] = useState<"month" | "year">("month");
  const [tab, setTab] = useState<CycleTab>("phases");
  /*
   * Closed at every width. It used to open on a wide screen, on the reasoning
   * that there was room for it, and the result was that the one section the
   * brief moved below the fold was the only thing on the page that arrived
   * expanded: a nested tablist and a full phase panel under four cards that had
   * just been collapsed to make room. Secondary means secondary on a desktop
   * too. The summary line still says which tab it will open on, and the
   * browser's own in-page search still reaches inside it.
   */
  const [recordsOpen, setRecordsOpen] = useState(false);
  /**
   * Take the reader to today's note.
   *
   * It now sits inside the Your log tab of a section that is folded on a
   * phone, so a bare `scrollIntoView` would land them on a collapsed summary
   * and look like a dead control. Open the section, select the tab, and scroll
   * on the next frame once the content it is scrolling to actually exists.
   */
  const openLog = useCallback((focusFirst = false) => {
    setTab("log");
    setRecordsOpen(true);
    requestAnimationFrame(() => {
      const target = document.getElementById("todays-log");
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (focusFirst) {
        target
          ?.querySelector<HTMLButtonElement>('[role="group"] button')
          ?.focus({ preventScroll: true });
      }
    });
  }, []);

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
    <div className="space-y-10">
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
        The whole of "today" on one screen, side by side.

        This was a vertical stack: calendar, then today, then the cards, each
        full width. The design it comes from puts the calendar in a left column
        and today plus the four cards in a right one, and that is what makes it
        read as simple rather than as a long page with less on it. Stacked, the
        cards start below the fold however short the calendar gets; beside it,
        the reader sees where they are and what is suggested in one look.

        The ratio and the breakpoint are the design's: 1.35fr to 1fr, and one
        column below 860px, which is wider than the usual tablet breakpoint
        because two columns of this content stop working before the screen
        stops being a tablet.
      */}
      <div className="grid items-start gap-7 min-[860px]:grid-cols-[1.35fr_1fr]">
        {/*
          The calendar is no longer behind a disclosure. It leads the page and
          it is half the layout, so a control that folds it away was furniture
          around the one thing this column is for.
        */}
        <section>
          <h2 className="sr-only">Your cycle calendar</h2>
          {/*
            The switch rides on the card it switches. Floating above it, right
            aligned to a column edge, it read as a stray chip belonging to the
            page rather than a control belonging to the calendar.
          */}
          {scale === "month" ? (
            <CycleCalendar
              cycle={cycle}
              todayId={today}
              onReplace={setCycleEntries}
              onDelete={deleteCycleEntry}
              onLogged={setJustLogged}
              noteOn={(dayId) => checkInOn(cycle, dayId)}
              onWriteNote={(dayId, patch) => writeCycleCheckIn(dayId, patch, new Date())}
              trailing={<ScaleToggle scale={scale} onChange={setScale} />}
            />
          ) : (
            <YearCalendar
              cycle={cycle}
              todayId={today}
              onOpenMonth={() => setScale("month")}
              trailing={<ScaleToggle scale={scale} onChange={setScale} />}
            />
          )}
        </section>

        <div className="space-y-3.5">
          {/*
            One card for today, not two. The energy row writes the same field
            the full form writes, so the quick row and the form can never hold
            two different answers about today.
          */}
          {/*
            The energy row moved out with everything else the design's today
            card has no slot for. Energy is still set in the log, and the cards
            below still key to it; what it is not any more is a control on the
            one card whose whole job is to say one thing.
          */}
          <PhaseInsight cycle={cycle} todayId={today} />

          <GuidanceCards
            cycle={cycle}
            todayId={today}
            onAnswer={(card, phase, answer) =>
              writeGuidanceMatch(card, phase, today, answer, new Date())
            }
            onJournal={(journal) => writeCycleCheckIn(today, { journal }, new Date())}
          />
        </div>
      </div>

      {/*
        Nothing sits between the cards and the records.

        A link reading "explore this phase in depth" used to, and so did the
        period logging card and a grid of three tiles. All three were furniture
        left over from the page this replaced: the section below announces
        itself, the logging card is the logging table the brief moved below the
        fold, and every tile duplicated something already on screen. "Log today"
        was the energy row and the log tab, "Learn" was the guidance link at the
        foot, and only "This week" went anywhere new, so it survives as one line
        down there rather than as a third of a grid.
      */}

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
        the calendar, the strip and the log stay above them, always.
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
          className="mt-2.5 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 sm:grid-cols-4"
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
          {tab === "phases" && (
            <>
              <PhasePanel cycle={cycle} todayId={today} />
              <Patterns cycle={cycle} />
            </>
          )}

          {/*
            Both halves of "your log": today's note, and every period recorded.
            `recent` is empty here because Recent notes is now its own tab, and
            printing the same five rows under two labels is the duplication this
            redesign exists to remove.
          */}
          {tab === "log" && (
            <div className="space-y-8">
              <LogPeriod
                cycle={cycle}
                todayId={today}
                onReplace={setCycleEntries}
                onLogged={setJustLogged}
              />

              <section id="todays-log" className="scroll-mt-24">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <h2 className="eyebrow">How are you feeling today?</h2>
                  <span className="text-[11px] text-muted-foreground">private to you</span>
                </div>
                <div className="mt-3">
                  <CheckIn
                    todayId={today}
                    note={checkInOn(cycle, today)}
                    recent={[]}
                    onWrite={(patch) => writeCycleCheckIn(today, patch, new Date())}
                  />
                </div>
              </section>
              <PeriodHistory
                cycle={cycle}
                todayId={today}
                onReplace={setCycleEntries}
                onDelete={deleteCycleEntry}
              />
            </div>
          )}

          {tab === "notes" && <RecentNotes cycle={cycle} />}

          {tab === "length" && (
            <div className="space-y-8">
              <CycleLengthChart cycle={cycle} />
              <CycleNumbers cycle={cycle} todayId={today} onSetLength={setCycleLength} />
            </div>
          )}
        </div>
      </LongSection>

      {/*
        The two places worth going that are not on this page, as two lines
        rather than as a grid of tiles competing with the page's own content.
      */}
      <section className="flex flex-col gap-2.5 border-t border-border/70 pt-6">
        <Link
          to="/cycle-day"
          search={{ view: "forecast" }}
          className="inline-flex items-center gap-1.5 text-[0.88rem] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          <CalendarDays aria-hidden className="h-3.5 w-3.5" />
          The week ahead, day by day
        </Link>
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
        onOpen={() => openLog(true)}
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

/**
 * What the reader wrote, most recent first.
 *
 * Only notes carrying words. A row reading "medium energy" and nothing else is
 * already in the log above; this tab is for the sentences, which is why it
 * shows the note, what they said they noticed, and the journal answer, and
 * says nothing about any of them.
 */
function RecentNotes({ cycle }: { cycle: CycleState }) {
  const written = recentCheckIns(cycle, 30).filter(
    (entry) =>
      entry.note.trim() !== "" || entry.noticed.trim() !== "" || entry.journal.trim() !== "",
  );

  if (written.length === 0) {
    return (
      <p className="text-[0.85rem] text-muted-foreground">
        Nothing written down yet. Anything you type in today's log, or in a journal prompt,
        appears here.
      </p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {written.map((entry) => (
        <li key={entry.dayId} className="paper-panel px-4 py-3">
          <p className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
            <span className="tnum">{formatDayShort(entry.dayId)}</span>
            {describeNoteWarmly(entry) && (
              <>
                <span aria-hidden className="px-1.5">
                  &middot;
                </span>
                {describeNoteWarmly(entry)}
              </>
            )}
          </p>
          {entry.note.trim() !== "" && (
            <p className="mt-1.5 text-[0.88rem] leading-relaxed">{entry.note}</p>
          )}
          {entry.noticed.trim() !== "" && (
            <p className="mt-1.5 text-[0.88rem] leading-relaxed text-muted-foreground">
              Noticed: {entry.noticed}
            </p>
          )}
          {entry.journal.trim() !== "" && (
            <p className="display mt-1.5 text-[1rem] italic leading-relaxed">{entry.journal}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
