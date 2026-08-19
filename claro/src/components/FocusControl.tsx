import { Link } from "@tanstack/react-router";
import { Timer } from "lucide-react";

import { useFocusSession } from "@/hooks/use-focus-session";
import { formatRemaining, mainElapsedMs } from "@/lib/focus-session";
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
  const elapsed = live ? (now ? mainElapsedMs(live, now) : live.elapsedBeforeMs) : 0;
  const left = live ? Math.max(0, live.plannedMs - elapsed) : 0;

  return (
    <Link
      to="/today"
      search={{ focus: true }}
      aria-label={
        live
          ? `Resume focus, ${formatRemaining(left)} left on ${live.target?.title || "this block"}`
          : "Start a focus block"
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
