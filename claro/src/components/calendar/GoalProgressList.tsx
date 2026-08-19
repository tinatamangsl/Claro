import { GoalTag } from "@/components/GoalTag";
import type { GoalProgress } from "@/lib/calendar";

/**
 * Progress towards each goal the day's priorities were linked to.
 *
 * Category comes through the tag, which carries an icon and a readable label
 * as well as a colour, so the distinction never rests on colour alone. Long
 * goal text wraps rather than being clipped.
 */
export function GoalProgressList({ goals }: { goals: GoalProgress[] }) {
  if (goals.length === 0) {
    return (
      <p className="text-[0.82rem] leading-relaxed text-muted-foreground">
        No priorities were linked to a goal in this period.
      </p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {goals.map((goal) => (
        <li key={goal.key}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <GoalTag category={goal.category} short />
              <span className="min-w-0 text-[0.85rem] leading-snug">
                {goal.title || "This goal is no longer set"}
              </span>
            </span>
            <span className="tnum shrink-0 text-[11px] text-muted-foreground">
              {goal.done} of {goal.linked} done
            </span>
          </div>
          <div
            aria-hidden
            className="mt-1.5 h-1 overflow-hidden rounded-full bg-border"
          >
            <div
              className="h-full rounded-full bg-positive/70"
              style={{ width: `${goal.linked === 0 ? 0 : (goal.done / goal.linked) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
