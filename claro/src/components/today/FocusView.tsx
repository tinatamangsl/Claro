import { ArrowLeft, CornerDownRight } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { CheckToggle } from "@/components/CheckToggle";
import { EditableText } from "@/components/EditableText";
import { FocusEnd } from "@/components/today/FocusEnd";
import { FocusInterruption } from "@/components/today/FocusInterruption";
import { FocusTimer } from "@/components/today/FocusTimer";
import { focusLadder, selectFocus } from "@/lib/focus";
import type { PriorityTarget } from "@/lib/priorities";
import { FOCUS_BLOCK_MS, JUST_BEGIN_BLOCK_MS, priorityKey } from "@/lib/types";
import type {
  Day,
  FocusSession,
  Interruption,
  InterruptionReason,
  Priority,
  Quarter,
  SoundFeedbackResponse,
  Week,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  day: Day;
  week: Week;
  quarter: Quarter;
  /** The one canonical session, already settled by the route. */
  session: FocusSession | null;
  /** The interruption currently being logged, if any. */
  openInterruption: Interruption | null;
  now: Date | null;
  onPatchPriority: (target: PriorityTarget, patch: Partial<Priority>) => void;
  onStart: (plannedMs: number) => void;
  onDistracted: () => void;
  onPause: () => void;
  onResumeBlock: () => void;
  onEnd: () => void;
  onChooseReason: (reason: InterruptionReason) => void;
  onReturnBlock: () => void;
  onResume: () => void;
  onComplete: () => void;
  onContinue: () => void;
  /** Leaving a finished block resolves it, unlike leaving a paused one. */
  onLeave: () => void;
  onPark: (text: string) => void;
  onExit: () => void;
  /** Only asked when the finished block actually had sound playing. */
  askAboutSound: boolean;
  onSoundFeedback: (response: SoundFeedbackResponse) => void;
  /**
   * The sound controls, passed in rather than imported, so the timer stays a
   * presentational component and the route remains the composition root.
   */
  soundPanel?: ReactNode;
};

/**
 * Return to Focus. Everything else on Today is stripped away: one task, the
 * rungs above it, and one clock. The screen changes with the session's phase,
 * but there is only ever one session behind it.
 */
export function FocusView(props: Props) {
  const { day, week, quarter, session, now, onExit } = props;
  const target = selectFocus(day);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Escape inside a field belongs to that field — it abandons the capture,
      // it doesn't throw the user out of focus mode.
      const el = event.target;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      onExit();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onExit]);

  const sessionRank =
    session?.target?.kind === "priority"
      ? session.target.rank
      : (session?.priority?.rank ?? null);

  const priority = sessionRank
    ? day[priorityKey(sessionRank)]
    : target.kind === "priority"
      ? target.priority
      : null;
  const ladder = priority ? focusLadder(priority, week, quarter) : null;

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center py-6 sm:py-10">
      <div className="flex items-center justify-between gap-4">
        <span className="eyebrow">Return to focus</span>
        <button
          type="button"
          onClick={onExit}
          className="btn btn-sm btn-quiet"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Daily
        </button>
      </div>

      <div className="mt-6">
        {session &&
          (session.phase === "running" ||
            session.phase === "returning" ||
            session.phase === "paused") && (
            <FocusTimer
              session={session}
              now={now}
              ladder={ladder}
              onDistracted={props.onDistracted}
              onPause={props.onPause}
              onResume={props.onResumeBlock}
              onEnd={props.onEnd}
              onPark={props.onPark}
              soundPanel={props.soundPanel}
            />
          )}

        {session && session.phase === "interrupted" && (
          <FocusInterruption
            session={session}
            now={now}
            selectedReason={props.openInterruption?.reason ?? null}
            onChooseReason={props.onChooseReason}
            onReturnBlock={props.onReturnBlock}
            onResume={props.onResume}
            onExit={onExit}
          />
        )}

        {session && session.phase === "ended" && (
          <FocusEnd
            session={session}
            canComplete={sessionRank !== null}
            askAboutSound={props.askAboutSound}
            onSoundFeedback={props.onSoundFeedback}
            onComplete={props.onComplete}
            onContinue={props.onContinue}
            onExit={props.onLeave}
          />
        )}

        {!session && <StartPanel {...props} />}
      </div>
    </div>
  );
}

