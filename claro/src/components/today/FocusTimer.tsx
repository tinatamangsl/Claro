import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";

import { AddItem } from "@/components/AddItem";
import { formatRemaining, mainElapsedMs, returnRemainingMs } from "@/lib/focus-session";
import type { FocusLadder } from "@/lib/focus";
import type { FocusSession } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  session: FocusSession;
  /** Null until the tick source has mounted. */
  now: Date | null;
  ladder: FocusLadder | null;
  onDistracted: () => void;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
  /** Lengthen or shorten the block that is already running. */
  onAdjust: (deltaMs: number) => void;
  onPark: (text: string) => void;
  /** The sound controls, when the route supplies them. */
  soundPanel?: ReactNode;
};

/**
 * The running block. One clock, one intention, and two very different escape
 * hatches: parking a thought (keeps you here) and admitting a distraction
 * (stops the clock without penalty).
 */
export function FocusTimer({
  session,
  now,
  ladder,
  onDistracted,
  onPause,
  onResume,
  onEnd,
  onAdjust,
  onPark,
  soundPanel,
}: Props) {
  const returning = session.phase === "returning";
  const paused = session.phase === "paused";

  /**
   * Elapsed time comes from the session itself when the clock is not ticking,
   * which is exactly what a paused block needs — otherwise the progress bar
   * would empty itself every time the user paused.
   */
  const elapsed = now ? mainElapsedMs(session, now) : session.elapsedBeforeMs;
  const mainLeft = Math.max(0, session.plannedMs - elapsed);
  const shown = returning && now ? returnRemainingMs(session, now) : mainLeft;
  const ratio = session.plannedMs > 0 ? Math.min(1, elapsed / session.plannedMs) : 1;

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
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-gold" />

        <span className="eyebrow">
          {paused ? "Paused" : returning ? "Back in" : "In focus"}
        </span>

        <p className="mt-3 display text-[1.6rem] leading-tight tracking-tight sm:text-[1.9rem]">
          {session.intention || "This block"}
        </p>

        <p
          className={cn(
            "tnum mt-6 display text-[3.4rem] leading-none tracking-tight sm:text-[4.2rem]",
            paused && "text-muted-foreground",
          )}
          aria-label={returning ? "Time left in the return block" : "Time left in this block"}
        >
          {formatRemaining(shown)}
        </p>

        {returning && (
          <p className="mt-2 text-[0.85rem] text-muted-foreground">
            Then straight back into {formatRemaining(mainLeft)} of the original block.
          </p>
        )}

        <div
          aria-hidden
          className="mt-6 h-[2px] w-full overflow-hidden rounded-full bg-border"
        >
          <div
            className={cn("h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear")}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {paused ? (
          <button
            type="button"
            onClick={onResume}
            className="btn btn-sm btn-primary"
          >
            Resume
          </button>
        ) : (
          <button
            type="button"
            onClick={onPause}
            className="btn btn-sm btn-quiet"
          >
            Pause
          </button>
        )}

        {/* Being distracted is a different thing from pausing, and only it is logged. */}
        {session.phase === "running" && (
          <button
            type="button"
            onClick={onDistracted}
            className="btn btn-sm btn-quiet"
          >
            I got distracted
          </button>
        )}

        <button
          type="button"
          onClick={onEnd}
          className="btn btn-sm btn-ghost"
        >
          End block
        </button>

        {/*
          Changing your mind mid-block costs nothing: elapsed time comes from
          timestamps, so the plan is just a number and moving it loses none of
          the work already done. It will not shrink past what you have spent.
        */}
        {session.phase !== "returning" && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="tnum text-[10px] text-muted-foreground">
              {Math.round(session.plannedMs / 60_000)} min block
            </span>
            <button
              type="button"
              onClick={() => onAdjust(-5 * 60_000)}
              aria-label="Shorten this block by five minutes"
              className="btn btn-sm btn-icon btn-quiet"
            >
              <Minus aria-hidden className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => onAdjust(5 * 60_000)}
              aria-label="Lengthen this block by five minutes"
              className="btn btn-sm btn-icon btn-quiet"
            >
              <Plus aria-hidden className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>

      {soundPanel && (
        <div className="mt-6 border-t border-subtle pt-5">{soundPanel}</div>
      )}

      <div className="mt-6 border-t border-subtle pt-5">
        <AddItem
          label="Park a thought for later"
          placeholder="It'll be waiting in Quick Ticks…"
          onAdd={onPark}
        />
        <p className="hand mt-2 px-2">Parking keeps you here. It doesn't stop the block.</p>
      </div>
    </div>
  );
}
