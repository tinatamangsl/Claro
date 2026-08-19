import { Check } from "lucide-react";

import { PLAN_STAGES, STAGE_META, stageProgress, type PlanStage } from "@/lib/quarter-plan";
import { cn } from "@/lib/utils";
import type { Quarter } from "@/lib/types";

/**
 * Where you are, and where you have been.
 *
 * Every stage is reachable at any time: this is a sequence, not a gate. The
 * counts say what has been answered so far and nothing more, so leaving a
 * question blank costs nothing.
 */
export function PlanStepper({
  quarter,
  stage,
  onGo,
}: {
  quarter: Quarter;
  stage: PlanStage;
  onGo: (stage: PlanStage) => void;
}) {
  return (
    <nav aria-label="Planning stages" className="flex flex-wrap gap-2">
      {PLAN_STAGES.map((option, index) => {
        const progress = stageProgress(quarter, option);
        const complete = progress.answered === progress.of;
        const active = option === stage;

        return (
          <button
            key={option}
            type="button"
            onClick={() => onGo(option)}
            aria-current={active ? "step" : undefined}
            className={cn(
              "surface flex min-w-0 flex-1 items-start gap-2.5 px-3 py-2.5 text-left transition-colors sm:flex-none sm:basis-[calc(25%-0.375rem)]",
              active ? "border-gold/60 bg-gold/8" : "hover:border-foreground/35",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[10px]",
                complete
                  ? "border-positive bg-positive text-white"
                  : active
                    ? "border-gold text-foreground"
                    : "border-border text-muted-foreground",
              )}
            >
              {complete ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[0.82rem] leading-snug">
                {STAGE_META[option].label}
              </span>
              <span className="tnum block text-[10px] text-muted-foreground">
                {option === "review"
                  ? complete
                    ? "Settled"
                    : "Not settled yet"
                  : `${progress.answered} of ${progress.of}`}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
