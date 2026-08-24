import { Lock } from "lucide-react";

import { CycleLink } from "@/components/cycle/CycleLink";
import { useState } from "react";

import { useClaro } from "@/lib/claro-store";
import { addPeriod, describeRefusal, durationOf, ongoingPeriod, endPeriod } from "@/lib/cycle";
import { estimatedWindow } from "@/lib/cycle-calendar";
import { positionOn } from "@/lib/cycle-timeline";
import { PHASE_META } from "@/lib/cycle-phases";
import { formatDayShort } from "@/lib/dates";
import { newId } from "@/lib/id";
import { cn } from "@/lib/utils";

/**
 * Cycle context on the weekly page: small, private, and inert.
 *
 * It reports where the week sits against the user's own dates and offers one
 * action. It changes no weekly goal, no schedule, no habit, no focus session
 * and no priority, and it never proposes one. The only prompt is a question the
 * user answers for themselves.
 *
 * Renders nothing at all until cycle notes are explicitly turned on.
 */
export function CycleWeekCard({ className }: { className?: string }) {
  const { today, cycle, setCycleEntries } = useClaro();
  const [refusal, setRefusal] = useState<string | null>(null);

  if (!cycle.settings.enabled) return null;

  const position = positionOn(cycle, today);
  const window = estimatedWindow(cycle);
  const ongoing = ongoingPeriod(cycle);

  const log = () => {
    const result = addPeriod(cycle, { startDate: today, endDate: null }, newId(), new Date(), today);
    if (!result.ok) {
      setRefusal(describeRefusal(result, cycle, today));
      return;
    }
    setCycleEntries(result.entries);
    setRefusal(null);
  };

  const close = () => {
    if (!ongoing) return;
    const result = endPeriod(cycle, ongoing.id, today, today);
    if (!result.ok) {
      setRefusal(describeRefusal(result, cycle, today));
      return;
    }
    setCycleEntries(result.entries);
    setRefusal(null);
  };

  return (
    <section className={cn("surface-quiet p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className="eyebrow flex items-center gap-1.5">
          <Lock aria-hidden className="h-3 w-3" />
          Cycle notes
        </h2>
        <CycleLink />
      </div>

      <div className="mt-2.5 space-y-1">
        {ongoing ? (
          <p className="text-[0.88rem] leading-relaxed">
            A period is logged as ongoing since {formatDayShort(ongoing.startDate)}.{" "}
            <span className="tnum">{durationOf(cycle, ongoing, today)}</span> days so far.
          </p>
        ) : position ? (
          <p className="text-[0.88rem] leading-relaxed">
            Day <span className="tnum">{position.day}</span> of about{" "}
            <span className="tnum">{position.ofAbout}</span>. {PHASE_META[position.phase].label}, estimated.
          </p>
        ) : (
          <p className="text-[0.88rem] leading-relaxed text-muted-foreground">
            Not enough of your own history yet for an estimate.
          </p>
        )}

        {window && !ongoing && (
          <p className="tnum text-[11px] text-muted-foreground">
            Next period estimated{" "}
            {window.from === window.to
              ? `around ${formatDayShort(window.from)}`
              : `${formatDayShort(window.from)} to ${formatDayShort(window.to)}`}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {ongoing ? (
          <button type="button" onClick={close} className="btn btn-sm btn-quiet">
            It ended today
          </button>
        ) : (
          <button type="button" onClick={log} className="btn btn-sm btn-quiet">
            Log start
          </button>
        )}
      </div>

      {refusal && (
        <p role="alert" className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {refusal}
        </p>
      )}

      <p className="mt-3 border-t border-border/70 pt-2.5 text-[11px] leading-relaxed text-muted-foreground">
        How would you like to plan this week? Claro changes nothing here on its own. This is an
        estimate from your own dates, not medical advice.
      </p>
    </section>
  );
}
