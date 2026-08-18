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
  className,
  autoFocus,
  dense,
}: Props) {
  return (
    <div
      className={cn("group flex items-center gap-2.5", dense ? "py-0.5" : "py-1", className)}
    >
      <CheckToggle checked={done} onChange={onToggle} label={`Complete ${label}`} size="sm" />
      <EditableText
        value={text}
        onCommit={onCommit}
        placeholder={placeholder}
        ariaLabel={label}
        autoFocus={autoFocus}
        className={cn(
          "flex-1 leading-snug",
          dense ? "text-[0.82rem]" : "text-[0.9rem]",
          done && "strike-done text-muted-foreground",
        )}
      />
      {trailing}
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${label}`}
        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
