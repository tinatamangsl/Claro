import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useState } from "react";

import { monthGrid, monthOfDay, formatMonthLong, shiftMonthId, type MonthId } from "@/lib/calendar";
import {
  addPeriod,
  confirmedRange,
  describeRefusal,
  durationOf,
  endPeriod,
  isOngoing,
  ongoingPeriod,
  periodEntryOn,
  reopenPeriod,
  type LogResult,
} from "@/lib/cycle";
import { estimatedWindow, markFor } from "@/lib/cycle-calendar";
import { formatDayDate, formatDayLong, formatDayOfMonth, formatDayShort } from "@/lib/dates";
import { newId } from "@/lib/id";
import { cn } from "@/lib/utils";
import type { CycleEntry, CycleState, ISODate } from "@/lib/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Props = {
  cycle: CycleState;
  todayId: ISODate;
  onReplace: (entries: Record<string, CycleEntry>) => void;
  onDelete: (id: string) => void;
};

/**
 * The cycle calendar.
 *
 * A logged period is drawn as one continuous band across every day it covers.
 * The estimated next period is pencilled in: dashed, unfilled, and never the
 * same treatment as a day somebody actually recorded.
 *
 * Tapping a day selects it and opens what can be done with that day underneath,
 * rather than acting immediately. A tap should never silently write a date into
 * someone's medical history.
 */
export function CycleCalendar({ cycle, todayId, onReplace, onDelete }: Props) {
  const [monthId, setMonthId] = useState<MonthId>(monthOfDay(todayId));
  const [selected, setSelected] = useState<ISODate | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const window = estimatedWindow(cycle);

  const apply = (result: LogResult) => {
    if (!result.ok) {
      setRefusal(describeRefusal(result, cycle, todayId));
      return;
    }
    onReplace(result.entries);
    setRefusal(null);
  };

  const select = (dayId: ISODate) => {
    setSelected(dayId === selected ? null : dayId);
    setRefusal(null);
  };

  // Bounded rather than full width: at 768px a seven column grid gives 100px
  // cells, which reads as a wall of boxes rather than a calendar.
  return (
    <div className="surface mx-auto w-full max-w-[30rem] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setMonthId(shiftMonthId(monthId, -1))}
          aria-label="Previous month"
          className="btn btn-sm btn-icon btn-quiet"
        >
          <ChevronLeft aria-hidden className="h-4 w-4" />
        </button>
        <h3 className="display text-[1.25rem]">{formatMonthLong(monthId)}</h3>
        <button
          type="button"
          onClick={() => setMonthId(shiftMonthId(monthId, 1))}
          aria-label="Next month"
          className="btn btn-sm btn-icon btn-quiet"
        >
          <ChevronRight aria-hidden className="h-4 w-4" />
        </button>
      </div>

      {/*
        A period band reaches into the gutter to close the gap between cells, so
        the row needs that much room back or the grid gains a 2px scroll of its
        own. Padding rather than `overflow-hidden`, which would clip the
        selection ring.
      */}
      {/*
        A period band reaches into the gutter to close the gap between cells, so
        the row needs that much room back or the grid gains a small scroll of
        its own. Padding rather than `overflow-hidden`, which would clip the
        selection ring.
      */}
      <div className="cycle-grid mt-4 grid grid-cols-7 gap-1 px-0.5">
        {WEEKDAYS.map((day) => (
          <span
            key={day}
            aria-hidden
            className="pb-1 text-center text-[10px] tracking-wide text-muted-foreground uppercase"
          >
            {day.slice(0, 1)}
          </span>
        ))}

        {monthGrid(monthId).map((cell) => {
          const mark = markFor(cycle, cell.dayId, todayId);
          const isSelected = selected === cell.dayId;

          return (
            <button
              key={cell.dayId}
              type="button"
              onClick={() => select(cell.dayId)}
              aria-pressed={isSelected}
              aria-current={cell.dayId === todayId ? "date" : undefined}
              aria-label={[
                formatDayLong(cell.dayId),
                mark.period
                  ? mark.ongoing
                    ? "logged period day, still ongoing"
                    : "logged period day"
                  : null,
                mark.estimated ? "estimated next period" : null,
                mark.note ? "you wrote a note" : null,
              ]
                .filter(Boolean)
                .join(", ")}
              className={cn(
                "relative grid aspect-square place-items-center rounded-lg text-[0.8rem] transition-colors",
                cell.inMonth ? "text-foreground" : "text-muted-foreground/40",
                cell.dayId === todayId && "font-medium",
                isSelected && "ring-2 ring-ring ring-offset-1 ring-offset-card",
              )}
            >
              {/* Confirmed: one band, closed across the gutter. */}
              {mark.period && (
                <span
                  aria-hidden
                  className={cn(
                    "cycle-band",
                    mark.isStart && "cycle-band-start",
                    mark.isEnd && (mark.ongoing ? "cycle-band-open" : "cycle-band-end"),
                  )}
                />
              )}

              {/* Estimated: pencilled, never filled. */}
              {mark.estimated && !mark.period && window && (
                <span
                  aria-hidden
                  className={cn(
                    "cycle-estimate",
                    cell.dayId === window.from && "cycle-estimate-start",
                    cell.dayId === window.to && "cycle-estimate-end",
                  )}
                />
              )}

              <span className={cn("tnum relative", mark.isStart && "font-semibold")}>
                {formatDayOfMonth(cell.dayId)}
              </span>

              {mark.note && (
                <span
                  aria-hidden
                  className="absolute bottom-[3px] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-foreground/45"
                />
              )}
            </button>
          );
        })}
      </div>

      <Key window={window} />

      {selected && (
        <SelectedDay
          cycle={cycle}
          dayId={selected}
          todayId={todayId}
          onApply={apply}
          onDelete={(id) => {
            onDelete(id);
            setRefusal(null);
          }}
        />
      )}

      {refusal && (
        <p role="alert" className="mt-3 text-[0.85rem] leading-relaxed text-muted-foreground">
          {refusal}
        </p>
      )}

      {!selected && (
        <p className="mt-3 text-[0.82rem] leading-relaxed text-muted-foreground">
          Choose any day to log a period that started then, or to change one you have already
          logged.
        </p>
      )}
    </div>
  );
}

