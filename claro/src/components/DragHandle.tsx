import { GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  dragging?: boolean;
};

/**
 * The one grab point for reordering. It is a real button, so it is reachable by
 * keyboard and carries its own instructions — the row's text field is never
 * draggable, which keeps selecting and editing text working normally.
 */
export function DragHandle({ dragging, className, ...props }: Props) {
  return (
    <button
      {...props}
      className={cn(
        "grid shrink-0 cursor-grab place-items-center rounded p-0.5 text-muted-foreground/60 transition-colors",
        "hover:text-foreground focus-visible:text-foreground",
        // Present at all times for keyboard and touch; it only gains contrast on hover.
        "opacity-45 focus-visible:opacity-100 group-hover:opacity-100",
        dragging && "cursor-grabbing text-foreground opacity-100",
        className,
      )}
    >
      <GripVertical aria-hidden className="h-3.5 w-3.5" />
    </button>
  );
}
