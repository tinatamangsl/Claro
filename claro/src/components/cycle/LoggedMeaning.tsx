import { Link } from "@tanstack/react-router";
import { Pencil, Undo2, X } from "lucide-react";

import { RangeStepper } from "@/components/cycle/RangeStepper";
import { useEffect, useRef, useState } from "react";

import {
  CYCLE_LENGTH_NOTE,
  confirmedRange,
  describeRefusal,
  durationOf,
  editPeriod,
  entryOn,
  estimateNext,
  formatWeeksAndDays,
} from "@/lib/cycle";
import { NO_JUDGEMENT_NOTE, SUPPORT_NOTE } from "@/lib/cycle-guide";
import { formatDayShort } from "@/lib/dates";
import type { CycleEntry, CycleState, ISODate } from "@/lib/types";

type Props = {
  cycle: CycleState;
  todayId: ISODate;
  /** The start date of the period that was just recorded. */
  startDate: ISODate;
  onReplace: (entries: Record<string, CycleEntry>) => void;
  onUndo: (id: string) => void;
  /** The period moved, so the card can keep pointing at it. */
  onMoved: (startDate: ISODate) => void;
  onDismiss: () => void;
};

/**
 * What just got recorded, what it means, and how to take it back.
 *
 * Undo lives here because here is where the mistake happens. A range painted
 * with a finger lands on the wrong day often enough that "open the history,
 * find the entry, press the small cross" is the wrong answer: the way out has
 * to be in the same place as the way in, and it has to be visible without
 * hunting for it.
 *
 * The explanation underneath is the other half. This is the moment a cycle app
 * usually says what phase you are entering and what to expect from your body.
 * Claro cannot know either, so it explains what it can: what was written down,
 * how the arithmetic works, and what will now appear on the calendar.
 */
export function LoggedMeaning({
  cycle,
  todayId,
  startDate,
  onReplace,
  onUndo,
  onMoved,
  onDismiss,
}: Props) {
  const entry = entryOn(cycle, startDate);
  const card = useRef<HTMLElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [from, setFrom] = useState<ISODate>(startDate);
  const [to, setTo] = useState<ISODate | null>(entry?.endDate ?? null);
  const [refusal, setRefusal] = useState<string | null>(null);

  /*
   * The card is the undo, so it has to be somewhere the user can see. A drag on
   * the calendar happens well below it on a phone, and a confirmation nobody
   * scrolls back up to is not a confirmation.
   */
  useEffect(() => {
    // Optional call: jsdom does not implement it, and a confirmation that
    // cannot scroll is still a confirmation.
    card.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [startDate]);

  if (!entry) return null;

  const range = confirmedRange(cycle, entry, todayId);
  const days = durationOf(cycle, entry, todayId);
  const estimate = estimateNext(cycle);

  const save = () => {
    const result = editPeriod(cycle, entry.id, { startDate: from, endDate: to }, todayId);
    if (!result.ok) {
      setRefusal(describeRefusal(result, cycle, todayId));
      return;
    }
    onReplace(result.entries);
    setRefusal(null);
    setEditing(false);
    // The card is keyed by start date, so a moved start has to be followed or
    // the confirmation vanishes at the exact moment it is being relied on.
    if (from !== startDate) onMoved(from);
  };

  return (
    <section
      ref={card}
      role="status"
      className="surface-raised relative scroll-mt-24 rounded-xl border-l-[3px] border-primary p-5"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Close"
        className="btn btn-sm btn-icon btn-ghost absolute top-2 right-2"
      >
        <X aria-hidden className="h-3.5 w-3.5" />
      </button>

      <p className="eyebrow">Recorded</p>

      <p className="display mt-2 pr-8 text-[1.2rem] leading-snug italic">
        {range.from === range.to
          ? `${formatDayShort(range.from)}, one day so far.`
          : `${formatDayShort(range.from)} to ${formatDayShort(range.to)}, ${days} days.`}
      </p>

      {/* The way out, in the same place as the way in. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onUndo(entry.id)}
          className="btn btn-sm btn-quiet gap-1.5"
        >
          <Undo2 aria-hidden className="h-3.5 w-3.5" />
          Undo this
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing((was) => !was);
            setRefusal(null);
          }}
          aria-expanded={editing}
          className="btn btn-sm btn-ghost gap-1.5"
        >
          <Pencil aria-hidden className="h-3.5 w-3.5" />
          Change the dates
        </button>
        <span className="text-[11px] text-muted-foreground">Wrong days? Fix it here.</span>
      </div>

      {editing && (
        <div className="paper-panel mt-3 p-3.5">
          <RangeStepper
            from={from}
            to={to}
            todayId={todayId}
            onChange={(nextFrom, nextTo) => {
              setFrom(nextFrom);
              setTo(nextTo);
              setRefusal(null);
            }}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={save} className="btn btn-sm btn-quiet">
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setFrom(startDate);
                setTo(entry.endDate);
                setEditing(false);
                setRefusal(null);
              }}
              className="btn btn-sm btn-ghost"
            >
              Cancel
            </button>
          </div>
          {refusal && (
            <p role="alert" className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {refusal}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 space-y-2 border-t border-border/70 pt-3 text-[0.88rem] leading-relaxed">
        <p>{CYCLE_LENGTH_NOTE}</p>

        {estimate ? (
          <p>
            From this, your next period is estimated around{" "}
            <span className="tnum font-medium">{formatDayShort(estimate.nextStart)}</span>, using{" "}
            {estimate.source === "logged"
              ? `the median of ${estimate.basedOn} recorded ${estimate.basedOn === 1 ? "gap" : "gaps"}`
              : `the ${formatWeeksAndDays(estimate.typicalGap)} you told Claro`}
            . It is now marked on the calendar as an estimate, not a certainty.
          </p>
        ) : (
          <p>
            Claro cannot estimate a next date yet. Log two more starts, or tell it roughly how long
            your cycle usually runs, and the estimate appears on the calendar straight away.
          </p>
        )}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        {NO_JUDGEMENT_NOTE} {SUPPORT_NOTE}{" "}
        <Link to="/cycle-guide" className="underline underline-offset-2 hover:text-foreground">
          What the phases are, with sources.
        </Link>
      </p>
    </section>
  );
}
