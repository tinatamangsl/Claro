import { Link } from "@tanstack/react-router";

import { PhaseInsight } from "@/components/cycle/PhaseInsight";
import { QuickEnergy } from "@/components/cycle/QuickEnergy";
import { useClaro } from "@/lib/claro-store";

/**
 * Cycle, usable from Daily rather than only linked from it.
 *
 * Daily used to carry two links away and nothing else: a text link, and a
 * dismissible strip asking whether you would like to adjust the plan. Both sent
 * you somewhere else to do anything at all, which made the thing done every day
 * the thing furthest from the page it belongs on.
 *
 * This is the same card the cycle page leads with and the same energy row,
 * imported rather than reimplemented, so there is one definition of what today
 * looks like and no chance of two screens disagreeing about it.
 *
 * **It appears only once cycle notes are turned on.** Somebody who has not
 * opted in sees nothing here, exactly as before.
 *
 * It reads and it writes energy, and it does nothing else. No priority, action,
 * habit, schedule entry, goal, focus length or sound changes because of what is
 * in here, which is the standing rule for this feature and is the reason it can
 * sit beside a plan at all.
 */
export function CycleToday() {
  const { cycle, today, writeCycleCheckIn } = useClaro();
  if (!cycle.settings.enabled) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="eyebrow">Your cycle</h2>
          <span className="text-[10px] text-muted-foreground">private to you</span>
        </div>
        <Link
          to="/cycle"
          className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Open
        </Link>
      </div>

      <div className="mt-2">
        <PhaseInsight cycle={cycle} todayId={today}>
          <QuickEnergy
            cycle={cycle}
            todayId={today}
            onWrite={(energy) => writeCycleCheckIn(today, { energy }, new Date())}
          />
        </PhaseInsight>
      </div>
    </section>
  );
}
