import { Check, Pencil, X } from "lucide-react";
import { useState } from "react";

import { LOG_REFUSAL, editStart, gaps, sortedEntries } from "@/lib/cycle";
import { formatDayLong, formatDayShort } from "@/lib/dates";
import type { CycleEntry, CycleState, ISODate } from "@/lib/types";

/**
 * Every logged start, newest first, each one editable in place.
 *
 * Edits go through the same rules as new entries, so a duplicate or a future
 * date is refused here too, with the reason said plainly rather than the change
 * quietly not happening.
 */
export function StartHistory({
  cycle,
  todayId,
  onReplace,
  onDelete,
}: {
  cycle: CycleState;
  todayId: ISODate;
  onReplace: (entries: Record<string, CycleEntry>) => void;
  onDelete: (id: string) => void;
}) {
  const entries = sortedEntries(cycle);
  const between = gaps(entries);

  if (entries.length === 0) {
    return (
      <p className="text-[0.88rem] leading-relaxed text-muted-foreground">
        Nothing logged yet. Dates you save appear here, newest first.
      </p>
    );
  }

  return (
    <ul className="paper-panel divide-y divide-subtle px-4">
      {[...entries].reverse().map((entry, i) => {
        const index = entries.length - 1 - i;
        return (
          <HistoryRow
            key={entry.id}
            entry={entry}
            gap={index > 0 ? between[index - 1] : null}
            cycle={cycle}
            todayId={todayId}
            onReplace={onReplace}
            onDelete={() => onDelete(entry.id)}
          />
        );
      })}
    </ul>
  );
}

function HistoryRow({
  entry,
  gap,
  cycle,
  todayId,
  onReplace,
  onDelete,
}: {
  entry: CycleEntry;
  gap: number | null;
  cycle: CycleState;
  todayId: ISODate;
  onReplace: (entries: Record<string, CycleEntry>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(entry.startDate);
  const [refusal, setRefusal] = useState<string | null>(null);

  const save = () => {
    const result = editStart(cycle, entry.id, date, todayId);
    if (!result.ok) {
      setRefusal(LOG_REFUSAL[result.reason]);
      return;
    }
    onReplace(result.entries);
    setRefusal(null);
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`edit-${entry.id}`}>
            Change the date of the start logged on {formatDayShort(entry.startDate)}
          </label>
          <input
            id={`edit-${entry.id}`}
            type="date"
            value={date}
            max={todayId}
            autoFocus
            onChange={(e) => {
              setDate(e.target.value);
              setRefusal(null);
            }}
            className="tnum rounded-md border border-border bg-card px-2 py-1 text-[0.85rem]"
          />
          <button type="button" onClick={save} className="btn btn-sm btn-quiet gap-1.5">
            <Check aria-hidden className="h-3 w-3" />
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setDate(entry.startDate);
              setRefusal(null);
              setEditing(false);
            }}
            className="btn btn-sm btn-ghost"
          >
            Cancel
          </button>
        </div>
        {refusal && (
          <p role="alert" className="mt-1.5 text-[11px] text-muted-foreground">
            {refusal}
          </p>
        )}
      </li>
    );
  }

  return (
    <li className="group flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
      <span className="tnum min-w-0 flex-1 text-[0.9rem]">{formatDayLong(entry.startDate)}</span>
      <span className="tnum shrink-0 text-[11px] text-muted-foreground">
        {gap === null ? "first logged" : `${gap} days after the one before`}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit the start logged on ${formatDayShort(entry.startDate)}`}
        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Pencil aria-hidden className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete the start logged on ${formatDayShort(entry.startDate)}`}
        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X aria-hidden className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
