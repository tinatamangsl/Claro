import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

/** Matches `.picker-panel`'s max-height. Kept in step by the test below it. */
const PANEL_MAX = 240;

import { cn } from "@/lib/utils";

export type PickerOption<T extends string> = {
  value: T;
  label: string;
  /** A second line, for options that need one. */
  hint?: string;
};

type Props<T extends string> = {
  value: T | null;
  options: PickerOption<T>[];
  onChange: (value: T) => void;
  /** Shown on the trigger when nothing is chosen. */
  placeholder: string;
  label: string;
  className?: string;
  triggerClassName?: string;
  align?: "left" | "right";
  /**
   * Rendered inside the panel, under the options.
   *
   * For the case a short list cannot express — a minute that is not a quarter,
   * the same shape as the focus block's plain minutes field beside its four
   * named presets. It sits inside the one panel rather than beside the trigger
   * so there is still a single control, and a second listbox implementation is
   * not needed to hold one input.
   */
  footer?: React.ReactNode;
};

/**
 * A select that looks like Claro.
 *
 * A native `<select>` styles its trigger and nothing else: the list that drops
 * out of it is drawn by the operating system, in system grey, and no CSS
 * reaches it. Everywhere Claro needed a choice from a short list, the moment of
 * choosing left the app's design entirely.
 *
 * So the list is drawn here. What that costs is the behaviour a native select
 * gets free, and it is paid back deliberately: the trigger is a real button
 * with `aria-expanded`, the list is a `listbox` of `option`s, arrow keys move
 * through it, Enter and Space choose, Escape closes and returns focus, and a
 * click anywhere outside dismisses it.
 */
export function Picker<T extends string>({
  value,
  options,
  onChange,
  placeholder,
  label,
  className,
  triggerClassName,
  align = "left",
  footer,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [dropUp, setDropUp] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const listId = useId();

  const chosen = options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  /*
   * Which way the list opens.
   *
   * The panel is 15rem tall and always hung below the trigger, which is fine
   * for a control halfway up a page and useless for one near the bottom of a
   * phone: the list renders off-screen and the choice cannot be seen, let
   * alone made. Every action and habit row carries one of these, and on a
   * stacked layout those rows are the last thing on the page.
   *
   * Measured when the list opens rather than tracked, because the only moment
   * it matters is the moment it is drawn.
   */
  useEffect(() => {
    if (!open) return setDropUp(false);
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom;
    const above = rect.top;
    setDropUp(below < PANEL_MAX + 8 && above > below);
  }, [open]);

  const choose = (option: PickerOption<T>) => {
    onChange(option.value);
    setOpen(false);
    trigger.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    /*
     * Typing in the footer's field is typing, not navigating. Without this the
     * panel swallows every digit's keystroke handling and Enter chooses an
     * option instead of committing what was written. Escape still belongs to
     * the panel, because closing is the one thing both want.
     */
    if (event.target instanceof HTMLInputElement && event.key !== "Escape") return;

    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setActive(Math.max(0, options.findIndex((o) => o.value === value)));
        setOpen(true);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[active];
      if (option) choose(option);
    }
  };

  return (
    <div ref={root} className={cn("relative", className)} onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        onClick={() => {
          setActive(Math.max(0, options.findIndex((o) => o.value === value)));
          setOpen((was) => !was);
        }}
        className={cn("picker-trigger", triggerClassName)}
      >
        <span className="min-w-0 truncate">{chosen?.label ?? placeholder}</span>
        <ChevronDown
          aria-hidden
          className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className={cn(
            "picker-panel",
            align === "right" && "right-0 left-auto",
            dropUp && "picker-panel-above",
          )}
        >
          {options.map((option, i) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(option)}
                className={cn("picker-option", i === active && "picker-option-active")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{option.label}</span>
                  {option.hint && (
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {option.hint}
                    </span>
                  )}
                </span>
                {selected && <Check aria-hidden className="h-3 w-3 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
