import { Lock, Trash2, X } from "lucide-react";
import { useState } from "react";

import { formatDayDate, formatDayShort } from "@/lib/dates";
import { estimateNext, sortedEntries } from "@/lib/cycle";
import { newId } from "@/lib/id";
import type { CycleState, ISODate } from "@/lib/types";

type Props = {
  cycle: CycleState;
  todayId: ISODate;
  onEnable: (enabled: boolean) => void;
  onLogStart: (startDate: ISODate) => void;
  onDeleteEntry: (id: string) => void;
  onDeleteAll: () => void;
};

/**
 * Private cycle awareness.
 *
 * Off until it is explicitly turned on, kept apart from planning data, and
 * deletable in one action. The estimate is arithmetic on the user's own logged
 * dates and is labelled as an estimate wherever it appears.
 *
 * It says nothing about health, fertility, or what anyone should be doing —
 * this is a place to record a date and read it back, not advice.
 */
export function CyclePanel({
  cycle,
  todayId,
  onEnable,
  onLogStart,
  onDeleteEntry,
  onDeleteAll,
}: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [date, setDate] = useState(todayId);

  if (!cycle.settings.enabled) {
    return (
      <section className="surface p-5">
        <div className="flex items-baseline gap-2">
          <h2 className="eyebrow">Cycle</h2>
          <span className="text-[11px] text-muted-foreground">optional, private</span>
        </div>
        <p className="mt-2 max-w-prose text-[0.88rem] leading-relaxed text-muted-foreground">
          If it is useful to you, Claro can keep a private note of when your period starts and
          show a rough estimate of the next one, worked out from your own entries only. It is
          stored on this device with everything else, and you can delete all of it at any time.
        </p>
        <button type="button" onClick={() => onEnable(true)} className="btn btn-sm btn-quiet mt-4">
          Turn on cycle notes
        </button>
      </section>
    );
  }

  const entries = sortedEntries(cycle).reverse();
  const estimate = estimateNext(cycle);

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-2">
          <h2 className="eyebrow">Cycle</h2>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Lock aria-hidden className="h-3 w-3" />
            on this device only
          </span>
        </div>
        <button
          type="button"
          onClick={() => onEnable(false)}
          className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Turn off
        </button>
      </div>

      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (date) onLogStart(date);
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Period started</span>
          <input
            type="date"
            value={date}
            max={todayId}
            onChange={(e) => setDate(e.target.value)}
            className="tnum rounded-md border border-border bg-card px-2 py-1.5 text-[0.85rem]"
          />
        </label>
        <button type="submit" className="btn btn-sm btn-quiet">
          Log this date
        </button>
      </form>

      {estimate ? (
        <p className="mt-4 text-[0.88rem] leading-relaxed">
          <span className="text-muted-foreground">Estimated next start</span>{" "}
          <span className="tnum font-medium">{formatDayDate(estimate.nextStart)}</span>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            An estimate only — your own median of {estimate.typicalGap} days, from{" "}
            {estimate.basedOn} recorded {estimate.basedOn === 1 ? "gap" : "gaps"}. Cycles vary.
          </span>
        </p>
      ) : (
        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
          After three logged dates, Claro can show a rough estimate worked out from your own
          entries.
        </p>
      )}

      {entries.length > 0 && (
        <div className="mt-4 border-t border-border/70 pt-3">
          <h3 className="eyebrow">Logged dates</h3>
          <ul className="mt-2 space-y-1">
            {entries.map((entry) => (
              <li key={entry.id} className="group flex items-center gap-2 text-[0.85rem]">
                <span className="tnum flex-1">{formatDayShort(entry.startDate)}</span>
                <button
                  type="button"
                  onClick={() => onDeleteEntry(entry.id)}
                  aria-label={`Delete the entry for ${formatDayShort(entry.startDate)}`}
                  className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 border-t border-border/70 pt-3">
        {confirmingDelete ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.85rem]">Delete every cycle entry? This cannot be undone.</span>
            <button
              type="button"
              onClick={() => {
                onDeleteAll();
                setConfirmingDelete(false);
              }}
              className="btn btn-sm btn-quiet text-destructive"
            >
              Delete all
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="btn btn-sm btn-ghost"
            >
              Keep it
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-destructive"
          >
            <Trash2 aria-hidden className="h-3 w-3" />
            Delete all cycle data
          </button>
        )}
      </div>
    </section>
  );
}
