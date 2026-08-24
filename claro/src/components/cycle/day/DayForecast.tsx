import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { forecast, pastNotesFor, todayIndex, type ForecastDay } from "@/lib/cycle-forecast";
import { bandOf, ENERGY_BAND_LABELS } from "@/lib/cycle-log";
import { summariseNote } from "@/lib/cycle-timeline";
import { PHASE_META } from "@/lib/cycle-phases";
import { SUPPORTIVE_PROMPTS } from "@/lib/cycle-guide";
import { formatDayShort, formatDayWeekday, formatWeekdayShort } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { CycleState, ISODate, Priority } from "@/lib/types";

/** How far a drag has to travel before it counts as a swipe. */
const SWIPE_PX = 50;

type Props = {
  cycle: CycleState;
  todayId: ISODate;
  priorityFor: (dayId: ISODate) => Priority;
  onBack: () => void;
};

/**
 * The week, as cards you move through rather than a table you read.
 *
 * Three days back, today, three ahead, opening on today. Swipe, arrows and the
 * strip above all drive the same index, so touch, mouse and keyboard reach
 * every day.
 *
 * The energy shown on a card is the energy the user **logged**. A day they have
 * not logged says so. The design this came from predicted a level for every day
 * from the phase and captioned it with an instruction; Claro has no basis for
 * the prediction, and telling somebody on Monday what Thursday will cost them
 * is a good way to make Thursday cost that.
 */
