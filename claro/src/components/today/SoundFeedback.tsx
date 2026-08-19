import type { SoundFeedbackResponse } from "@/lib/types";

/**
 * One question, asked once, after a block that had sound.
 *
 * The answer is kept privately so the question can be looked at later. Nothing
 * reads it back yet: there are no recommendations, no insights and no scoring
 * built on it, and skipping is a first-class answer.
 */
export function SoundFeedback({
  onRespond,
}: {
  onRespond: (response: SoundFeedbackResponse) => void;
}) {
  return (
    <div className="mt-5 border-t border-border/70 pt-4">
      <p className="text-[0.88rem]">Did this sound support your focus?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => onRespond("helpful")} className="btn btn-sm btn-quiet">
          Helpful
        </button>
        <button
          type="button"
          onClick={() => onRespond("notForMe")}
          className="btn btn-sm btn-quiet"
        >
          Not for me
        </button>
        <button type="button" onClick={() => onRespond("skipped")} className="btn btn-sm btn-ghost">
          Skip
        </button>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Kept on this device. Nothing is recommended from it yet.
      </p>
    </div>
  );
}
