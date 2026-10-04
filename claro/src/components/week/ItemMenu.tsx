import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

export type ItemAction = {
  id: string;
  label: string;
  /** Set apart at the foot of the list. Letting go is not a move. */
  destructive?: boolean;
  run: () => void;
};

/** Roughly the panel's height, for deciding whether it opens up or down. */
const PANEL = 200;

/**
 * The small menu behind an item on the calendar.
 *
 * **Portalled and fixed**, for the reason `Picker` is: the grid scrolls inside
 * `overflow-x-auto`, and an absolutely positioned panel is clipped by that
 * ancestor whatever its z-index says. It is re-placed on scroll with `capture`
 * so the inner pane is heard too, and it opens upward when the trigger is
 * nearer the bottom of the viewport than the panel is tall, or the last row of
 * a week draws its menu off the screen.
 *
 * It is a menu of commands, not a `Picker`: a listbox says "choose a value"
 * and these do things.
 */
export function ItemMenu({
  anchor,
  title,
  actions,
  onClose,
}: {
  anchor: DOMRect;
  title: string;
  actions: ItemAction[];
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const below = window.innerHeight - anchor.bottom;
      const up = below < PANEL && anchor.top > below;
      setAt({
        left: Math.min(Math.max(8, anchor.left), window.innerWidth - 188),
        top: up ? Math.max(8, anchor.top - PANEL) : anchor.bottom + 4,
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor]);

  useEffect(() => {
    const away = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    // Deferred a frame: the press that opened this is still travelling.
    const timer = setTimeout(() => window.addEventListener("pointerdown", away), 0);
    window.addEventListener("keydown", key);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);

  if (typeof document === "undefined" || !at) return null;

  return createPortal(
    <div
      ref={panel}
      role="menu"
      aria-label={title}
      style={{ left: at.left, top: at.top }}
      className="fixed z-50 w-[11.5rem] rounded-lg border border-border bg-card p-1 shadow-lg"
    >
      <p className="truncate px-2 py-1 text-[10px] text-muted-foreground">{title}</p>
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          role="menuitem"
          onClick={() => {
            action.run();
            onClose();
          }}
          className={cn(
            "block w-full rounded px-2 py-1.5 text-left text-[0.82rem] transition-colors hover:bg-muted",
            action.destructive && "mt-0.5 border-t border-subtle pt-2 text-muted-foreground",
          )}
        >
          {action.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
