import { useState } from "react";

import { checkInOn } from "@/lib/cycle";
import { bandOf } from "@/lib/cycle-log";
import {
  ENERGY_LABELS,
  ENERGY_LEVELS,
  MOOD_FACE_META,
  type CycleState,
  type EnergyLevel,
  type ISODate,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Today's energy, in one tap, at the top of the page.
 *
 * The full log sits below the guidance cards, which made it the fourth thing on
 * the page and invisible on a phone. This is the one reading everything else
 * keys off, so it comes first and costs a single tap: the guidance cards below
 * re-key to it the moment it is set, which is the whole reason they are keyed
 * to energy rather than to the phase alone.
 *
 * It is not a second store. It writes the same `energy` on the same check-in
 * the full form writes, so the two can never disagree about today.
 */
export function QuickEnergy({
  cycle,
  todayId,
  onWrite,
  onOpenLog,
}: {
  cycle: CycleState;
  todayId: ISODate;
  onWrite: (energy: EnergyLevel | null) => void;
  onOpenLog: () => void;
}) {
  const note = checkInOn(cycle, todayId);
  /*
   * Reopened by the reader, not derived. Once an energy is logged the row
   * collapses to what it says, and "change" brings the chips back without
   * sending anybody to the form below for a one tap correction.
   */
  const [editing, setEditing] = useState(false);
  const settled = note.energy !== null && !editing;

  if (settled) {
    return (
      <section className="surface flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <p className="text-[0.88rem]">
          <span className="text-muted-foreground">Logged today</span>
          <span aria-hidden className="px-1.5 text-muted-foreground">·</span>
          {ENERGY_LABELS[note.energy as EnergyLevel].toLowerCase()} energy
          {note.mood && `, ${MOOD_FACE_META[note.mood].label.toLowerCase()}`}
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[0.82rem] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Change
          </button>
          <button
            type="button"
            onClick={onOpenLog}
            className="text-[0.82rem] text-primary underline-offset-2 hover:underline"
          >
            Full log
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="surface px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="eyebrow">Energy today</h2>
        <button
          type="button"
          onClick={onOpenLog}
          className="text-[0.82rem] text-primary underline-offset-2 hover:underline"
        >
          Log today
        </button>
      </div>

      <div
        role="group"
        aria-label="Energy today"
        className="mt-2 grid grid-cols-5 gap-1.5"
      >
        {ENERGY_LEVELS.map((level) => {
          const chosen = note.energy === level;
          return (
            <button
              key={level}
              type="button"
              aria-pressed={chosen}
              aria-label={`Energy ${ENERGY_LABELS[level].toLowerCase()}`}
              onClick={() => {
                // Tapping the chosen one again clears it: the way out of a
                // mis-tap is the same control, not a separate undo.
                onWrite(chosen ? null : level);
                setEditing(false);
              }}
              className={cn(
                "energy-chip",
                chosen ? "energy-chip-on" : "energy-chip-off",
              )}
            >
              {ENERGY_LABELS[level]}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Read by the guidance cards, so one helper answers "what did they say today?" */
export const energyBandToday = (cycle: CycleState, todayId: ISODate) =>
  bandOf(checkInOn(cycle, todayId).energy);
