import { Plus } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

type Props = {
  onAdd: (text: string) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  disabledHint?: string;
  className?: string;
};

/** A quiet "+ Add" affordance that becomes an input on click and stays open for the next entry. */
export function AddItem({
  onAdd,
  label,
  placeholder = "Add…",
  disabled,
  disabledHint,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  if (disabled) {
    return (
      <div className={cn("px-2 py-1.5 text-[0.8rem] text-muted-foreground", className)}>
        {disabledHint}
      </div>
    );
  }

  const submit = () => {
    const trimmed = text.trim();
    if (trimmed) onAdd(trimmed);
    setText("");
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[0.85rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          className,
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        {label}
      </button>
    );
  }

  return (
    <input
      type="text"
      autoFocus
      aria-label={label}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
        if (e.key === "Escape") {
          setText("");
          setOpen(false);
        }
      }}
      onBlur={() => {
        submit();
        setOpen(false);
      }}
      className={cn(
        "w-full rounded border border-primary/35 bg-card px-2 py-1.5 text-[0.9rem] outline-none",
        className,
      )}
    />
  );
}