/** No live session: name the one thing, then pick how long to give it. */
function StartPanel({ day, week, quarter, onPatchPriority, onStart }: Props) {
  const target = selectFocus(day);

  if (target.kind === "empty") {
    return (
      <div className="paper-page p-6 sm:p-8">
        <span className="eyebrow">Nothing set yet</span>
        <p className="mt-2 text-[0.92rem] leading-relaxed text-muted-foreground">
          Name the one thing that would make today count. You can change it later.
        </p>
        <div className="mt-4">
          <EditableText
            value=""
            onCommit={(text) => onPatchPriority({ rank: 1 }, { text })}
            ariaLabel="Priority 1"
            placeholder="The most important thing today…"
            autoFocus
            className="-ml-2 display text-[1.6rem] leading-tight tracking-tight sm:text-[1.85rem]"
          />
        </div>
      </div>
    );
  }

  if (target.kind === "done") {
    return (
      <div className="paper-page p-6 sm:p-8">
        <p className="display text-[2rem] leading-tight tracking-tight">
          Today's focus is done.
        </p>
        {target.next ? (
          <>
            <div className="mt-5">
              <span className="eyebrow">Next, if you have it in you</span>
              <p className="mt-1.5 flex items-start gap-2 text-[1.05rem] leading-snug">
                <CornerDownRight
                  aria-hidden
                  className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                />
                <span>{target.next.text}</span>
              </p>
            </div>
            <BlockChoices onStart={onStart} />
          </>
        ) : (
          <p className="mt-3 text-[0.92rem] leading-relaxed text-muted-foreground">
            Nothing else is waiting. That's allowed.
          </p>
        )}
      </div>
    );
  }

  const ladder = focusLadder(target.priority, week, quarter);

  return (
    <div>
      {ladder && (
        <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 pl-0.5">
          <span className="eyebrow">{ladder.domainLabel}</span>
          {ladder.goal && <span className="text-[11px] text-muted-foreground">{ladder.goal}</span>}
          {ladder.goal && ladder.mainQuest && (
            <span aria-hidden className="text-[11px] text-muted-foreground/40">
              ·
            </span>
          )}
          {ladder.mainQuest && (
            <span className="text-[11px] text-muted-foreground">{ladder.mainQuest}</span>
          )}
        </div>
      )}

      <div className="paper-page relative overflow-hidden p-6 sm:p-8">
        {target.rank === 1 && (
          <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-gold" />
        )}

        <div className="flex items-start gap-4">
          <CheckToggle
            checked={target.priority.done}
            onChange={() =>
              onPatchPriority({ rank: target.rank }, { done: !target.priority.done })
            }
            label={`Complete priority ${target.rank}`}
            size="lg"
            className="mt-2"
          />
          <p
            className={cn(
              "min-w-0 flex-1 display text-[2rem] leading-[1.1] tracking-tight sm:text-[2.5rem]",
              target.priority.done && "strike-done text-muted-foreground",
            )}
          >
            {target.priority.text}
          </p>
        </div>

        <BlockChoices onStart={onStart} />
      </div>
    </div>
  );
}

function BlockChoices({ onStart }: { onStart: (plannedMs: number) => void }) {
  return (
    <div className="mt-7 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onStart(FOCUS_BLOCK_MS)}
        className="btn btn-primary"
      >
        Start 25 minutes
      </button>
      <button
        type="button"
        onClick={() => onStart(JUST_BEGIN_BLOCK_MS)}
        className="btn btn-quiet"
      >
        Just begin, 5 minutes
      </button>
    </div>
  );
}
