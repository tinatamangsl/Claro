import { Link } from "@tanstack/react-router";
import { NotebookPen } from "lucide-react";

import { useClaro } from "@/lib/claro-store";
import { checkInOn } from "@/lib/cycle";
import { isLogged } from "@/lib/cycle-log";
import { cn } from "@/lib/utils";

/**
 * The one way into cycle from a planning screen.
 *
 * There used to be several, each looking different: a text link on Daily, a
 * second differently-worded prompt beside it, a card on Week and a button on
 * Calendar. Four doors into one room is how a person stops being able to
 * picture where anything lives, so there is now one affordance and every screen
 * uses it.
 *
 * **It points at the log, not the hub.** The daily entry is the thing done
 * daily; sending somebody to a five-screen index first put the most frequent
 * action three clicks deep. Once today is logged it points at the hub instead,
 * because there is nothing left to log.
 *
 * It is a link and nothing more. Opening it lets the user look and decide for
 * themselves; no priority, habit, schedule, goal, focus length or sound is ever
 * changed because of what is in there.
 */
export function CycleLink({ className }: { className?: string }) {
  const { cycle, today } = useClaro();
  if (!cycle.settings.enabled) return null;

  const logged = isLogged(checkInOn(cycle, today));

  return (
    <Link
      to={logged ? "/cycle" : "/cycle-day"}
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline",
        className,
      )}
    >
      <NotebookPen aria-hidden className="h-3 w-3" />
      {logged ? "My cycle notes" : "Log today's cycle note"}
    </Link>
  );
}
