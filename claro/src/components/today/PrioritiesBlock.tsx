import { ChevronDown, X } from "lucide-react";

import { CheckToggle } from "@/components/CheckToggle";
import { DragHandle } from "@/components/DragHandle";
import { EditableText } from "@/components/EditableText";
import { GoalTag } from "@/components/GoalTag";
import { SortAnnouncer } from "@/components/SortAnnouncer";
import { useSortable } from "@/hooks/use-sortable";
import { formatDayShort } from "@/lib/dates";
import type { PriorityTarget } from "@/lib/priorities";
import { goalKey, goalOptions, parseGoalKey, resolveGoal } from "@/lib/goals";
import { cn } from "@/lib/utils";
import {
  GOAL_CATEGORY_META,
  PRIORITY_RANKS,
  priorityKey,
  type Day,
  type GoalRef,
  type Priority,
  type PriorityRank,
  type Quarter,
} from "@/lib/types";

type Props = {
  day: Day;
  quarter: Quarter;
  onPatch: (target: PriorityTarget, patch: Partial<Priority>) => void;
  /** The new order, as ids. The route resolves it against live state. */
  onReorder: (ids: (string | null)[]) => void;
  onClear: (target: PriorityTarget) => void;
  onFocus?: (target: PriorityTarget) => void;
};

/**
 * A slot as the sortable sees it.
 *
 * `id` is the priority's own id wherever it has one, so identity travels with
 * the work rather than with the position it happens to occupy. Only an empty
 * slot falls back to a positional id, and an empty slot has nothing to lose.
 */
type Slot = { id: string; rank: PriorityRank; priority: Priority; target: PriorityTarget };

/**
 * One day, three clear priorities — written as entries on the page that holds
 * them, not as cards. Priority 1 dominates by size and by the gold mark.
 *
 * Text wraps rather than truncating: a priority you cannot read is not a
 * priority. Goal context is the tag alone — the Main Quest's full text already
 * lives on Quarter, and repeating it here just crowds the day.
 */
export function PrioritiesBlock({
  day,
  quarter,
  onPatch,
  onReorder,
  onClear,
  onFocus,
}: Props) {
  const slots: Slot[] = PRIORITY_RANKS.map((rank) => {
    const priority = day[priorityKey(rank)];
    return {
      id: priority.id ?? `empty-${rank}`,
      rank,
      priority,
      // Written work is addressed by id; an empty slot by its position.
      target: priority.id ? { id: priority.id } : { rank },
    };
  });

  const sortable = useSortable<Slot>({
    items: slots,
    label: (slot) => slot.priority.text || `empty priority ${slot.rank}`,
    // Ids only: the route resolves them against the day as it is at write time,
    // so a reorder can never write one priority's data into another's slot.
    onReorder: (next) => onReorder(next.map((slot) => slot.priority.id)),
  });

  return (
    <div className="mt-2 space-y-1.5">
      <SortAnnouncer message={sortable.announcement} />

      {sortable.ordered.map((slot, index) => (
        <div key={slot.id} ref={sortable.itemRef(slot.id)}>
          {index > 0 && <div aria-hidden className="mb-1.5 h-px bg-border/70" />}
          <PriorityEntry
            position={index + 1}
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
            onPatch={(patch) => onPatch(slot.target, patch)}
            onClear={() => onClear(slot.target)}
            onFocus={onFocus ? () => onFocus(slot.target) : undefined}
          />
        </div>
      ))}
    </div>
  );
}

function PriorityEntry({
  position,
  dayId,
  priority,
  quarter,
  handle,
  dragging,
  onPatch,
  onClear,
  onFocus,
}: {
  /** Where it currently sits. A position, not a ranking. */
  position: number;
  dayId: string;
  priority: Priority;
  quarter: Quarter;
  handle: React.ReactNode;
  dragging: boolean;
  onPatch: (patch: Partial<Priority>) => void;
  onClear: () => void;
  onFocus?: () => void;
}) {
  const written = priority.text.trim() !== "";
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
        {/* A position marker, given the same weight for all three. */}
        <span
          aria-hidden
          className="tnum display select-none text-base leading-none text-muted-foreground/60"
        >
          {position}
        </span>
        <CheckToggle
          checked={priority.done}
          onChange={() => onPatch({ done: !priority.done })}
          label={`Complete priority ${position}`}
          size="sm"
        />
      </div>

      <div className="min-w-0 flex-1">
        <EditableText
          value={priority.text}
          onCommit={(text) => onPatch({ text })}
          wrap
          ariaLabel={`Priority ${position}`}
          placeholder="Something that matters today"
          className={cn(
            // One size for all three: none of them outranks the others.
            "-ml-2 py-0.5 display text-[1.15rem] sm:text-[1.25rem]",
            priority.done && "strike-done text-muted-foreground",
          )}
        />

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-0.5">
          <GoalPicker priority={priority} quarter={quarter} onPatch={onPatch} position={position} />
          {carriedFrom && (
            <span className="text-[10px] text-muted-foreground">
              Carried from {formatDayShort(carriedFrom)}
            </span>
          )}
          {onFocus && written && !priority.done && (
            <button
              type="button"
              onClick={onFocus}
              className="text-[10px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              Focus on this
            </button>
          )}
          {written && (
            <button
              type="button"
              onClick={onClear}
              aria-label={`Clear priority ${position}, ${priority.text}`}
              className="ml-auto shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X aria-hidden className="h-3.5 w-3.5" />
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
  position,
}: {
  priority: Priority;
  quarter: Quarter;
  onPatch: (patch: Partial<Priority>) => void;
  position: number;
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

      <label className="sr-only" htmlFor={`priority-${position}-goal`}>
        Link priority {position} to a goal
      </label>
      <select
        id={`priority-${position}-goal`}
        value={linked ? goalKey(priority.goal as GoalRef) : ""}
        onChange={(e) => onPatch({ goal: parseGoalKey(e.target.value) })}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        <option value="">No linked goal</option>
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {GOAL_CATEGORY_META[option.category].label}: {option.title}
          </option>
        ))}
      </select>
    </span>
  );
}
