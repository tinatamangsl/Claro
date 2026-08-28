import { CYCLE_PHASES, PHASE_META, type CyclePhase } from "@/lib/cycle-phases";
import { cn } from "@/lib/utils";

/**
 * The cycle as a ring, with one stretch picked out.
 *
 * Proportions, not predictions. Each arc is sized by the share of a typical
 * cycle the phase covers in Claro's own division, and the ring carries no dates
 * and no day numbers for that reason: it is a diagram of what the four words
 * mean, not a reading of anybody's month. A ring that showed "you are here"
 * would be asserting a position from an estimate, which is what the calendar on
 * `/cycle` already does honestly, with the caveat attached.
 *
 * Selection is carried by opacity alone. A thicker arc for the selected phase
 * changed the ring's proportions as the reader moved between phases, which is
 * the one thing a diagram of proportions must not do.
 *
 * The unselected arcs stay visible rather than dropping out. The point of the
 * shape is that the four are one continuous loop, and hiding three of them
 * would turn a cycle into four unrelated bars.
 */

/** Share of the ring each phase takes. Ordering follows `CYCLE_PHASES`. */
const SHARE: Record<CyclePhase, number> = {
  menstrual: 5 / 28,
  follicular: 8 / 28,
  ovulation: 2 / 28,
  luteal: 13 / 28,
};

const SIZE = 240;
const R = 96;
const STROKE = 20;
/*
 * The gap between arcs, as a fraction of the circumference.
 *
 * It has to clear the round caps, not just look like a gap. A round cap adds
 * half the stroke width at each end, so two neighbours with a gap narrower than
 * one stroke width overlap into a dark bead at the join. At r=96 the
 * circumference is about 603, so a 20px stroke needs roughly 0.033 to clear,
 * and this leaves a little air on top of that. The ovulation arc is the reason
 * to care: it is the shortest by far, and at a smaller gap the caps ate it.
 */
const GAP = 0.045;

export function PhaseRing({
  selected,
  ordinal,
  name,
  span,
}: {
  selected: CyclePhase;
  /** "Phase one", spelled out: a numeral here reads as a day of the cycle. */
  ordinal: string;
  name: string;
  span: string;
}) {
  const circumference = 2 * Math.PI * R;
  let at = -0.25; // Start at twelve o'clock rather than three.

  const arcs = CYCLE_PHASES.map((phase) => {
    const share = SHARE[phase];
    const arc = { phase, from: at, length: share };
    at += share;
    return arc;
  });

  return (
    <div className="relative mx-auto w-full max-w-[20rem]">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="block w-full" aria-hidden>
        {arcs.map(({ phase, from, length }) => {
          const visible = Math.max(length - GAP, 0.004) * circumference;
          return (
            <circle
              key={phase}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${visible} ${circumference - visible}`}
              strokeDashoffset={-from * circumference}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              className={cn(
                `phase-arc-${phase}`,
                "transition-all duration-300",
                phase === selected ? "opacity-100" : "opacity-35",
              )}
            />
          );
        })}
      </svg>

      {/*
        The label is real text over the ring rather than <text> inside it: the
        viewBox scales with the column, and type in it would scale with it.
      */}
      <div className="absolute inset-0 grid place-items-center px-10 text-center">
        <div>
          <p className="eyebrow">{ordinal}</p>
          {/*
            A real heading, and the only one in the explorer. The phase names
            used to be four <h3>s down a column; now one card shows at a time,
            so there is one heading and it changes with the selection.
          */}
          <h3 className="display mt-1 text-[1.5rem] leading-tight">{name}</h3>
          <p className="mt-1 text-[0.78rem] leading-snug text-muted-foreground">{span}</p>
        </div>
      </div>
    </div>
  );
}

/** Exported so the page and the ring cannot disagree about the order. */
export const PHASE_ORDINALS = ["Phase one", "Phase two", "Phase three", "Phase four"];
export const RING_PHASES = CYCLE_PHASES;
export { PHASE_META };
