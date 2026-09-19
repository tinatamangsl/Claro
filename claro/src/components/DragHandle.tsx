import { GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  dragging?: boolean;
  /**
   * Pad the press area out to roughly a finger's width without growing the
   * grip itself. The dots stay 14px so a dense list is not a column of grab
   * bars, while the thing you can actually hit stops being under half the
   * 44px a touch target is usually given.
   */
  hitArea?: boolean;
};

/**
 * The one grab point for reordering. It is a real button, so it is reachable by
 * keyboard and carries its own instructions — the row's text field is never
 * draggable, which keeps selecting and editing text working normally.
 */
export function DragHandle({ dragging, hitArea, className, ...props }: Props) {
  return (
    <button
      {...props}
      className={cn(
        "grid shrink-0 cursor-grab place-items-center rounded p-0.5 text-muted-foreground/60 transition-colors",
        "hover:text-foreground focus-visible:text-foreground",
        // Present at all times for keyboard and touch; it only gains contrast on hover.
        "opacity-45 focus-visible:opacity-100 group-hover:opacity-100",
        dragging && "cursor-grabbing text-foreground opacity-100",
        // Negative margin keeps the layout identical while the button itself
        // grows, so nothing beside it shifts.
        hitArea && "-m-[13px] p-[13px]",
        className,
      )}
    >
      <GripVertical aria-hidden className="h-3.5 w-3.5" />
    </button>
  );
}
