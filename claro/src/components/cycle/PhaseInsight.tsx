import { type ReactNode, useState } from "react";

import {
  DRIFTED_INVITATION,
  DRIFTED_NOTE,
  DRIFTED_QUESTIONS,
  PHASE_AFFIRMATIONS,
  answerToday,
  PHASE_QUESTIONS,
  hasDrifted,
} from "@/lib/cycle-guidance";
import { PHASE_META } from "@/lib/cycle-phases";
import { positionOn, whyThisForYou } from "@/lib/cycle-timeline";
import { estimatedWindow } from "@/lib/cycle-calendar";
import { formatDayShort } from "@/lib/dates";
import type { CycleState, ISODate, MatchAnswer } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MatchPrompt } from "./MatchPrompt";

/**
 * Today, in as few lines as it can honestly take.
 *
 * It opens with a **question**, not a reading. The design this replaces led
 * with lines like "your brain is working harder than usual" and "peak clarity,
 * say the thing": sentences that sound supportive and are, underneath, claims
 * about a body and a mind Claro has never met, from four dates somebody typed.
 * What Claro can honestly put at the top of the page is the arithmetic (which
 * day, which estimated phase, when the next period is estimated) and an
 * invitation to notice.
 *
 * **The strip carries no "mode" and no "strengths".** The supplied design
 * labelled each phase Visionary, Instigator, Communicator or Editor and listed
 * what the reader is good at while in it. That is a claim about what a phase
 * makes someone, which is the one thing this feature's rules forbid outright,
 * and no amount of hedging rescues a personality label.
 *
 * What the reader logged around this point before used to sit here too. It now
 * lives in Recent notes below, because it is history rather than today and it
 * was the single biggest thing between this card and the guidance under it.
 *
 * **It asks nothing back.** It used to carry "does this match what you are
 * feeling today?", which made sense when it opened with a question and makes
 * none now: an affirmation about what somebody is allowed to do is not a
 * reading to be confirmed. The four suggestion cards still ask, and that is
 * where the answers come from.
 *
 * The drift read stays even though nothing on this card can set it any more.
 * If somebody has already told the page twice that its reading is the opposite
 * of how they feel, handing them a confident line is precisely the wrong move,
 * so those answers still turn the affirmation back into a question.
 */
export function PhaseInsight({
  cycle,
  todayId,
  onAnswer,
  children,
}: {
  cycle: CycleState;
  todayId: ISODate;
  /** Answering the phase card. Optional: Daily embeds the card without asking. */
  onAnswer?: (phase: string, answer: MatchAnswer) => void;
  /**
   * Rendered inside the card, under the affirmation.
   *
   * Daily puts the one-tap energy row here so that seeing where you are and
   * recording how it feels are one object rather than two stacked ones. The
   * cycle page passes nothing and gets the card alone.
   */
  children?: ReactNode;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const position = positionOn(cycle, todayId);

  // No logged start to count from means no phase, and inventing one would be
  // the single most misleading thing this page could do.
  if (!position) {
    return (
      <section className="surface-raised p-5 sm:p-6">
        <h2 className="eyebrow">Today</h2>
        <p className="display mt-2 text-[1.3rem] italic leading-relaxed sm:text-[1.45rem]">
          {PHASE_QUESTIONS.follicular}
        </p>
        <p className="mt-2.5 max-w-prose text-[0.85rem] text-muted-foreground">
          Once you have logged a period start, Claro can say which day of your own cycle a date
          falls on. Until then there is nothing to count from.
        </p>

        {/*
          The energy row belongs here too, and its absence was a real hole: on
          Daily it meant somebody who had just turned cycle notes on could not
          log anything until they had enough history for a phase to exist.
          Recording how a day felt needs no estimate to be worth doing, and it
          is how the history that resolves this gets written in the first place.
        */}
        {children}
      </section>
    );
  }

  const drifted = hasDrifted(cycle.guidanceMatches, "phase", position.phase);
  const answer = answerToday(cycle.guidanceMatches, "phase", todayId);
  const window = estimatedWindow(cycle);
  const why = whyThisForYou(cycle, position.phase);

  return (
    <section className="surface-raised p-5 sm:p-6">
      {/*
        The badge reads as the card's title but is not one, so the heading is
        carried separately: a page whose first card has no heading is a page a
        screen reader cannot skim.
      */}
      <h2 className="sr-only">Today</h2>

      {/*
        A swatch, the phase and the day, on one row. The badge that used to
        carry all three read as the card's title and pushed the line the card
        is actually for down a level.
      */}
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn("h-2.5 w-2.5 shrink-0 rounded-full", `phase-key-${position.phase}`)}
        />
        <div className="min-w-0 flex-1">
          <p className="display text-[1.35rem] leading-tight">
            {PHASE_META[position.phase].label}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Day {position.day} of about {position.ofAbout}
            {position.projected && ", projected"}
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-border/60 pt-4">
        <p className="display text-[1.25rem] italic leading-relaxed sm:text-[1.35rem]">
          {drifted ? DRIFTED_QUESTIONS[position.phase] : PHASE_AFFIRMATIONS[position.phase]}
        </p>

        {drifted && (
          <p className="mt-2 max-w-prose text-[0.85rem] text-muted-foreground">{DRIFTED_NOTE}</p>
        )}

      {/*
        An inline reveal, not the design's floating tooltip. That one was drawn
        on hover with `pointer-events: none`, which is nothing at all on a
        phone, and this is the one line on the card actually drawn from the
        reader's own history. It appears only when there are enough notes to
        say something true: see `whyThisForYou`.
      */}
      {!drifted && why && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowWhy((prev) => !prev)}
            aria-expanded={showWhy}
            aria-controls="why-this-for-you"
            className="flex items-center gap-2 text-[10px] tracking-[0.1em] text-muted-foreground uppercase hover:text-foreground"
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
            Why this, for you
          </button>
          {showWhy && (
            <p
              id="why-this-for-you"
              className="mt-2 max-w-prose text-[0.85rem] leading-relaxed text-muted-foreground"
            >
              {why}
            </p>
          )}
        </div>
      )}

        {drifted && (
          <p className="mt-2 text-[0.82rem] text-muted-foreground">{DRIFTED_INVITATION}</p>
        )}

        {/*
          The next window, and the standing reminder of what all of this is.
          Both came off when the card became the design's affirmation, and both
          were asked for back: the estimate is otherwise only in the Cycle
          length tab, and a phase name with no caveat beside it reads as a
          measurement rather than as arithmetic on dates somebody typed.
        */}
        {window && (
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="stat-chip">
              Next period estimated {formatDayShort(window.from)}
            </span>
          </div>
        )}

        <p className="mt-3 text-[10px] text-muted-foreground">
          Estimated from the dates you logged. Not a measurement.
        </p>

        {children}

        {onAnswer && (
          <MatchPrompt
            cardLabel="the phase card"
            answer={answer}
            onAnswer={(next) => onAnswer(position.phase, next)}
          />
        )}
      </div>

    </section>
  );
}
