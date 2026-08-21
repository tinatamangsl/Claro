import { formatRemaining } from "@/lib/focus-session";
import { formatBlockLength } from "@/lib/focus-presets";
import type { FocusSession } from "@/lib/types";

type Props = {
  session: FocusSession;
  /** Null whenever nothing is counting, as everywhere else in focus. */
  now: Date | null;
  remainingMs: number;
  onStartNext: () => void;
  onSkip: () => void;
  onExit: () => void;
};

/**
 * The break between blocks.
 *
 * When it runs out the screen waits rather than starting the next block on its
 * own. A break exists so someone can leave the desk, and a timer that begins
 * counting at an empty chair turns the rest into a debt. The next block starts
 * when they say so, like every other block in Claro.
 */
export function FocusBreak({ session, now, remainingMs, onStartNext, onSkip, onExit }: Props) {
  const over = now !== null && remainingMs === 0;

  return (
    <div className="paper-page p-6 sm:p-8">
      <span className="eyebrow">{over ? "Break's over, when you are" : "On a break"}</span>

      <p className="mt-3 display text-[3.4rem] leading-none tracking-tight tabular-nums sm:text-[4rem]">
        {over ? formatBlockLength(session.breakMs) : formatRemaining(remainingMs)}
      </p>

      <p className="mt-3 max-w-prose text-[0.92rem] leading-relaxed text-muted-foreground">
        {over
          ? "That's the break. Start the next block whenever you are ready, or leave it here."
          : "Nothing is counting against you. Claro will wait here until you come back."}
      </p>

      <div className="mt-7 flex flex-wrap gap-2">
        <button type="button" onClick={onStartNext} className="btn btn-primary">
          {over ? "Start the next block" : "Skip the break, start now"}
        </button>
        {!over && (
          <button type="button" onClick={onSkip} className="btn btn-quiet">
            Back to the finished block
          </button>
        )}
        <button type="button" onClick={onExit} className="btn btn-ghost">
          Back to Daily
        </button>
      </div>
    </div>
  );
}
