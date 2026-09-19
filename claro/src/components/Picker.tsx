import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
   *
   * Given `close`, because a footer that commits has finished the same job an
   * option does and should leave the same way: a panel still standing open
   * over the page after the choice was made reads as though nothing happened.
   */
  footer?: (api: { close: () => void }) => React.ReactNode;
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
  /**
   * Where the panel sits on screen, in viewport coordinates.
   *
   * The panel used to be `position: absolute` inside the trigger's own box,
   * which any ancestor with `overflow: hidden` clips no matter what z-index it
   * carries. Both `.spread` and the schedule's own `.paper-panel` are such
   * ancestors, so on the first and last rows of the schedule the list was drawn
   * almost entirely outside them: measured at 201px tall with only the last
   * two pixels inside the clip. The time could not be seen, let alone changed.
   *
   * It is a portal to the body now, positioned from the trigger's rectangle. A
   * fixed element in the body has nothing above it to clip against.
   */
  const [at, setAt] = useState<{ left: number; top: number; width: number } | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const listId = useId();

  const chosen = options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      // The panel is no longer inside `root`, so it has to be asked separately
      // or every click on an option would read as a click outside.
      if (root.current?.contains(target) || panel.current?.contains(target)) return;
      setOpen(false);
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
  useLayoutEffect(() => {
    if (!open) {
      setDropUp(false);
      setAt(null);
      return;
    }

    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;

      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      const up = below < PANEL_MAX + 8 && above > below;
      setDropUp(up);
      setAt({
        left: align === "right" ? rect.right : rect.left,
        top: up ? rect.top : rect.bottom,
        width: rect.width,
      });
    };

    place();
    /*
     * Re-placed on scroll and resize, because a fixed panel does not travel
     * with the page the way an absolute one did. `capture` catches the inner
     * panes too: the schedule scrolls inside itself, and a list anchored to a
     * row that has moved is worse than one that is clipped.
     */
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, align]);

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

      {open &&
        at &&
        createPortal(
          <div
            ref={panel}
            onKeyDown={onKeyDown}
            style={{
              position: "fixed",
              left: align === "right" ? undefined : at.left,
              right: align === "right" ? window.innerWidth - at.left : undefined,
              top: dropUp ? undefined : at.top + 4,
              bottom: dropUp ? window.innerHeight - at.top + 4 : undefined,
              minWidth: Math.max(at.width, 160),
            }}
            /*
              The up/down decision stays a class even though the offsets are
              now inline: it is the observable record of which way the list
              chose to open, and the tests read it. Inline styles win over it,
              so the old anchored offsets it carries are inert here.
            */
            className={cn(
              "picker-panel picker-panel-floating",
              dropUp && "picker-panel-above",
            )}
          >
          {/*
            The listbox is inside the panel rather than being it, because a
            `listbox` may hold nothing but options and the footer is a field.
          */}
          <div id={listId} role="listbox" aria-label={label} className="picker-list">
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

          {footer ? (
            <div className="picker-footer">
              {footer({
                close: () => {
                  setOpen(false);
                  trigger.current?.focus();
                },
              })}
            </div>
            ) : null}
          </div>,
          document.body,
        )}
    </div>
  );
}