export function DayForecast({ cycle, todayId, priorityFor, onBack }: Props) {
  const days = forecast(cycle, todayId);
  const [index, setIndex] = useState(() => todayIndex(days));
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const width = useRef(1);
  const frame = useRef<HTMLDivElement | null>(null);

  const clamp = (next: number) => Math.min(days.length - 1, Math.max(0, next));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") setIndex((i) => clamp(i + 1));
      if (event.key === "ArrowLeft") setIndex((i) => clamp(i - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const begin = (event: React.PointerEvent) => {
    // Pointer events, not touch events: the same handler has to serve a finger,
    // a trackpad and a mouse.
    width.current = frame.current?.clientWidth || 1;
    startX.current = event.clientX;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const move = (event: React.PointerEvent) => {
    if (!dragging) return;
    const dx = event.clientX - startX.current;
    // Resist at the ends rather than refusing, so the edge is felt.
    const atEdge = (dx > 0 && index === 0) || (dx < 0 && index === days.length - 1);
    setDrag(atEdge ? dx / 3 : dx);
  };

  const end = () => {
    if (!dragging) return;
    if (Math.abs(drag) > SWIPE_PX) setIndex((i) => clamp(i + (drag < 0 ? 1 : -1)));
    setDragging(false);
    setDrag(0);
  };

  const offset = `calc(${-index * 100}% + ${drag}px)`;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="eyebrow">Your week</h2>
        <button
          type="button"
          onClick={onBack}
          className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          back to today
        </button>
      </div>

      <WeekStrip days={days} index={index} onPick={setIndex} />

      <div ref={frame} className="overflow-hidden">
        <div
          data-dragging={dragging}
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          className={cn("swipe-track", !dragging && "swipe-settle")}
          style={{ transform: `translateX(${offset})` }}
        >
          {days.map((day) => (
            <div key={day.dayId} className="w-full shrink-0">
              <DayCard cycle={cycle} day={day} priority={priorityFor(day.dayId)} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setIndex((i) => clamp(i - 1))}
          disabled={index === 0}
          aria-label="Previous day"
          className="btn btn-sm btn-icon btn-quiet disabled:opacity-35"
        >
          <ChevronLeft aria-hidden className="h-4 w-4" />
        </button>

        <div className="flex gap-1.5">
          {days.map((day, i) => (
            <button
              key={day.dayId}
              type="button"
              aria-label={`Go to ${formatDayShort(day.dayId)}`}
              aria-current={i === index ? "true" : undefined}
              onClick={() => setIndex(i)}
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors",
                i === index ? "bg-foreground/60" : "bg-border",
              )}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setIndex((i) => clamp(i + 1))}
          disabled={index === days.length - 1}
          aria-label="Next day"
          className="btn btn-sm btn-icon btn-quiet disabled:opacity-35"
        >
          <ChevronRight aria-hidden className="h-4 w-4" />
        </button>
      </div>

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Worked out from the dates you logged. Claro does not predict how you will feel, how much you
        will manage, or what you should work on.
      </p>
    </div>
  );
}

/** The whole week at a glance. Circles show what was logged, never a forecast. */
function WeekStrip({
  days,
  index,
  onPick,
}: {
  days: ForecastDay[];
  index: number;
  onPick: (i: number) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map((day, i) => {
        const band = bandOf(day.loggedEnergy);
        return (
          <button
            key={day.dayId}
            type="button"
            onClick={() => onPick(i)}
            aria-label={[
              formatDayShort(day.dayId),
              band ? `logged ${ENERGY_BAND_LABELS[band].toLowerCase()} energy` : "not logged",
              day.isPeriod ? "period logged" : null,
            ]
              .filter(Boolean)
              .join(", ")}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg py-1.5 transition-colors",
              i === index ? "bg-card" : "hover:bg-card/60",
            )}
          >
            <span className="text-[10px] text-muted-foreground uppercase">
              {formatWeekdayShort(day.dayId)}
            </span>
            <span
              aria-hidden
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                band === "high"
                  ? "bg-primary"
                  : band === "medium"
                    ? "bg-foreground/35"
                    : band === "low"
                      ? "bg-foreground/15"
                      : "border border-border",
              )}
            />
            <span
              aria-hidden
              className={cn(
                "h-[2px] w-4 rounded-full",
                day.isToday ? "bg-primary" : "bg-transparent",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

function DayCard({
  cycle,
  day,
  priority,
}: {
  cycle: CycleState;
  day: ForecastDay;
  priority: Priority;
}) {
  const band = bandOf(day.loggedEnergy);
  const past = pastNotesFor(cycle, day.dayId, 1);

  return (
    <article className="surface rounded-2xl p-5">
      <header>
        <h3 className="text-[1.25rem] leading-tight font-medium">
          {formatDayWeekday(day.dayId)}
        </h3>
        <p className="tnum mt-0.5 text-[0.82rem] text-muted-foreground">
          {formatDayShort(day.dayId)}
          {day.cycleDay ? ` · Day ${day.cycleDay}` : ""}
        </p>
        {day.phase && (
          <p className="mt-1.5 text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
            {PHASE_META[day.phase].label}
          </p>
        )}
      </header>

      {/* Lines, not a number, and only for a day the user actually logged. */}
      <div className="mt-5 flex flex-col items-center gap-1.5">
        {band ? (
          <>
            <EnergyLines band={band} />
            <span
              className={cn(
                "text-[0.82rem] font-medium",
                band === "high" ? "text-primary" : "text-muted-foreground",
              )}
            >
              {ENERGY_BAND_LABELS[band]}
            </span>
          </>
        ) : (
          <>
            <span aria-hidden className="h-[2px] w-10 rounded-full border-t border-dashed border-border" />
            <span className="text-[0.82rem] text-muted-foreground">
              {day.offset > 0 ? "Not logged yet" : "Nothing logged"}
            </span>
          </>
        )}
      </div>

      <p className="display mt-5 text-[1.06rem] leading-[1.65] italic">
        {past.length > 0
          ? `Around this point in a past cycle, on ${formatDayShort(past[0].dayId)}, you logged ${summariseNote(past[0]).toLowerCase() || "a note"}.`
          : day.isPeriod
            ? "You logged a period covering this day."
            : "Nothing recorded around this point in a past cycle yet."}
      </p>

      <div className="mt-5">
        <p className="eyebrow">Your focus today</p>
        <p className="mt-1.5 text-[0.94rem] leading-snug">
          {priority.text.trim() || "Take one small thing off your plate."}
        </p>
      </div>

      {/* Questions, not instructions. Nothing here is chosen from a phase. */}
      <div className="mt-5 flex flex-wrap gap-2">
        {[SUPPORTIVE_PROMPTS[0], SUPPORTIVE_PROMPTS[3]].map((prompt) => (
          <span
            key={prompt}
            className="rounded-lg bg-muted px-2.5 py-1 text-[11px] text-foreground"
          >
            {prompt}
          </span>
        ))}
      </div>
    </article>
  );
}

function EnergyLines({ band }: { band: "low" | "medium" | "high" }) {
  const count = band === "low" ? 1 : band === "medium" ? 2 : 3;
  return (
    <span aria-hidden className="flex flex-col items-center gap-1">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={cn(
            "rounded-full",
            band === "high" ? "h-[3px] w-12 bg-primary" : "h-[2px] w-10 bg-foreground/35",
          )}
        />
      ))}
    </span>
  );
}
