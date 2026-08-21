import { ChevronLeft, ChevronRight } from "lucide-react";

import { rangeLength } from "@/lib/cycle";
import { formatDayShort, formatRelativeDay, shiftDayId } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ISODate } from "@/lib/types";

type Props = {
  from: ISODate;
  /** Null while the period is still going. */
  to: ISODate | null;
  todayId: ISODate;
  onChange: (from: ISODate, to: ISODate | null) => void;
  /** False where an end is required, as when correcting a completed range. */
  allowOngoing?: boolean;
};

/**
 * Nudging a period's dates a day at a time.
 *
 * This replaces a pair of date inputs, which were the wrong control for the job
 * twice over. The correction people actually make is "that was a day earlier",
 * and a date picker turns one tap into opening a calendar, finding a cell and
 * confirming. It also asks somebody to read `21/08/2026` and decide whether it
 * is right, where "yesterday" is either right or wrong at a glance.
 *
 * The arrows enforce the shape as they go: neither end can pass today, and the
 * start cannot cross the end. An invalid range is not something to refuse
 * afterwards if it can simply not be reachable.
 */
export function RangeStepper({ from, to, todayId, onChange, allowOngoing = true }: Props) {
  const shiftFrom = (delta: number) => {
    const next = shiftDayId(from, delta);
    if (next > todayId) return;
    if (to !== null && next > to) return;
    onChange(next, to);
  };

  const shiftTo = (delta: number) => {
    if (to === null) return;
    const next = shiftDayId(to, delta);
    if (next > todayId || next < from) return;
    onChange(from, next);
  };

  const days = to === null ? null : rangeLength({ from, to });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <DayStepper
          label="Started"
          dayId={from}
          todayId={todayId}
          onShift={shiftFrom}
          canBack
          canForward={from < todayId && (to === null || from < to)}
        />

        {to === null ? (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground">Ended</span>
            <button
              type="button"
              onClick={() => onChange(from, todayId)}
              className="btn btn-sm btn-quiet"
            >
              Add an end date
            </button>
          </div>
        ) : (
          <DayStepper
            label="Ended"
            dayId={to}
            todayId={todayId}
            onShift={shiftTo}
            canBack={to > from}
            canForward={to < todayId}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="tnum text-[0.85rem]">
          {days === null ? "Still going" : `${days} ${days === 1 ? "day" : "days"}`}
        </span>
        {allowOngoing && to !== null && (
          <button
            type="button"
            onClick={() => onChange(from, null)}
            className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            It has not ended yet
          </button>
        )}
      </div>
    </div>
  );
}

function DayStepper({
  label,
  dayId,
  todayId,
  onShift,
  canBack,
  canForward,
}: {
  label: string;
  dayId: ISODate;
  todayId: ISODate;
  onShift: (delta: number) => void;
  canBack: boolean;
  canForward: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <Arrow
          label={`One day earlier for the ${label.toLowerCase()} date`}
          disabled={!canBack}
          onClick={() => onShift(-1)}
        >
          <ChevronLeft aria-hidden className="h-3.5 w-3.5" />
        </Arrow>

        <span className="min-w-[6.5rem] text-center">
          <span className="tnum block text-[0.92rem] leading-tight font-medium">
            {formatDayShort(dayId)}
          </span>
          <span className="block text-[10px] leading-tight text-muted-foreground">
            {formatRelativeDay(dayId, todayId)}
          </span>
        </span>

        <Arrow
          label={`One day later for the ${label.toLowerCase()} date`}
          disabled={!canForward}
          onClick={() => onShift(1)}
        >
          <ChevronRight aria-hidden className="h-3.5 w-3.5" />
        </Arrow>
      </div>
    </div>
  );
}

function Arrow({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("btn btn-sm btn-icon btn-quiet", disabled && "opacity-30")}
    >
      {children}
    </button>
  );
}
