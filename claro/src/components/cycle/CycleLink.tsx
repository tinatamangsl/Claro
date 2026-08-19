import { Link } from "@tanstack/react-router";
import { NotebookPen } from "lucide-react";

import { useClaro } from "@/lib/claro-store";
import { cn } from "@/lib/utils";

/**
 * A quiet way into the private notes, offered on the planning screens.
 *
 * It is a link and nothing more. Opening it lets the user look and decide for
 * themselves; no priority, habit, schedule, goal, focus length or sound is ever
 * changed because of what is in there.
 */
export function CycleLink({ className }: { className?: string }) {
  const { cycle } = useClaro();
  if (!cycle.settings.enabled) return null;

  return (
    <Link
      to="/cycle"
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline",
        className,
      )}
    >
      <NotebookPen aria-hidden className="h-3 w-3" />
      Check my Cycle Notes
    </Link>
  );
}
