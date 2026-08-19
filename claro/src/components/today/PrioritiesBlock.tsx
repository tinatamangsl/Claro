import { ChevronDown } from "lucide-react";

import { CheckToggle } from "@/components/CheckToggle";
import { DragHandle } from "@/components/DragHandle";
import { EditableText } from "@/components/EditableText";
import { GoalTag } from "@/components/GoalTag";
import { SortAnnouncer } from "@/components/SortAnnouncer";
import { useSortable } from "@/hooks/use-sortable";
import { formatDayShort } from "@/lib/dates";
import { goalKey, goalOptions, parseGoalKey, resolveGoal } from "@/lib/goals";
import { cn } from "@/lib/utils";
import {
  GOAL_CATEGORY_META,
  PRIORITY_RANKS,
  priorityKey,
  type Day,
  type GoalRef,
  type Priority,
  type PriorityKey,
  type PriorityRank,
  type Quarter,
} from "@/lib/types";

type Props = {
  day: Day;
  quarter: Quarter;
  onPatch: (key: PriorityKey, patch: Partial<Priority>) => void;
  /** Rewrites all three slots at once — how a reorder is expressed. */
  onReorder: (priorities: Priority[]) => void;
  onFocus?: (rank: PriorityRank) => void;
};

/** The three slots as a list, so they can be reordered like one. */
type Slot = { id: string; rank: PriorityRank; priority: Priority };

/**
 * One day, three clear priorities — written as entries on the page that holds
 * them, not as cards. Priority 1 dominates by size and by the gold mark.
 *
 * Text wraps rather than truncating: a priority you cannot read is not a
 * priority. Goal context is the tag alone — the Main Quest's full text already
 * lives on Quarter, and repeating it here just crowds the day.
 */
export function PrioritiesBlock({ day, quarter, onPatch, onReorder, onFocus }: Props) {
  const slots: Slot[] = PRIORITY_RANKS.map((rank) => ({
    // Rank is the stable slot identity; a blank slot still needs to be a target.
    id: `slot-${rank}`,
    rank,
    priority: day[priorityKey(rank)],
  }));

  const sortable = useSortable<Slot>({
    items: slots,
    label: (slot) => slot.priority.text || `priority ${slot.rank}`,
    onReorder: (next) => onReorder(next.map((slot) => slot.priority)),
  });

  return (
    <div className="mt-2 space-y-1.5">
      <SortAnnouncer message={sortable.announcement} />

      {sortable.ordered.map((slot, index) => (
        <div key={slot.id} ref={sortable.itemRef(slot.id)}>
          {index > 0 && <div aria-hidden className="mb-1.5 h-px bg-border/70" />}
          <PriorityEntry
            rank={(index + 1) as PriorityRank}
            dayId={day.id}
            priority={slot.priority}
            quarter={quarter}
            dragging={sortable.draggingId === slot.id}
            handle={
              <DragHandle
                {...sortable.handleProps(slot)}
                dragging={sortable.draggingId === slot.id}
              />
            }
            onPatch={(patch) => onPatch(priorityKey((index + 1) as PriorityRank), patch)}
            onFocus={onFocus ? () => onFocus((index + 1) as PriorityRank) : undefined}
          />
        </div>
      ))}
    </div>
  );
}

function PriorityEntry({
  rank,
  dayId,
  priority,
  quarter,
  handle,
  dragging,
  onPatch,
  onFocus,
}: {
  rank: PriorityRank;
  dayId: string;
  priority: Priority;
  quarter: Quarter;
  handle: React.ReactNode;
  dragging: boolean;
  onPatch: (patch: Partial<Priority>) => void;
  onFocus?: () => void;
}) {
  const primary = rank === 1;
  const carriedFrom =
    priority.originDayId && priority.originDayId !== dayId ? priority.originDayId : null;

  return (
    <div
      className={cn(
        "group flex items-start gap-2 rounded-md transition-shadow",
        dragging && "bg-card/80 shadow-[0_8px_24px_-12px_hsl(30_22%_8%/0.3)]",
      )}
    >
      {handle}

      <div className="flex items-center gap-2 pt-0.5">
        <span
          aria-hidden
          className={cn(
            "tnum display select-none leading-none",
            primary ? "text-xl text-gold" : "text-base text-muted-foreground/60",
          )}
        >
          {rank}
        </span>
        <CheckToggle
          checked={priority.done}
          onChange={() => onPatch({ done: !priority.done })}
          label={`Complete priority ${rank}`}
          size={primary ? "md" : "sm"}
        />
      </div>

      <div className="min-w-0 flex-1">
        <EditableText
          value={priority.text}
          onCommit={(text) => onPatch({ text })}
          wrap
          ariaLabel={`Priority ${rank}`}
          placeholder={
            primary
              ? "The most important thing today…"
              : rank === 2
                ? "A second priority (optional)"
                : "A third priority (optional)"
          }
          className={cn(
            "-ml-2 py-0.5 display",
            primary ? "text-[1.35rem] sm:text-[1.5rem]" : "text-[1.05rem]",
            priority.done && "strike-done text-muted-foreground",
          )}
        />

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-0.5">
          <GoalPicker priority={priority} quarter={quarter} onPatch={onPatch} rank={rank} />
          {carriedFrom && (
            <span className="text-[10px] text-muted-foreground">
              Carried from {formatDayShort(carriedFrom)}
            </span>
          )}
          {onFocus && priority.text.trim() !== "" && !priority.done && (
            <button
              type="button"
              onClick={onFocus}
              className="text-[10px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              Focus on this
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Ties a priority to any one goal in the quarter.
 *
 * The goal's own words appear exactly once. A native `<select>` always renders
 * its chosen option's text, so showing the tag *and* the select repeated the
 * Main Quest twice on the same line — instead the tag is the visible control
 * and the real select sits transparently over it, keeping the keyboard and
 * screen-reader behaviour a plain select already has.
 */
function GoalPicker({
  priority,
  quarter,
  onPatch,
  rank,
}: {
  priority: Priority;
  quarter: Quarter;
  onPatch: (patch: Partial<Priority>) => void;
  rank: number;
}) {
  const options = goalOptions(quarter);
  const linked = resolveGoal(priority.goal, quarter);

  return (
    <span className="relative inline-flex max-w-full items-center">
      {linked ? (
        <GoalTag category={linked.category} title={linked.title} short />
      ) : (
        <span className="field-select inline-flex items-center gap-1 border border-dashed border-border">
          {priority.goal ? "That goal is no longer set" : "Link a goal"}
          <ChevronDown aria-hidden className="h-3 w-3" />
        </span>
      )}

      <label className="sr-only" htmlFor={`priority-${rank}-goal`}>
        Link priority {rank} to a goal
      </label>
      <select
        id={`priority-${rank}-goal`}
        value={linked ? goalKey(priority.goal as GoalRef) : ""}
        onChange={(e) => onPatch({ goal: parseGoalKey(e.target.value) })}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        <option value="">No linked goal</option>
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {GOAL_CATEGORY_META[option.category].label} — {option.title}
          </option>
        ))}
      </select>
    </span>
  );
}
