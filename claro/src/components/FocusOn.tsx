import { useNavigate } from "@tanstack/react-router";
import { Timer } from "lucide-react";

import { useFocusSession } from "@/hooks/use-focus-session";
import { FOCUS_BLOCK_MS, type FocusTargetRef } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * "Give this a block", from anywhere in the hierarchy.
 *
 * Every one of these starts or replaces the same canonical session — there is
 * one `activeFocusSessionId` in the store, so a second timer has nowhere to
 * live. Starting a block never marks the goal it points at as done.
 */
export function FocusOn({
  target,
  className,
  compact,
}: {
  target: FocusTargetRef;
  className?: string;
  compact?: boolean;
}) {
  const { start } = useFocusSession();
  const navigate = useNavigate();

  if (!target.title.trim()) return null;

  return (
    <button
      type="button"
      aria-label={`Focus on ${target.title}`}
      onClick={() => {
        start(target, FOCUS_BLOCK_MS);
        navigate({ to: "/today", search: { focus: true } });
      }}
      className={cn(
        compact
          ? "inline-flex items-center gap-1 text-[10px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          : "btn btn-sm btn-quiet gap-1.5",
        className,
      )}
    >
      <Timer aria-hidden className="h-3 w-3" />
      Focus
    </button>
  );
}
