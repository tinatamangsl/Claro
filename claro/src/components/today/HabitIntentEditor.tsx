import { Check } from "lucide-react";

import { EditableText } from "@/components/EditableText";
import { weeklyIntent } from "@/lib/habits";
import { WEEKDAYS, type Habit, type Weekday } from "@/lib/types";
import { cn } from "@/lib/utils";

const INITIAL: Record<Weekday, string> = {
  1: "M",
  2: "T",
  3: "W",
  4: "T",
  5: "F",
  6: "S",
  7: "S",
};

const FULL: Record<Weekday, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

/**
 * Renaming a habit, and saying how often it is meant to happen.
 *
 * Inline, under the row it belongs to, rather than in a dialog: this app edits
 * in place everywhere and has no modal primitive to borrow.
 *
 * **Two ways to say the same thing, and they are not independent.** A number
 * covers "four times, whenever it fits"; pinned days cover "Mondays and
 * Thursdays, because the day is the point". Pinning days sets the number, and
 * clearing them hands it back, because a row that read "1 of 3" with two days
 * marked would be a puzzle rather than a prompt. `weeklyIntent` is where that
 * rule lives; this only has to present it.
 *
 * Nothing here is required. "Any day" is a real answer and the default one: a
 * habit with no target is a habit you simply do, and the row goes on counting
 * plain days exactly as it did before targets existed.
 */
export function HabitIntentEditor({
  habit,
  onPatch,
  onDone,
}: {
  habit: Habit;
  onPatch: (patch: Partial<Habit>) => void;
  onDone: () => void;
}) {
  const intent = weeklyIntent(habit);
  const pinned = habit.targetDays ?? [];
  const count = intent?.count ?? 0;

  const toggleDay = (day: Weekday) => {
    const next = pinned.includes(day) ? pinned.filter((d) => d !== day) : [...pinned, day];
    onPatch({
      targetDays: next.sort((a, b) => a - b),
      // Pinning days sets the number too, so the two can never disagree.
      targetPerWeek: next.length > 0 ? next.length : (habit.targetPerWeek ?? null),
    });
  };

  const setCount = (next: number) => {
    // Choosing a plain number means the days stop being the point.
    onPatch({ targetPerWeek: next > 0 ? next : null, targetDays: [] });
  };

  return (
    <div className="col-span-full border-t border-subtle bg-muted/25 px-1 py-3">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <label className="min-w-[10rem] flex-1">
          <span className="eyebrow block text-[9px]">Name</span>
          <EditableText
            value={habit.name}
            onCommit={(name) => name.trim() && onPatch({ name: name.trim() })}
            ariaLabel={`Rename ${habit.name}`}
            className="mt-0.5 w-full text-[0.9rem]"
            onEnter={onDone}
          />
        </label>

        <div>
          <span className="eyebrow block text-[9px]">Days a week</span>
          <div role="group" aria-label={`How many days a week for ${habit.name}`} className="mt-1 flex gap-1">
            {/* "Any" is the default and a real answer, not an empty state. */}
            <button
              type="button"
              onClick={() => setCount(0)}
              aria-pressed={count === 0}
              className={cn("habit-target", count === 0 ? "habit-target-on" : "habit-target-off")}
            >
              Any
            </button>
            {WEEKDAYS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                aria-pressed={count === n && pinned.length === 0}
                aria-label={`${n} ${n === 1 ? "day" : "days"} a week`}
                className={cn(
                  "habit-target tnum",
                  count === n && pinned.length === 0 ? "habit-target-on" : "habit-target-off",
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="eyebrow block text-[9px]">Particular days</span>
          <div role="group" aria-label={`Which days for ${habit.name}`} className="mt-1 flex gap-1">
            {WEEKDAYS.map((day) => {
              const on = pinned.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  aria-pressed={on}
                  aria-label={`${FULL[day]}${on ? ", intended" : ""}`}
                  className={cn("habit-target", on ? "habit-target-on" : "habit-target-off")}
                >
                  {INITIAL[day]}
                </button>
              );
            })}
          </div>
        </div>

        <button type="button" onClick={onDone} className="btn btn-sm btn-quiet gap-1.5">
          <Check aria-hidden className="h-3.5 w-3.5" />
          Done
        </button>
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
        {pinned.length > 0
          ? "Pinned days are marked on the week. Doing it on another day still counts."
          : count > 0
            ? "Any days count. This is the number the week is read against."
            : "No target. The week just shows the days you kept it."}
      </p>
    </div>
  );
}
