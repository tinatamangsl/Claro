import { useEffect, useRef } from "react";

import { useDebouncedField } from "@/hooks/use-debounced-field";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Grows with its content instead of scrolling. */
  multiline?: boolean;
  rows?: number;
  ariaLabel: string;
  onEnter?: () => void;
  autoFocus?: boolean;
};

/**
 * A field that reads as plain text until you touch it — the calm alternative to
 * boxing every value on the page.
 */
export function EditableText({
  value,
  onCommit,
  placeholder,
  className,
  multiline = false,
  rows = 3,
  ariaLabel,
  onEnter,
  autoFocus,
}: Props) {
  const field = useDebouncedField(value, onCommit);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow the textarea so notes never scroll inside a tiny box.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [field.value, multiline]);

  if (multiline) {
    return (
      <textarea
        ref={textareaRef}
        aria-label={ariaLabel}
        rows={rows}
        className={cn("field-plain px-2 py-1.5", className)}
        placeholder={placeholder}
        value={field.value}
        onChange={(e) => field.onChange(e.target.value)}
        onBlur={field.onBlur}
        autoFocus={autoFocus}
      />
    );
  }

  return (
    <input
      type="text"
      aria-label={ariaLabel}
      className={cn("field-plain truncate px-2 py-1.5", className)}
      placeholder={placeholder}
      value={field.value}
      onChange={(e) => field.onChange(e.target.value)}
      onBlur={field.onBlur}
      autoFocus={autoFocus}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          field.onBlur();
          onEnter?.();
        }
        if (e.key === "Escape") e.currentTarget.blur();
      }}
    />
  );
}
