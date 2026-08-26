import { CYCLE_PHASES, PHASE_META } from "@/lib/cycle-phases";
import { cn } from "@/lib/utils";

/**
 * The key for the phase washes.
 *
 * The caveat travels with it rather than sitting once at the bottom of the
 * page, because a colour on a calendar reads as a fact and this one is not.
 */
export function PhaseLegend({ className }: { className?: string }) {
  return (
    <div className={cn("border-t border-border/70 pt-3", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
        {CYCLE_PHASES.map((phase) => (
          <span key={phase} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", `phase-key-${phase}`)} />
            {PHASE_META[phase].label}
          </span>
        ))}
      </div>
      {/* The full statement lives once at the foot of the page. */}
      <p className="mt-2 text-[10px] text-muted-foreground">
        Estimated. Fainter means further ahead.
      </p>
    </div>
  );
}
