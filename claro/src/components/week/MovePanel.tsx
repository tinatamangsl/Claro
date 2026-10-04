import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { monthGrid, monthOfDay, formatMonthLong, shiftMonthId } from "@/lib/calendar";
import {
  formatDayLong,
  formatDayShort,
  formatTimeLabel,
  scheduleSlots,
  shiftDayId,
} from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ISODate } from "@/lib/types";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** How far the quick list runs before the calendar is the better answer. */
const NEAR_DAYS = 7;

/**
 * Choosing where something goes: a day, then a time.
 *
 * **Two scales, because "move this" has two very different answers.** Almost
 * always it is tomorrow or one of the next few days, which should be one tap
 * off a list you can read. Occasionally it is the 3rd of next month, which a
 * list of the next few days can never reach, so the month sits under it rather
 * than instead of it. Offering only the calendar would make the common answer
 * cost a scan of a grid; offering only the list would make the rare one
 * impossible.
 *
 * The time step comes second and only for something that has one. An action
 * with no hour is moved by naming a day and nothing else, so asking it for a
 * time would be inventing a fact the record does not hold.
 */
export function MovePanel({
  fromDayId,
  currentTime,
  onPick,
  onBack,
}: {
  fromDayId: ISODate;
  /** The time it is on now, or null when it has none. */
  currentTime: string | null;
  onPick: (dayId: ISODate, time: string | null) => void;
  onBack: () => void;
}) {
  const [day, setDay] = useState<ISODate | null>(null);
  const [month, setMonth] = useState(() => monthOfDay(fromDayId));

  const near = Array.from({ length: NEAR_DAYS }, (_, i) => shiftDayId(fromDayId, i + 1));
  /*
   * The weekday alone, with the date beside it. Printing "Wednesday 30
   * September" and then "30 September" says the same thing twice in a row
   * eleven pixels wide.
   */
  const label = (dayId: ISODate, index: number) =>
    index === 0 ? "Tomorrow" : formatDayLong(dayId).split(" ")[0];

  const choose = (dayId: ISODate) => {
    // Nothing to ask about a record that has no time of its own.
    if (currentTime === null) onPick(dayId, null);
    else setDay(dayId);
  };

  if (day && currentTime !== null) {
    return (
      <TimeStep
        dayId={day}
        currentTime={currentTime}
        onPick={(time) => onPick(day, time)}
        onBack={() => setDay(null)}
      />
    );
  }

  return (
    <div>
      <Header title="Move to" onBack={onBack} />

      <div className="max-h-[8.5rem] overflow-y-auto">
        {near.map((dayId, index) => (
          <button
            key={dayId}
            type="button"
            role="menuitem"
            onClick={() => choose(dayId)}
            className="flex w-full items-baseline justify-between gap-3 rounded px-2 py-1.5 text-left text-[0.82rem] transition-colors hover:bg-muted"
          >
            <span>{label(dayId, index)}</span>
            <span className="tnum text-[10px] text-muted-foreground">
              {formatDayShort(dayId)}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-1 border-t border-subtle pt-1">
        <div className="flex items-center justify-between px-1 py-0.5">
          <button
            type="button"
            onClick={() => setMonth(shiftMonthId(month, -1))}
            aria-label="Previous month"
            className="btn btn-icon btn-ghost h-6 w-6"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <span className="text-[11px] text-muted-foreground">{formatMonthLong(month)}</span>
          <button
            type="button"
            onClick={() => setMonth(shiftMonthId(month, 1))}
            aria-label="Next month"
            className="btn btn-icon btn-ghost h-6 w-6"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-px px-1 pb-1">
          {WEEKDAYS.map((name, i) => (
            <span
              key={`${name}-${i}`}
              aria-hidden
              className="pb-0.5 text-center text-[9px] text-muted-foreground"
            >
              {name}
            </span>
          ))}
          {monthGrid(month).map((cell) => (
            <button
              key={cell.dayId}
              type="button"
              onClick={() => choose(cell.dayId)}
              aria-label={`Move to ${formatDayLong(cell.dayId)}`}
              className={cn(
                "tnum grid h-6 place-items-center rounded text-[10px] transition-colors hover:bg-muted",
                !cell.inMonth && "text-muted-foreground/40",
                cell.dayId === fromDayId && "ring-1 ring-gold",
              )}
            >
              {Number(cell.dayId.slice(-2))}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The time, as a list you scroll rather than a field you type into.
 *
 * Opens on the time it already has, so the common answer, "same time, other
 * day", is already in view and takes one tap. Every quarter of the schedule is
 * here because the alternative is a second control for "a time not on this
 * list", and `scheduleSlots` is the same vocabulary the day view offers.
 */
function TimeStep({
  dayId,
  currentTime,
  onPick,
  onBack,
}: {
  dayId: ISODate;
  currentTime: string;
  onPick: (time: string) => void;
  onBack: () => void;
}) {
  const slots = scheduleSlots();

  return (
    <div>
      <Header title={formatDayLong(dayId)} onBack={onBack} />

      <button
        type="button"
        role="menuitem"
        onClick={() => onPick(currentTime)}
        className="mb-1 block w-full rounded bg-muted px-2 py-1.5 text-left text-[0.82rem] transition-colors hover:bg-muted/70"
      >
        Keep {formatTimeLabel(currentTime)}
      </button>

      <div
        className="max-h-[11rem] overflow-y-auto"
        ref={(el) => {
          // Opened on the time it is already on, rather than at 5 AM with the
          // answer somewhere below the fold.
          const index = slots.indexOf(currentTime);
          if (el && index > 0) el.scrollTop = Math.max(0, (index - 2) * 26);
        }}
      >
        {slots.map((slot) => (
          <button
            key={slot}
            type="button"
            role="menuitem"
            onClick={() => onPick(slot)}
            className={cn(
              "tnum block w-full rounded px-2 py-1 text-left text-[0.8rem] transition-colors hover:bg-muted",
              slot === currentTime && "text-foreground",
              slot !== currentTime && "text-muted-foreground",
            )}
          >
            {formatTimeLabel(slot)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="mb-1 flex items-center gap-1 border-b border-subtle pb-1">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="btn btn-icon btn-ghost h-6 w-6"
      >
        <ChevronLeft className="h-3 w-3" />
      </button>
      <span className="truncate text-[11px] text-muted-foreground">{title}</span>
    </div>
  );
}
