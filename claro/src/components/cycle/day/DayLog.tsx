import { useEffect, useRef, useState } from "react";

import { bandOf, levelForBand, ENERGY_BANDS, ENERGY_BAND_LABELS } from "@/lib/cycle-log";
import { BAND_LABELS, positionOn } from "@/lib/cycle-timeline";
import { cn } from "@/lib/utils";
import { FEELINGS, FEELING_META, type CycleCheckIn, type CycleState, type Feeling, type ISODate } from "@/lib/types";

/** Long enough to read the line, short enough not to be a wait. */
const CONFIRM_MS = 1500;

type Props = {
  cycle: CycleState;
  todayId: ISODate;
  note: CycleCheckIn;
  onWrite: (patch: Partial<CycleCheckIn>) => void;
  onDone: () => void;
};

/**
 * The morning log. Three taps on a good day.
 *
 * The line under the date says where today sits in the user's *own* estimated
 * cycle, and says it positionally. A physiological name here would be Claro
 * asserting what is happening inside somebody from a calendar, which it cannot
 * know and must not imply.
 *
 * Nothing on this screen predicts anything, and nothing it records changes a
 * plan. Every control writes one field and stops.
 */
export function DayLog({ cycle, todayId, note, onWrite, onDone }: Props) {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const log = () => {
    setSaved(true);
    timer.current = setTimeout(onDone, CONFIRM_MS);
  };

  if (saved) {
    return (
      <div
        role="status"
        className="flex min-h-[60vh] items-center justify-center px-6 text-center"
      >
        <p className="display text-[1.5rem] leading-snug italic">
          logged. here is what your own notes show.
        </p>
      </div>
    );
  }

  const position = positionOn(cycle, todayId);
  const band = bandOf(note.energy);

  return (
    <div className="space-y-7">
      <header>
        <p className="text-[0.82rem] text-muted-foreground">
          {position ? `Day ${position.day} of your cycle` : "Not enough logged dates for a day count"}
        </p>
        {position && (
          <p className="display mt-0.5 text-[0.95rem] italic text-foreground/80">
            {BAND_LABELS[position.band]}
          </p>
        )}
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          An estimate from the dates you entered, not medical information.
        </p>
      </header>

      <section>
        <h2 className="eyebrow">Energy today</h2>
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {ENERGY_BANDS.map((option) => {
            const selected = band === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  onWrite({ energy: selected ? null : levelForBand(option, note.energy) })
                }
                className={cn(
                  "h-14 rounded-lg text-[0.92rem] font-medium transition-colors",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {ENERGY_BAND_LABELS[option]}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="eyebrow">How I feel</h2>
        <div className="mt-2.5 grid grid-cols-3 gap-3">
          {FEELINGS.map((feeling) => {
            const selected = note.feeling === feeling;
            return (
              <button
                key={feeling}
                type="button"
                aria-pressed={selected}
                onClick={() => onWrite({ feeling: selected ? null : (feeling as Feeling) })}
                className={cn(
                  "flex h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-[0.8rem] transition-colors",
                  selected ? "bg-foreground text-background" : "bg-muted text-foreground",
                )}
              >
                <span aria-hidden className="text-[0.95rem] leading-none">
                  {FEELING_META[feeling].emoji}
                </span>
                {FEELING_META[feeling].label}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-baseline gap-1.5">
          <h2 className="eyebrow">Anything notable</h2>
          <span className="text-[10px] font-normal text-muted-foreground/80">(optional)</span>
        </div>
        <input
          type="text"
          value={note.note}
          aria-label="Anything notable about today"
          placeholder="pain, mood, sleep, cravings…"
          onChange={(e) => onWrite({ note: e.target.value })}
          className="mt-2 w-full border-b border-border bg-transparent pb-2 text-[0.9rem] outline-none placeholder:text-muted-foreground/70 focus:border-foreground/40"
        />
      </section>

      <section>
        <button
          type="button"
          onClick={log}
          className="h-[52px] w-full rounded-xl bg-primary text-[0.95rem] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          log it
        </button>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          takes 3 taps on a good day
        </p>
      </section>
    </div>
  );
}
