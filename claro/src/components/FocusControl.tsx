import { Link } from "@tanstack/react-router";
import { Timer } from "lucide-react";

import { useFocusSession } from "@/hooks/use-focus-session";
import { breakRemainingMs, formatRemaining, mainElapsedMs } from "@/lib/focus-session";
import { cn } from "@/lib/utils";

/**
 * The global focus control, in the header on every route.
 *
 * It reads the one canonical session, so it shows the same block whichever page
 * you are on, and "Resume" returns to that block rather than starting another.
 */
export function FocusControl({ className }: { className?: string }) {
  const { session, now, isLive } = useFocusSession();

  const live = isLive ? session : null;
  // A break is a different clock from the block, and the header must not report
  // the block still draining while somebody is away from the desk.
  const onBreak = live?.phase === "break";
  const elapsed = live ? (now ? mainElapsedMs(live, now) : live.elapsedBeforeMs) : 0;
  const left = !live
    ? 0
    : onBreak
      ? now
        ? breakRemainingMs(live, now)
        : live.breakMs
      : Math.max(0, live.plannedMs - elapsed);

  return (
    <Link
      to="/today"
      search={{ focus: true }}
      aria-label={
        !live
          ? "Start a focus block"
          : onBreak
            ? `On a break, ${formatRemaining(left)} left`
            : `Resume focus, ${formatRemaining(left)} left on ${live.target?.title || "this block"}`
      }
      className={cn(
        "btn btn-sm gap-1.5",
        live ? "btn-quiet border-gold/50" : "btn-ghost",
        className,
      )}
    >
      <Timer aria-hidden className={cn("h-3.5 w-3.5", live && "text-gold")} />
      {live ? (
        <span className="tnum">{formatRemaining(left)}</span>
      ) : (
        <span className="hidden sm:inline">Focus</span>
      )}
    </Link>
  );
}
