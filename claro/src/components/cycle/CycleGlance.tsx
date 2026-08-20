import { CYCLE_LENGTH_NOTE, durationHistory, estimateNext, formatWeeksAndDays } from "@/lib/cycle";
import { estimatedWindow } from "@/lib/cycle-calendar";
import { BAND_LABELS, BAND_SHORT, CYCLE_BANDS, positionOn } from "@/lib/cycle-timeline";
import { NO_JUDGEMENT_NOTE } from "@/lib/cycle-guide";
import { formatDayDate, formatDayShort } from "@/lib/dates";
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
 *
 * Duration and cycle length are shown as two clearly separate readings, because
 * conflating them is the most common way both end up wrong.
 */
export function CycleGlance({ cycle, todayId }: { cycle: CycleState; todayId: ISODate }) {
  const estimate = estimateNext(cycle);
  const position = positionOn(cycle, todayId);
  const window = estimatedWindow(cycle);
  const history = durationHistory(cycle);

  return (
    <div className="surface p-5">
      {estimate ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              {/*
                Deliberately secondary. The loudest thing on this screen is the
                action to log a period, not a number Claro worked out.
              */}
              <p className="text-[1.1rem] leading-tight font-medium">
                {position ? `Day ${position.day}` : "Between logged starts"}
              </p>
              {position && (
                <p className="mt-1 text-[0.88rem] text-muted-foreground">
                  of about {position.ofAbout}, counted from {formatDayDate(position.since)}
                </p>
              )}
            </div>
            <div className="sm:text-right">
              <p className="text-[10px] text-muted-foreground">Next period, estimated</p>
              <p className="tnum text-[0.95rem]">
                {window && window.from !== window.to
                  ? `${formatDayShort(window.from)} to ${formatDayShort(window.to)}`
                  : formatDayDate(estimate.nextStart)}
              </p>
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
                <span
                  key={band}
                  className={cn("flex-1", position?.band === band && "text-foreground")}
                >
                  {BAND_SHORT[band]}
                </span>
              ))}
            </div>
            {position && <p className="mt-2 text-[0.85rem]">{BAND_LABELS[position.band]}</p>}
          </div>

          {/* The two numbers, deliberately labelled apart from each other. */}
          <dl className="mt-5 grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] text-muted-foreground">Your usual cycle length</dt>
              <dd className="mt-0.5 text-[0.9rem]">
                <span className="tnum">{formatWeeksAndDays(estimate.typicalGap)}</span>
                <span className="tnum text-muted-foreground"> ({estimate.typicalGap} days)</span>
              </dd>
              <dd className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Your own median across {estimate.basedOn} recorded{" "}
                {estimate.basedOn === 1 ? "gap" : "gaps"}.
              </dd>
            </div>

            <div>
              <dt className="text-[10px] text-muted-foreground">How long your periods lasted</dt>
              {history ? (
                <>
                  <dd className="mt-0.5 text-[0.9rem]">
                    Your last period lasted <span className="tnum">{history.last}</span>{" "}
                    {history.last === 1 ? "day" : "days"}.
                  </dd>
                  <dd className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {history.of === 1
                      ? "From the one period you have recorded start to end."
                      : history.min === history.max
                        ? `Your recorded durations have all been ${history.min} ${history.min === 1 ? "day" : "days"}, across ${history.of} periods.`
                        : `Your recorded durations vary from ${history.min} to ${history.max} days, across ${history.of} periods.`}
                  </dd>
                </>
              ) : (
                <dd className="mt-0.5 text-[0.85rem] leading-relaxed text-muted-foreground">
                  Nothing yet. Add an end date to a period and its length appears here.
                </dd>
              )}
            </div>
          </dl>

          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
            {CYCLE_LENGTH_NOTE} {NO_JUDGEMENT_NOTE}
          </p>
        </>
      ) : (
        <>
          <p className="text-[0.92rem] leading-relaxed">
            Not enough of your own history yet for a timeline.
          </p>
          <p className="mt-1.5 text-[0.85rem] leading-relaxed text-muted-foreground">
            Log a few periods and Claro can work out a typical gap from the dates you recorded.
          </p>
          {history && (
            <p className="mt-3 text-[0.88rem] leading-relaxed">
              Your last period lasted <span className="tnum">{history.last}</span>{" "}
              {history.last === 1 ? "day" : "days"}.
            </p>
          )}
        </>
      )}

      <p className="mt-4 rounded-md bg-muted/60 px-3 py-2.5 text-[0.8rem] leading-relaxed text-muted-foreground">
        Based on your own recorded dates. This is an estimate, not medical advice. Bodies and cycles
        vary, and Claro does not diagnose anything, predict fertility, or judge what you are capable
        of.
      </p>
    </div>
  );
}
