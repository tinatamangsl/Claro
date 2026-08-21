import { Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useClaro } from "@/lib/claro-store";
import { cn } from "@/lib/utils";

/** Long enough to notice and reach, short enough not to sit there nagging. */
const VISIBLE_MS = 9000;

/**
 * One way back, on every screen.
 *
 * Claro deletes things in a lot of places, and until now none of them could be
 * taken back: a habit, a side quest, a period, a whole cycle history. The bar
 * appears wherever a destructive action happens, says what went, and offers it
 * back. It fades after a few seconds rather than sitting there, because an undo
 * that stays forever stops reading as urgent and starts reading as furniture.
 *
 * The keyboard route has no timer at all. Command-Z reaches the whole stack, so
 * a run of deletions can be walked back one at a time long after the bar has
 * gone.
 */
export function UndoBar() {
  const { lastUndo, undo, canUndo } = useClaro();
  const [showing, setShowing] = useState<{ id: number; label: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A new step, rather than the same one on a re-render, is what opens the bar.
  const stepId = lastUndo?.id ?? null;

  useEffect(() => {
    if (stepId === null || !lastUndo) return;
    setShowing({ id: lastUndo.id, label: lastUndo.label });

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShowing(null), VISIBLE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // Keyed on the step id: the label is carried with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId]);

  /**
   * Command-Z anywhere, except inside a field.
   *
   * A text input has its own undo and the browser's is better than ours there:
   * taking it over would make retyping a sentence undo somebody's deleted
   * habit instead.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      if (event.shiftKey) return;

      const el = event.target;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }

      if (!canUndo) return;
      event.preventDefault();
      undo();
      setShowing(null);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [canUndo, undo]);

  if (!showing) return null;

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4",
      )}
    >
      <div className="surface-raised pointer-events-auto flex items-center gap-3 rounded-full py-2 pr-2 pl-4 shadow-lg">
        <span className="text-[0.85rem]">{showing.label}</span>
        <button
          type="button"
          onClick={() => {
            undo();
            setShowing(null);
          }}
          className="btn btn-sm btn-quiet gap-1.5"
        >
          <Undo2 aria-hidden className="h-3.5 w-3.5" />
          Undo
        </button>
      </div>
    </div>
  );
}
