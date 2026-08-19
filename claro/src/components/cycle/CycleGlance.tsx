import { BAND_LABELS, BAND_SHORT, CYCLE_BANDS, positionOn } from "@/lib/cycle-timeline";
import { estimateNext } from "@/lib/cycle";
import { formatDayDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { CycleState, ISODate } from "@/lib/types";

/**
 * Cycle at a glance.
 *
 * The band labels say where a day sits in the user's own estimated cycle, not
 * what is supposedly happening in their body. That distinction is deliberate:
 * a positional label is arithmetic on dates the user typed, and can be stated
 * honestly. A physiological one would be a claim Claro has no basis to make,
 * and one of the usual labels is a fertility prediction.
 */
export function CycleGlance({ cycle, todayId }: { cycle: CycleState; todayId: ISODate }) {
  const estimate = estimateNext(cycle);
  const position = positionOn(cycle, todayId);

  if (!estimate) {
    return (
      <div className="surface p-5">
        <p className="text-[0.92rem] leading-relaxed">
          Not enough of your own history yet for a timeline.
        </p>
        <p className="mt-1.5 text-[0.85rem] leading-relaxed text-muted-foreground">
          Log a few starts and Claro can work out a typical gap from the dates you recorded.
        </p>
      </div>
    );
  }

  return (
    <div className="surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="display text-[1.6rem] leading-tight">
            {position ? `Day ${position.day}` : "Between logged starts"}
          </p>
          {position && (
            <p className="mt-1 text-[0.88rem] text-muted-foreground">
              of about {position.ofAbout}, counted from {formatDayDate(position.since)}
            </p>
          )}
        </div>
        <div className="sm:text-right">
          <p className="text-[10px] text-muted-foreground">Next start, estimated</p>
          <p className="tnum text-[0.95rem]">{formatDayDate(estimate.nextStart)}</p>
        </div>
      </div>

      {/* Three equal bands of the user's own estimated length. */}
      <div className="mt-5">
        <div aria-hidden className="flex gap-1">
          {CYCLE_BANDS.map((band) => (
            <span
              key={band}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                position?.band === band ? "bg-gold" : "bg-border",
              )}
            />
          ))}
        </div>
        <div className="mt-1.5 flex gap-1 text-[10px] text-muted-foreground">
          {CYCLE_BANDS.map((band) => (
            <span key={band} className={cn("flex-1", position?.band === band && "text-foreground")}>
              {BAND_SHORT[band]}
            </span>
          ))}
        </div>
        {position && <p className="mt-2 text-[0.85rem]">{BAND_LABELS[position.band]}</p>}
      </div>

      <p className="mt-4 rounded-md bg-muted/60 px-3 py-2.5 text-[0.8rem] leading-relaxed text-muted-foreground">
        This timeline is worked out only from the dates you logged. It is an estimate, not medical
        information. Bodies and cycles vary, and Claro does not diagnose anything, predict
        fertility, or judge what you are capable of.
      </p>
    </div>
  );
}
