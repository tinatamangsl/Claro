import { estimatedWindow } from "@/lib/cycle-calendar";
import {
  DRIFTED_INVITATION,
  DRIFTED_NOTE,
  DRIFTED_QUESTIONS,
  PHASE_QUESTIONS,
  answerToday,
  hasDrifted,
} from "@/lib/cycle-guidance";
import { PHASE_ESTIMATE_NOTE, PHASE_META } from "@/lib/cycle-phases";
import { notesInPhase, positionOn, summariseNote } from "@/lib/cycle-timeline";
import { formatDayShort } from "@/lib/dates";
import type { CycleState, ISODate, MatchAnswer } from "@/lib/types";
import { MatchPrompt } from "./MatchPrompt";

/**
 * The first thing on the cycle page.
 *
 * It opens with a **question**, not a reading. The design this replaces led
 * with lines like "your brain is working harder than usual" and "energy is
 * building": sentences that sound supportive and are, underneath, claims about
 * a body Claro has never met, from four dates somebody typed. What Claro can
 * honestly put at the top of the page is the arithmetic (which day, which
 * estimated phase, when the next period is estimated) and an invitation to
 * notice, followed by what this person themselves wrote at this point before.
 *
 * When the reader has said more than once that this does not fit, the card
 * stops offering a frame at all and asks what they are noticing instead.
 */
export function PhaseInsight({
  cycle,
  todayId,
  onAnswer,
}: {
  cycle: CycleState;
  todayId: ISODate;
  onAnswer: (phase: string, answer: MatchAnswer) => void;
}) {
  const position = positionOn(cycle, todayId);
  const window = estimatedWindow(cycle);

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
      </section>
    );
  }

  const drifted = hasDrifted(cycle.guidanceMatches, "phase", position.phase);
  const answer = answerToday(cycle.guidanceMatches, "phase", todayId);
  const recent = notesInPhase(cycle, todayId, 3).filter((note) => summariseNote(note) !== "");

  return (
    <section className="surface-raised p-5 sm:p-6">
      {/*
        The badge reads as the card's title but is not one, so the heading is
        carried separately: a page whose first card has no heading is a page a
        screen reader cannot skim.
      */}
      <h2 className="sr-only">Today</h2>

      <div className="flex flex-wrap items-center gap-2">
        <span className="phase-badge">
          {PHASE_META[position.phase].label} phase, day {position.day}
        </span>
        {position.projected && (
          <span className="text-[10px] text-muted-foreground">projected</span>
        )}
      </div>

      <p className="display mt-3 text-[1.3rem] italic leading-relaxed sm:text-[1.45rem]">
        {drifted ? DRIFTED_QUESTIONS[position.phase] : PHASE_QUESTIONS[position.phase]}
      </p>

      {drifted ? (
        <p className="mt-2 max-w-prose text-[0.85rem] text-muted-foreground">{DRIFTED_NOTE}</p>
      ) : recent.length > 0 ? (
        <div className="mt-3">
          <p className="text-[10px] text-muted-foreground">
            What you wrote around this point before
          </p>
          <ul className="mt-1.5 space-y-1">
            {recent.map((note) => (
              <li key={note.dayId} className="text-[0.82rem] text-muted-foreground">
                <span className="tnum">{formatDayShort(note.dayId)}</span>
                {"  "}
                {summariseNote(note)}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2 max-w-prose text-[0.85rem] text-muted-foreground">
          Nothing logged around this point in earlier cycles yet.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="stat-chip">
          Day {position.day} of about {position.ofAbout}
        </span>
        {window && (
          <span className="stat-chip">Next period estimated {formatDayShort(window.from)}</span>
        )}
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground">{PHASE_ESTIMATE_NOTE}</p>

      <MatchPrompt
        cardLabel="the phase card"
        answer={answer}
        onAnswer={(next) => onAnswer(position.phase, next)}
      />

      {drifted && (
        <p className="mt-2 text-[0.82rem] text-muted-foreground">{DRIFTED_INVITATION}</p>
      )}
    </section>
  );
}
