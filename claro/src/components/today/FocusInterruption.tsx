import { INTERRUPTION_REASONS, INTERRUPTION_REASON_LABELS } from "@/lib/types";
import type { FocusSession, InterruptionReason } from "@/lib/types";
import { formatRemaining, mainRemainingMs } from "@/lib/focus-session";
import { cn } from "@/lib/utils";

type Props = {
  session: FocusSession;
  now: Date | null;
  selectedReason: InterruptionReason | null;
  onChooseReason: (reason: InterruptionReason) => void;
  onReturnBlock: () => void;
  onResume: () => void;
  onExit: () => void;
};

/**
 * What the user meets after admitting they were pulled away. The block is
 * already paused by this point — nothing here is a penalty, and nothing here
 * counts anything.
 */
export function FocusInterruption({
  session,
  now,
  selectedReason,
  onChooseReason,
  onReturnBlock,
  onResume,
  onExit,
}: Props) {
  const left = now
    ? mainRemainingMs(session, now)
    : Math.max(0, session.plannedMs - session.elapsedBeforeMs);

  return (
    <div className="paper-page p-6 sm:p-8">
      <span className="eyebrow">Paused</span>

      <p className="mt-3 display text-[1.8rem] leading-tight tracking-tight">
        Nothing is lost.
      </p>
      <p className="hand mt-2.5">
        The block stopped when you did. {formatRemaining(left)} of it is still waiting for you.
      </p>

      <fieldset className="mt-6">
        <legend className="eyebrow">If it helps, what pulled you away? Optional.</legend>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {INTERRUPTION_REASONS.map((reason) => {
            const active = selectedReason === reason;
            return (
              <button
                key={reason}
                type="button"
                aria-pressed={active}
                onClick={() => onChooseReason(reason)}
                className={cn(
                  "btn btn-sm",
                  active ? "btn-primary" : "btn-quiet text-muted-foreground",
                )}
              >
                {INTERRUPTION_REASON_LABELS[reason]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-7 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onReturnBlock}
          className="btn btn-primary"
        >
          Back in, 5 minutes
        </button>
        <button
          type="button"
          onClick={onResume}
          className="btn btn-quiet"
        >
          Resume the block now
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
