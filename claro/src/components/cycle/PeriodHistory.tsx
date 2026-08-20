import { Check, Pencil, X } from "lucide-react";
import { useState } from "react";

import {
  confirmedRange,
  describeRefusal,
  durationOf,
  editPeriod,
  gaps,
  isOngoing,
  sortedEntries,
} from "@/lib/cycle";
import { formatDayLong, formatDayShort } from "@/lib/dates";
import type { CycleEntry, CycleState, ISODate } from "@/lib/types";

/**
 * Every logged period, newest first, each one editable in place.
 *
 * A row shows three different numbers and keeps them apart: the dates the
 * period covered, how many days that was, and how long it was after the
 * previous start. The last of those is the cycle length, and it is measured
 * start to start, never from the duration beside it.
 *
 * Edits go through the same rules as new entries, so a duplicate, a future
 * date, a backwards range or an overlap is refused here too, with the reason
 * said plainly rather than the change quietly not happening.
 */
export function PeriodHistory({
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
        Nothing logged yet. Periods you record appear here, newest first.
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
  const [start, setStart] = useState(entry.startDate);
  const [end, setEnd] = useState(entry.endDate ?? "");
  const [refusal, setRefusal] = useState<string | null>(null);

  const ongoing = isOngoing(cycle, entry) && entry.endDate === null;
  const range = confirmedRange(cycle, entry, todayId);
  const days = durationOf(cycle, entry, todayId);

  const save = () => {
    const result = editPeriod(
      cycle,
      entry.id,
      { startDate: start, endDate: end === "" ? null : end },
      todayId,
    );
    if (!result.ok) {
      setRefusal(describeRefusal(result, cycle, todayId));
      return;
    }
    onReplace(result.entries);
    setRefusal(null);
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="py-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground">Started</span>
            <input
              type="date"
              value={start}
              max={todayId}
              autoFocus
              aria-label={`Start date of the period logged on ${formatDayShort(entry.startDate)}`}
              onChange={(e) => {
                setStart(e.target.value);
                setRefusal(null);
              }}
              className="tnum rounded-md border border-border bg-card px-2 py-1 text-[0.85rem]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground">Ended</span>
            <input
              type="date"
              value={end}
              max={todayId}
              min={start}
              aria-label={`End date of the period logged on ${formatDayShort(entry.startDate)}`}
              onChange={(e) => {
                setEnd(e.target.value);
                setRefusal(null);
              }}
              className="tnum rounded-md border border-border bg-card px-2 py-1 text-[0.85rem]"
            />
          </label>

          <button type="button" onClick={save} className="btn btn-sm btn-quiet gap-1.5">
            <Check aria-hidden className="h-3 w-3" />
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setStart(entry.startDate);
              setEnd(entry.endDate ?? "");
              setRefusal(null);
              setEditing(false);
            }}
            className="btn btn-sm btn-ghost"
          >
            Cancel
          </button>
        </div>

        <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
          Leave the end date empty while the period is still going.
        </p>
        {refusal && (
          <p role="alert" className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            {refusal}
          </p>
        )}
      </li>
    );
  }

  return (
    <li className="group py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="tnum text-[0.9rem] leading-snug">
            {formatDayLong(entry.startDate)}
            {entry.endDate !== null && (
              <span className="text-muted-foreground"> to {formatDayShort(entry.endDate)}</span>
            )}
          </p>

          {/*
            Two different numbers, side by side and never merged: how long the
            period lasted, and how long after the previous start it began. The
            second is the cycle length.
          */}
          <p className="tnum mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>
              {ongoing
                ? `Ongoing, ${days} ${days === 1 ? "day" : "days"} so far`
                : entry.endDate === null
                  ? "End not recorded"
                  : `${days} ${days === 1 ? "day" : "days"}`}
            </span>
            <span>{gap === null ? "first logged" : `${gap} days after the previous start`}</span>
          </p>

          <span className="sr-only">
            {`Confirmed from ${formatDayShort(range.from)} to ${formatDayShort(range.to)}.`}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Edit the period logged on ${formatDayShort(entry.startDate)}`}
            className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
          >
            <Pencil aria-hidden className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete the period logged on ${formatDayShort(entry.startDate)}`}
            className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
          >
            <X aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}
