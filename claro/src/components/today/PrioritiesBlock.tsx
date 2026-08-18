import { CheckToggle } from "@/components/CheckToggle";
import { EditableText } from "@/components/EditableText";
import { GoalTag } from "@/components/GoalTag";
import { formatDayShort } from "@/lib/dates";
import { goalKey, goalOptions, parseGoalKey, resolveGoal } from "@/lib/goals";
import { cn } from "@/lib/utils";
import {
  GOAL_CATEGORY_META,
  PRIORITY_RANKS,
  priorityKey,
  type Day,
  type Priority,
  type PriorityKey,
  type PriorityRank,
  type Quarter,
} from "@/lib/types";

type Props = {
  day: Day;
  quarter: Quarter;
  onPatch: (key: PriorityKey, patch: Partial<Priority>) => void;
};

/**
 * One day, three clear priorities — written as entries on the page that holds
 * them, not as cards. Priority 1 dominates by size and by the gold mark; two
 * and three sit level with each other beneath it.
 */
export function PrioritiesBlock({ day, quarter, onPatch }: Props) {
  return (
    <div className="mt-2 space-y-1.5">
      {PRIORITY_RANKS.map((rank, index) => (
        <div key={rank}>
          {index > 0 && <div aria-hidden className="mb-1.5 h-px bg-border/70" />}
          <PriorityEntry
            rank={rank}
            dayId={day.id}
            priority={day[priorityKey(rank)]}
            quarter={quarter}
            onPatch={(patch) => onPatch(priorityKey(rank), patch)}
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
  onPatch,
}: {
  rank: PriorityRank;
  dayId: string;
  priority: Priority;
  quarter: Quarter;
  onPatch: (patch: Partial<Priority>) => void;
}) {
  const primary = rank === 1;
  const carriedFrom =
    priority.originDayId && priority.originDayId !== dayId ? priority.originDayId : null;

  return (
    <div className="flex items-start gap-2.5">
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

      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <EditableText
          value={priority.text}
          onCommit={(text) => onPatch({ text })}
          ariaLabel={`Priority ${rank}`}
          placeholder={
            primary
              ? "The most important thing today…"
              : rank === 2
                ? "A second priority (optional)"
                : "A third priority (optional)"
          }
          className={cn(
            "-ml-2 min-w-[9rem] flex-1 py-0.5 display",
            primary ? "text-[1.35rem] sm:text-[1.5rem]" : "text-[1.05rem]",
            priority.done && "strike-done text-muted-foreground",
          )}
        />

        <GoalPicker priority={priority} quarter={quarter} onPatch={onPatch} rank={rank} />
        {carriedFrom && (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            Carried from {formatDayShort(carriedFrom)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Ties a priority to any one goal in the quarter — a Main Quest or a Side
 * Quest, on either side of life — making the ladder explicit.
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
  const value = priority.goal ? goalKey(priority.goal) : "";

  return (
    <>
      <label className="sr-only" htmlFor={`priority-${rank}-goal`}>
        Link priority {rank} to a goal
      </label>
      <select
        id={`priority-${rank}-goal`}
        value={linked ? value : ""}
        onChange={(e) => onPatch({ goal: parseGoalKey(e.target.value) })}
        className={cn("field-select", linked && "field-select-active")}
      >
        <option value="">No linked goal</option>
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {GOAL_CATEGORY_META[option.category].label} — {option.title}
          </option>
        ))}
      </select>

      {linked && <GoalTag category={linked.category} title={linked.title} short />}
      {priority.goal && !linked && (
        <span className="text-[11px] text-muted-foreground">↳ that goal is no longer set</span>
      )}
    </>
  );
}
