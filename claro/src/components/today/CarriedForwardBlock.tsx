import { useState } from "react";
import { ArrowUp, CalendarClock, ListPlus, X } from "lucide-react";

import { formatDayShort } from "@/lib/dates";
import { firstFreePriorityKey } from "@/lib/rollover";
import { cn } from "@/lib/utils";
import type { CarriedItem, Day } from "@/lib/types";

type Props = {
  day: Day;
  className?: string;
  onPromote: (itemId: string) => void;
  onKeepAsAction: (itemId: string) => void;
  onSchedule: (itemId: string, toDayId: string) => void;
  onLetGo: (itemId: string) => void;
};

/**
 * Work that arrived from an earlier day and has nowhere to go automatically —
 * because the three slots are already spoken for, or because it was an action
 * rather than a priority.
 *
 * Four choices, one of which is "let go". Nothing here counts, scores or
 * scolds: the point is to make a decision easy, not to make the pile feel like
 * a debt.
 */
export function CarriedForwardBlock({
  day,
  className,
  onPromote,
  onKeepAsAction,
  onSchedule,
  onLetGo,
}: Props) {
  if (day.carriedForward.length === 0) return null;

  const hasFreeSlot = firstFreePriorityKey(day) !== null;

  return (
    <section className={cn("shrink-0", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="eyebrow">Review carried forward</h2>
          <span className="text-[11px] text-muted-foreground">
            {day.carriedForward.length === 1
              ? "one thing came with you"
              : `${day.carriedForward.length} things came with you`}
          </span>
        </div>
      </div>

      <div className="paper-panel mt-2 divide-y divide-subtle px-3">
        {day.carriedForward.map((item) => (
          <CarriedRow
            key={item.id}
            item={item}
            canPromote={hasFreeSlot}
            onPromote={() => onPromote(item.id)}
            onKeepAsAction={() => onKeepAsAction(item.id)}
            onSchedule={(toDayId) => onSchedule(item.id, toDayId)}
            onLetGo={() => onLetGo(item.id)}
          />
        ))}
      </div>
    </section>
  );
}

function CarriedRow({
  item,
  canPromote,
  onPromote,
  onKeepAsAction,
  onSchedule,
  onLetGo,
}: {
  item: CarriedItem;
  canPromote: boolean;
  onPromote: () => void;
  onKeepAsAction: () => void;
  onSchedule: (toDayId: string) => void;
  onLetGo: () => void;
}) {
  const [scheduling, setScheduling] = useState(false);

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="min-w-0 flex-1 text-[0.9rem] leading-snug">{item.text}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          from {formatDayShort(item.originDayId)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onPromote}
          disabled={!canPromote}
          className="btn btn-sm btn-quiet disabled:opacity-45"
          title={canPromote ? undefined : "All three priorities are taken"}
        >
          <ArrowUp aria-hidden className="h-3 w-3" />
          Make it a priority
        </button>

        <button type="button" onClick={onKeepAsAction} className="btn btn-sm btn-ghost">
          <ListPlus aria-hidden className="h-3 w-3" />
          Keep as an action
        </button>

        {scheduling ? (
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="sr-only">Schedule "{item.text}" for</span>
            <input
              type="date"
              autoFocus
              onChange={(e) => {
                if (e.target.value) onSchedule(e.target.value);
              }}
              onBlur={() => setScheduling(false)}
              className="field-select tnum"
            />
          </label>
        ) : (
          <button
            type="button"
            onClick={() => setScheduling(true)}
            className="btn btn-sm btn-ghost"
          >
            <CalendarClock aria-hidden className="h-3 w-3" />
            Schedule later
          </button>
        )}

        <button
          type="button"
          onClick={onLetGo}
          aria-label={`Let go of "${item.text}"`}
          className="btn btn-sm btn-ghost ml-auto"
        >
          <X aria-hidden className="h-3 w-3" />
          Let go
        </button>
      </div>
    </div>
  );
}
