import { Link } from "@tanstack/react-router";

import { useClaro } from "@/lib/claro-store";
import { weekDayIds } from "@/lib/dates";
import { activeHabits, weekAgainstIntent, weeklyIntent } from "@/lib/habits";
import { cn } from "@/lib/utils";
import type { Weekday, WeekId } from "@/lib/types";

/** Mon to Sun, for naming pinned days without spelling them out in full. */
const DAY_INITIAL: Record<Weekday, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

/**
 * The week's practices, where the week is being planned.
 *
 * Daily shows the grid you tick; this shows the shape of the week you said you
 * wanted, beside the goals set on the same page. It is the one place a weekly
 * target is the natural unit, because a week is the period it was set in.
 *
 * **It reports and never adjusts.** Nothing here changes a goal, an action or
 * a habit; the only interactive thing is a link to Daily, where the ticking
 * happens. A card that quietly rewrote the week from a habit count would be
 * the kind of automation this app does not do.
 *
 * Habits with no target appear too, as a plain count. Not setting one is a
 * legitimate way to keep a habit, and hiding those rows would turn the card
 * into an argument for configuring things.
 */
export function HabitWeekCard({ weekId, className }: { weekId: WeekId; className?: string }) {
  const { state, today } = useClaro();
  const habits = activeHabits(state.habits);
  if (habits.length === 0) return null;

  const days = weekDayIds(weekId);
  const rows = habits.map((habit) => ({
    habit,
    intent: weeklyIntent(habit),
    ...weekAgainstIntent(habit, state.habitCompletions, days),
  }));

  /*
   * Days, not practices.
   *
   * The first version of this counted how many habits had already *reached*
   * their number, which on a Friday read "0 of 3 practices are at it" while
   * the rows above it said 3 of 4, 2 of 3 and 5 of 7. Technically true and
   * completely wrong: mid-week almost nothing has reached its target yet, so
   * the sentence told somebody having a good week that they had done nothing.
   *
   * Summing days is accurate at any point in the week and never implies a
   * verdict, because it is the same arithmetic the rows are already showing.
   */
  const aimed = rows.filter((r) => r.intended !== null);
  const keptSoFar = aimed.reduce((n, r) => n + Math.min(r.kept, r.intended ?? 0), 0);
  const meantTo = aimed.reduce((n, r) => n + (r.intended ?? 0), 0);

  return (
    <section className={cn("surface-quiet p-5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-2.5">
          <h2 className="eyebrow">Practices this week</h2>
          <span className="text-[10px] text-muted-foreground">what you meant to do</span>
        </div>
        <Link
          to="/today"
          className="text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          Tick them on Daily
        </Link>
      </div>

      <ul className="mt-3 divide-y divide-subtle">
        {rows.map(({ habit, intent, kept, intended }) => (
          <li key={habit.id} className="flex items-baseline justify-between gap-x-4 py-1.5">
            <span className="min-w-0 flex-1 text-[0.88rem] leading-snug">{habit.name}</span>
            <span className="tnum shrink-0 text-[11px] text-muted-foreground">
              {intended === null
                ? kept === 0
                  ? "None yet"
                  : `${kept} ${kept === 1 ? "day" : "days"}`
                : `${kept} of ${intended}`}
              {/* The days themselves, not the word "set days", which says nothing. */}
              {intent?.days && (
                <span className="ml-1.5 text-muted-foreground/70">
                  {intent.days.length === 7
                    ? "every day"
                    : intent.days.map((d) => DAY_INITIAL[d]).join(" ")}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {aimed.length > 0 && (
        /*
          One sentence, and a count rather than a verdict. Not "you hit 2 of 3
          targets", which invites a score: just how many practices are where
          their own number said, with the week still running.
        */
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          {`${keptSoFar} of the ${meantTo} days you meant to, so far this week.`}
          {today <= days[days.length - 1] && " There is still week left."}
        </p>
      )}
    </section>
  );
}
