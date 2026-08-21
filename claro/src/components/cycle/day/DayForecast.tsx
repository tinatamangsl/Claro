import { X } from "lucide-react";
import { useState } from "react";

import { forecast, pastNotesFor, type ForecastDay } from "@/lib/cycle-forecast";
import { BAND_LABELS, BAND_SHORT, summariseNote } from "@/lib/cycle-timeline";
import { formatDayShort, formatDayWeekday, formatDayOfMonth } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { CycleState, ISODate } from "@/lib/types";

type Props = {
  cycle: CycleState;
  todayId: ISODate;
  onBack: () => void;
};

/**
 * The next seven days.
 *
 * Each card carries the estimated cycle day, where it sits positionally, and
 * two facts drawn from the user's own record: whether a period is logged or
 * estimated there, and whether they have written anything at that point before.
 *
 * There is deliberately **no energy forecast and no descriptor**. The design
 * this came from had each day carry a predicted energy level and a word like
 * "Protect". Announcing on Monday that Thursday will be hard is a good way to
 * make Thursday hard, and Claro has no basis for the prediction in the first
 * place.
 */
export function DayForecast({ cycle, todayId, onBack }: Props) {
  const [open, setOpen] = useState<ISODate | null>(null);
  const days = forecast(cycle, todayId);
  const selected = days.find((d) => d.dayId === open) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="eyebrow">The next 7 days</h2>
        <button
          type="button"
          onClick={onBack}
          className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          back to today
        </button>
      </div>

      {/* Scrolls sideways inside its own strip; the page never does. */}
      <div className="-mx-5 overflow-x-auto px-5 pb-1">
        <div className="flex gap-2">
          {days.map((day) => (
            <DayCard key={day.dayId} day={day} onOpen={() => setOpen(day.dayId)} />
          ))}
        </div>
      </div>

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Worked out from the dates you logged. Claro does not predict how you will feel, how much you
        will manage, or what you should work on.
      </p>

      {selected && (
        <DaySheet cycle={cycle} day={selected} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

function DayCard({ day, onOpen }: { day: ForecastDay; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={[
        formatDayShort(day.dayId),
        day.cycleDay ? `estimated day ${day.cycleDay}` : null,
        day.isPeriod ? "logged period day" : null,
        day.isEstimated ? "estimated next period" : null,
        day.hasPastNotes ? "you have notes from this point before" : null,
      ]
        .filter(Boolean)
        .join(", ")}
      className={cn(
        "shrink-0 rounded-xl p-2 text-center transition-colors",
        day.isToday
          ? "w-[72px] border-l-2 border-primary bg-card shadow-sm"
          : "w-[68px] bg-card/70 hover:bg-card",
      )}
    >
      <span className="block text-[10px] text-muted-foreground">
        {formatDayWeekday(day.dayId).slice(0, 3)}
      </span>
      <span className="tnum mt-0.5 block text-[1rem] font-medium">
        {formatDayOfMonth(day.dayId)}
      </span>
      <span className="mt-0.5 block text-[10px] text-muted-foreground/80">
        {day.band ? BAND_SHORT[day.band] : "·"}
      </span>

      {/* A mark for what is recorded, never for a predicted level. */}
      <span
        aria-hidden
        className={cn(
          "mx-auto mt-1.5 block h-2.5 w-2.5 rounded-full",
          day.isPeriod
            ? "bg-primary"
            : day.isEstimated
              ? "border border-dashed border-foreground/40"
              : day.hasPastNotes
                ? "bg-foreground/30"
                : "border border-border",
        )}
      />

      <span className="mt-1 block text-[10px] font-medium text-muted-foreground">
        {day.isPeriod ? "Logged" : day.isEstimated ? "Estimate" : day.hasPastNotes ? "Notes" : "·"}
      </span>
    </button>
  );
}

/** What the user themselves recorded around that point, and nothing else. */
function DaySheet({
  cycle,
  day,
  onClose,
}: {
  cycle: CycleState;
  day: ForecastDay;
  onClose: () => void;
}) {
  const past = pastNotesFor(cycle, day.dayId, 3);

  return (
    <div className="surface mt-2 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.94rem] font-medium">{formatDayShort(day.dayId)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {day.cycleDay ? `Estimated day ${day.cycleDay}` : "No day count yet"}
            {day.band ? ` · ${BAND_LABELS[day.band]}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="btn btn-sm btn-icon btn-ghost shrink-0"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="mt-3 text-[0.88rem] leading-relaxed">
        {day.isPeriod
          ? "You logged a period covering this day."
          : day.isEstimated
            ? "This day falls inside the window estimated from your own dates. It is an estimate, not a certainty."
            : "Nothing is logged for this day."}
      </p>

      {past.length > 0 && (
        <div className="mt-3 border-t border-border/70 pt-3">
          <p className="text-[10px] text-muted-foreground">
            What you wrote around this point before
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {past.map((entry) => (
              <li key={entry.dayId} className="text-[0.85rem] leading-relaxed">
                <span className="tnum text-muted-foreground">{formatDayShort(entry.dayId)}</span>{" "}
                {summariseNote(entry).toLowerCase() || "a note"}
                {entry.note.trim() !== "" && `. ${entry.note.trim()}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
