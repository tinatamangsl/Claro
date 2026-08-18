import type { FocusSession } from "@/lib/types";

type Props = {
  session: FocusSession;
  /** False when the session wasn't tied to a priority — nothing to complete. */
  canComplete: boolean;
  onComplete: () => void;
  onContinue: () => void;
  onExit: () => void;
};

/**
 * The end of a block. Completing the priority is always an explicit choice —
 * finishing a timer is not evidence that the work is done.
 */
export function FocusEnd({ session, canComplete, onComplete, onContinue, onExit }: Props) {
  return (
    <div className="paper-page p-6 sm:p-8">
      <span className="eyebrow">Block finished</span>

      <p className="mt-3 display text-[1.8rem] leading-tight tracking-tight">
        {session.intention || "That's the block."}
      </p>
      <p className="mt-2 text-[0.92rem] leading-relaxed text-muted-foreground">
        Where do you want to leave it?
      </p>

      <div className="mt-7 flex flex-wrap gap-2">
        {canComplete && (
          <button
            type="button"
            onClick={onComplete}
            className="btn btn-primary"
          >
            Complete priority
          </button>
        )}
        <button
          type="button"
          onClick={onContinue}
          className="btn btn-quiet"
        >
          Continue
        </button>
        <button
          type="button"
          onClick={onExit}
          className="btn btn-ghost"
        >
          Back to Today
        </button>
      </div>
    </div>
  );
}
