import { X } from "lucide-react";
import type { ReactNode } from "react";

import { CheckToggle } from "@/components/CheckToggle";
import { EditableText } from "@/components/EditableText";
import { cn } from "@/lib/utils";

type Props = {
  text: string;
  done: boolean;
  onToggle: () => void;
  onCommit: (value: string) => void;
  onDelete: () => void;
  label: string;
  placeholder?: string;
  /** Extra controls rendered before the delete button, e.g. a bucket switcher. */
  trailing?: ReactNode;
  /** The reorder grip, when the row belongs to a sortable list. */
  handle?: ReactNode;
  dragging?: boolean;
  className?: string;
  autoFocus?: boolean;
  /** Tighter type and padding, for the columns on Today's spread. */
  dense?: boolean;
};

/** One editable, completable, deletable line. Used by every list in Claro. */
export function ItemRow({
  text,
  done,
  onToggle,
  onCommit,
  onDelete,
  label,
  placeholder,
  trailing,
  handle,
  dragging,
  className,
  autoFocus,
  dense,
}: Props) {
  return (
    <div
      className={cn(
        "group flex items-start gap-2 rounded-md",
        dense ? "py-0.5" : "py-1",
        dragging && "bg-card/80 shadow-[0_8px_24px_-12px_hsl(30_22%_8%/0.3)]",
        className,
      )}
    >
      {handle}
      <span className="pt-1">
        <CheckToggle checked={done} onChange={onToggle} label={`Complete ${label}`} size="sm" />
      </span>
      <EditableText
        value={text}
        onCommit={onCommit}
        placeholder={placeholder}
        ariaLabel={label}
        autoFocus={autoFocus}
        wrap
        className={cn(
          "min-w-0 flex-1 py-0.5 leading-snug",
          dense ? "text-[0.82rem]" : "text-[0.9rem]",
          done && "strike-done text-muted-foreground",
        )}
      />
      <span className="flex shrink-0 items-center pt-0.5">{trailing}</span>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${label}`}
        className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
