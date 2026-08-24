import { X } from "lucide-react";

import { CycleLink } from "@/components/cycle/CycleLink";

/**
 * A question, and only a question.
 *
 * It appears when cycle notes are on and there is a note for today. Nothing is
 * inferred from that note, nothing is suggested, and nothing about the day is
 * changed: adjusting the plan means the user editing it themselves, exactly as
 * they would on any other day.
 *
 * The way through is `CycleLink`, the same affordance every other screen uses,
 * rather than a second door worded differently.
 */
export function CyclePrompt({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section className="surface flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <p className="min-w-0 flex-1 text-[0.88rem] leading-snug">
        Would you like to adjust today's plan?
      </p>
      <CycleLink />
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss this question for today"
        className="btn btn-sm btn-ghost gap-1.5"
      >
        <X aria-hidden className="h-3 w-3" />
        Not now
      </button>
    </section>
  );
}
