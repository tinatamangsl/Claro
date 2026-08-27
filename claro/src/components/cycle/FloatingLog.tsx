import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * A way back to the log from anywhere on the page.
 *
 * The log sits below the guidance, and on a phone the page is long enough that
 * somebody reading the calendar has no way back to it except scrolling. This
 * appears only when it is the useful thing to offer, which is a narrower set of
 * moments than it sounds:
 *
 * - **Never once today is logged.** The button exists to catch an unlogged day;
 *   after that it is a piece of furniture asking for something already given.
 * - **Never while the log is on screen.** Offering to scroll somebody to what
 *   they are already looking at is noise, and it would sit over the very
 *   controls it points at.
 *
 * An `IntersectionObserver` rather than a scroll handler: the question is
 * "is that element visible", the browser answers it directly, and a scroll
 * listener would ask on every frame of every scroll to compute the same thing.
 */
export function FloatingLog({
  targetId,
  logged,
  onOpen,
}: {
  targetId: string;
  logged: boolean;
  onOpen: () => void;
}) {
  const [targetVisible, setTargetVisible] = useState(true);

  useEffect(() => {
    const target = document.getElementById(targetId);
    // No target is not a reason to float a button that goes nowhere.
    if (!target || typeof IntersectionObserver === "undefined") {
      setTargetVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setTargetVisible(entry.isIntersecting),
      // A sliver counts as visible: the button should go before it overlaps.
      { threshold: 0.01 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  if (logged || targetVisible) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      // Not "Log today": the quick row at the top already owns that name, and
      // two controls a screen reader cannot tell apart is two controls with no
      // name at all. This one travels to the log rather than writing anything.
      aria-label="Go to today's log"
      className="btn btn-primary fixed right-5 bottom-20 z-40 h-12 w-12 rounded-full p-0 shadow-lg sm:bottom-6"
    >
      <Pencil aria-hidden className="h-4 w-4" />
    </button>
  );
}
