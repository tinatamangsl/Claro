import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";

import { markFor } from "@/lib/cycle-calendar";
import { projectedDay } from "@/lib/cycle-phases";
import { PhaseLegend } from "@/components/cycle/PhaseLegend";
import { formatMonthShort, monthGrid, monthsOfYear, yearOfMonth } from "@/lib/calendar";
import { formatDayOfMonth, formatDayLong } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { CycleState, ISODate } from "@/lib/types";

type Props = {
  cycle: CycleState;
  todayId: ISODate;
  onOpenMonth: (monthId: string) => void;
  /** The month/year switch, rendered on this card rather than floating above it. */
  trailing?: ReactNode;
};

/**
 * A whole year at a glance.
 *
 * The same two marks as the month calendar and no others: a day the user logged
 * is filled, an estimated day is outlined. At this size the distinction has to
 * survive being four pixels across, which is why one is solid and the other is
 * a ring rather than the same colour at two opacities.
 */
export function YearCalendar({ cycle, todayId, onOpenMonth, trailing }: Props) {
  const [year, setYear] = useState(() => Number(todayId.slice(0, 4)));

  return (
    <div className="surface p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setYear((y) => y - 1)}
          aria-label="Previous year"
          className="btn btn-sm btn-icon btn-quiet"
        >
          <ChevronLeft aria-hidden className="h-4 w-4" />
        </button>
        <h3 className="flex-1 text-center display tnum text-[1.25rem]">{year}</h3>
        <button
          type="button"
          onClick={() => setYear((y) => y + 1)}
          aria-label="Next year"
          className="btn btn-sm btn-icon btn-quiet"
        >
          <ChevronRight aria-hidden className="h-4 w-4" />
        </button>
        {trailing}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
        {monthsOfYear(year).map((monthId) => (
          <MiniMonth
            key={monthId}
            cycle={cycle}
            monthId={monthId}
            todayId={todayId}
            onOpen={() => onOpenMonth(monthId)}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/70 pt-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-primary/45" />
          Logged by you
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full border border-dashed border-foreground/40"
          />
          Estimated next period
        </span>
      </div>

      <PhaseLegend className="mt-3" />
    </div>
  );
}

function MiniMonth({
  cycle,
  monthId,
  todayId,
  onOpen,
}: {
  cycle: CycleState;
  monthId: string;
  todayId: ISODate;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${formatMonthShort(monthId)} ${yearOfMonth(monthId)}`}
      className="rounded-lg p-1 text-left transition-colors hover:bg-muted/60"
    >
      <span className="block text-[11px] font-medium">{formatMonthShort(monthId)}</span>

      <span className="mt-1.5 grid grid-cols-7 gap-[3px]">
        {monthGrid(monthId).map((cell) => {
          const mark = cell.inMonth ? markFor(cycle, cell.dayId, todayId) : null;
          const phase = cell.inMonth ? projectedDay(cycle, cell.dayId) : null;
          return (
            <span
              key={cell.dayId}
              title={cell.inMonth ? formatDayLong(cell.dayId) : undefined}
              className={cn(
                "tnum grid aspect-square place-items-center rounded-[3px] text-[8px] leading-none",
                !cell.inMonth && "text-transparent",
                phase && `phase-${phase.phase}`,
                phase?.projected && "phase-projected",
                mark?.period && "bg-primary/45 font-medium",
                mark?.estimated && "border border-dashed border-foreground/40",
                cell.dayId === todayId && "font-semibold ring-1 ring-foreground/70",
              )}
            >
              {cell.inMonth ? formatDayOfMonth(cell.dayId) : "·"}
            </span>
          );
        })}
      </span>
    </button>
  );
}
