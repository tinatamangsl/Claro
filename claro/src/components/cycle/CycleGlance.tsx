import { durationHistory, estimateNext, ongoingPeriod, durationOf } from "@/lib/cycle";
import { estimatedWindow } from "@/lib/cycle-calendar";
import { CYCLE_PHASES, PHASE_META } from "@/lib/cycle-phases";
import { positionOn } from "@/lib/cycle-timeline";
import { formatDayShort } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { CycleState, ISODate } from "@/lib/types";

/**
 * Where you are, in one strip above the calendar.
 *
 * This used to be a full card carrying the day, the phase, the cycle length,
 * the recorded durations and two paragraphs of caveat, and it sat between the
 * user and the calendar. Most of it was already visible in the grid below or in
 * the Numbers tab, so it pushed the thing people open this page for two and a
 * half screens down in order to repeat what that thing already showed.
 *
 * What is left is the part the calendar cannot say in a glance: which day of
 * the cycle today is, which phase that falls in, and when the next period is
 * estimated. Everything else moved to where it was already duplicated.
 */
export function CycleGlance({ cycle, todayId }: { cycle: CycleState; todayId: ISODate }) {
  const estimate = estimateNext(cycle);
  const position = positionOn(cycle, todayId);
  const window = estimatedWindow(cycle);
  const history = durationHistory(cycle);
  const ongoing = ongoingPeriod(cycle);

  if (!estimate) {
    return (
      <div className="surface p-4">
        <p className="text-[0.92rem] leading-relaxed">Not enough of your own history yet.</p>
        <p className="mt-1 text-[0.85rem] leading-relaxed text-muted-foreground">
          Log a period below, or tell Claro your usual cycle length under Numbers.
        </p>
        {history && (
          <p className="mt-2 text-[0.85rem]">
            Your last period lasted <span className="tnum">{history.last}</span>{" "}
            {history.last === 1 ? "day" : "days"}.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[1.05rem] leading-tight font-medium">
          {ongoing ? (
            <>
              Day <span className="tnum">{durationOf(cycle, ongoing, todayId)}</span> of your period
            </>
          ) : position ? (
            <>
              Day <span className="tnum">{position.day}</span>
              <span className="text-muted-foreground"> of about {position.ofAbout}</span>
            </>
          ) : (
            "Between logged starts"
          )}
        </p>

        {window && (
          <p className="tnum text-[0.85rem] text-muted-foreground">
            Next period{" "}
            {window.from === window.to
              ? formatDayShort(window.from)
              : `${formatDayShort(window.from)} to ${formatDayShort(window.to)}`}
          </p>
        )}
      </div>

      {/* The four phases, as the thinnest possible read of where today sits. */}
      <div className="mt-3">
        <div aria-hidden className="flex gap-1">
          {CYCLE_PHASES.map((phase) => (
            <span
              key={phase}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                position?.phase === phase ? `phase-key-${phase}` : "bg-border",
              )}
            />
          ))}
        </div>
        {position && (
          <p className="mt-1.5 text-[0.85rem]">
            {PHASE_META[position.phase].label}
            <span className="text-[11px] text-muted-foreground">
              {" "}
              estimated, from your own dates
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
