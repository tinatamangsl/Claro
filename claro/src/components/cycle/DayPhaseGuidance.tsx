import { Link } from "@tanstack/react-router";

import { PHASE_CARDS, sourcesFor } from "@/lib/cycle-guide";
import {
  OVULATION_NOTE,
  PHASE_ESTIMATE_NOTE,
  PHASE_META,
  projectedDay,
  type CyclePhase,
} from "@/lib/cycle-phases";
import { pastNotesFor } from "@/lib/cycle-forecast";
import { summariseNote } from "@/lib/cycle-timeline";
import { formatDayShort } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { FEELING_META, type CycleState, type ISODate } from "@/lib/types";

/** Each phase's card on the guide page, so the wording has one home. */
const CARD_FOR: Record<CyclePhase, string> = {
  menstrual: "menstruation",
  follicular: "follicular",
  ovulation: "ovulation",
  luteal: "luteal",
};

/**
 * What this day is, for the day the user tapped.
 *
 * Three things, in order of how much Claro can stand behind them: which
 * estimated day and phase it is, what that phase is understood to be (in the
 * cited words already written for the guide page), and what this person
 * themselves wrote at this point in a previous cycle.
 *
 * Not a fourth thing. There is no advice about food, movement, work or rest
 * here, because a calendar estimate cannot support one and a suggestion printed
 * under a phase label reads as instruction however gently it is written.
 */
export function DayPhaseGuidance({
  cycle,
  dayId,
  todayId,
}: {
  cycle: CycleState;
  dayId: ISODate;
  todayId: ISODate;
}) {
  const phase = projectedDay(cycle, dayId);
  if (!phase) return null;

  const card = PHASE_CARDS.find((c) => c.id === CARD_FOR[phase.phase]);
  const sources = card ? sourcesFor(card) : [];
  const past = pastNotesFor(cycle, dayId, 2);

  return (
    <div className="mt-3 border-t border-border/70 pt-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span
          aria-hidden
          className={cn("h-2.5 w-2.5 rounded-full", `phase-key-${phase.phase}`)}
        />
        <span className="text-[0.88rem] font-medium">
          {PHASE_META[phase.phase].label}
        </span>
        <span className="tnum text-[11px] text-muted-foreground">
          estimated day {phase.day} of {phase.length}
          {phase.projected ? ", a cycle not yet logged" : ""}
        </span>
      </div>

      {card && (
        <p className="mt-2 text-[0.85rem] leading-relaxed">{card.body[0]}</p>
      )}

      {phase.phase === "ovulation" && (
        <p className="mt-2 rounded-md bg-muted/60 px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground">
          {OVULATION_NOTE}
        </p>
      )}

      {past.length > 0 && (
        <div className="mt-2.5">
          <p className="text-[10px] text-muted-foreground">
            What you wrote around this point before
          </p>
          <ul className="mt-1 space-y-0.5">
            {past.map((note) => (
              <li key={note.dayId} className="text-[0.82rem] leading-relaxed">
                <span className="tnum text-muted-foreground">
                  {formatDayShort(note.dayId)}
                </span>{" "}
                {summariseNote(note).toLowerCase() ||
                  (note.feeling ? FEELING_META[note.feeling].label.toLowerCase() : "a note")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-2.5 text-[10px] leading-relaxed text-muted-foreground">
        {PHASE_ESTIMATE_NOTE}{" "}
        {sources.length > 0 && (
          <>
            Written from {sources[0].organisation}.{" "}
            <Link
              to="/cycle-guide"
              className="underline underline-offset-2 hover:text-foreground"
            >
              The full guide, with sources.
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