function Key({ window }: { window: { from: ISODate; to: ISODate } | null }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/70 pt-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="cycle-key-period h-2.5 w-5 rounded-full" />
        Logged by you
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="cycle-key-estimate h-2.5 w-5 rounded" />
        Estimated next period
      </span>
      {window && (
        <span className="tnum">
          {window.from === window.to
            ? `Estimated around ${formatDayShort(window.from)}`
            : `Estimated ${formatDayShort(window.from)} to ${formatDayShort(window.to)}`}
        </span>
      )}
    </div>
  );
}

/**
 * What this day is, and what may be done with it.
 *
 * The available actions are derived from the day itself, so an ongoing period
 * is closed by choosing the day it ended rather than by typing a date twice.
 */
function SelectedDay({
  cycle,
  dayId,
  todayId,
  onApply,
  onDelete,
}: {
  cycle: CycleState;
  dayId: ISODate;
  todayId: ISODate;
  onApply: (result: LogResult) => void;
  onDelete: (id: string) => void;
}) {
  const entry = periodEntryOn(cycle, dayId, todayId);
  const mark = markFor(cycle, dayId, todayId);
  const ongoing = ongoingPeriod(cycle);
  const future = dayId > todayId;

  return (
    <div className="paper-panel mt-4 p-4">
      <p className="text-[0.9rem] font-medium">{formatDayDate(dayId)}</p>

      {entry ? (
        <LoggedDay
          cycle={cycle}
          entry={entry}
          dayId={dayId}
          todayId={todayId}
          onApply={onApply}
          onDelete={() => onDelete(entry.id)}
        />
      ) : (
        <div className="mt-2 space-y-3">
          <p className="text-[0.85rem] leading-relaxed text-muted-foreground">
            {future
              ? "This day has not happened yet, so nothing can be logged for it."
              : mark.estimated
                ? "Nothing is logged here. This day falls inside the estimate worked out from your own dates."
                : "Nothing is logged here."}
          </p>

          {!future && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  onApply(
                    addPeriod(cycle, { startDate: dayId, endDate: null }, newId(), new Date(), todayId),
                  )
                }
                className="btn btn-sm btn-primary"
              >
                A period started on this day
              </button>

              {ongoing && dayId > ongoing.startDate && (
                <button
                  type="button"
                  onClick={() => onApply(endPeriod(cycle, ongoing.id, dayId, todayId))}
                  className="btn btn-sm btn-quiet"
                >
                  My period ended on this day
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LoggedDay({
  cycle,
  entry,
  dayId,
  todayId,
  onApply,
  onDelete,
}: {
  cycle: CycleState;
  entry: CycleEntry;
  /** The day that was tapped, which is what "ended on this day" refers to. */
  dayId: ISODate;
  todayId: ISODate;
  onApply: (result: LogResult) => void;
  onDelete: () => void;
}) {
  const range = confirmedRange(cycle, entry, todayId);
  const ongoing = isOngoing(cycle, entry) && entry.endDate === null;
  const days = durationOf(cycle, entry, todayId);

  return (
    <div className="mt-2 space-y-3">
      <p className="text-[0.85rem] leading-relaxed">
        Part of the period you logged from{" "}
        <span className="tnum">{formatDayShort(range.from)}</span>
        {ongoing ? (
          <>
            , still ongoing. <span className="tnum">{days}</span>{" "}
            {days === 1 ? "day" : "days"} so far.
          </>
        ) : (
          <>
            {" "}
            to <span className="tnum">{formatDayShort(range.to)}</span>.{" "}
            <span className="tnum">{days}</span> {days === 1 ? "day" : "days"}.
          </>
        )}
      </p>

      <div className="flex flex-wrap gap-2">
        {ongoing ? (
          // Closing it on the tapped day, so a period that ended on Tuesday is
          // not recorded as ending whenever the user got round to saying so.
          <button
            type="button"
            onClick={() => onApply(endPeriod(cycle, entry.id, dayId, todayId))}
            className="btn btn-sm btn-quiet"
          >
            {dayId === todayId ? "It ended today" : "My period ended on this day"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onApply(reopenPeriod(cycle, entry.id, todayId))}
            className="btn btn-sm btn-ghost"
          >
            It has not ended yet
          </button>
        )}

        <button
          type="button"
          onClick={onDelete}
          className="btn btn-sm btn-ghost gap-1.5 text-destructive"
        >
          <Trash2 aria-hidden className="h-3.5 w-3.5" />
          Delete this period
        </button>
      </div>
    </div>
  );
}
