import { ArrowUpRight, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";

import {
  HOUR_TAKEN_NOTE,
  SLOTS_FULL_NOTE,
  freeHours,
  freePriorityKey,
  planBlock,
} from "@/lib/day-plan";
import { resolveSchedule } from "@/lib/schedule";
import { formatDayLong, formatTimeLabel } from "@/lib/dates";
import { Picker } from "@/components/Picker";
import { cn } from "@/lib/utils";
import type { Day, Habit, HabitCompletion, ISODate } from "@/lib/types";

type Props = {
  dayId: ISODate;
  day: Day;
  /** Passed through so a linked row reads its source rather than a copy. */
  habits: Record<string, Habit>;
  completions: Record<string, HabitCompletion>;
  onUpdate: (recipe: (day: Day) => Day) => void;
};

/**
 * What is on a day, and a way to put something else there, without leaving the
 * month.
 *
 * The blocks written here are the day's own `scheduleItems`, the same records
 * Today renders. There is no separate store of calendar events: two stores of
 * the same thing is how a planner and a calendar start disagreeing about what
 * is happening on Thursday.
 */
export function DayPlanner({ dayId, day, habits, completions, onUpdate }: Props) {
  const hours = freeHours(day);
  const [time, setTime] = useState(() => hours.find((h) => h === "09:00") ?? hours[0] ?? "09:00");
  const [text, setText] = useState("");
  const [asPriority, setAsPriority] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const rows = resolveSchedule(day, habits, completions)
    .filter((row) => row.item.carriedTo == null)
    .sort((a, b) => a.item.time.localeCompare(b.item.time));
  const slotsFree = freePriorityKey(day) !== null;

  const add = () => {
    const result = planBlock(day, { time, text, asPriority }, new Date());
    if (!result.ok) {
      setNote(result.reason === "hourTaken" ? HOUR_TAKEN_NOTE : null);
      return;
    }
    onUpdate(() => result.day);
    setText("");
    setNote(result.slotsFull ? SLOTS_FULL_NOTE : null);
    // Move to the next free hour so a run of entries does not fight the picker.
    const next = freeHours(result.day);
    if (!next.includes(time)) setTime(next[0] ?? time);
  };

  return (
    <div className="surface mt-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[0.94rem] font-medium">{formatDayLong(dayId)}</h3>
        <Link
          to="/today"
          search={{ d: dayId }}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Open the full day
          <ArrowUpRight aria-hidden className="h-3 w-3" />
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-2 text-[0.85rem] text-muted-foreground">Nothing scheduled yet.</p>
      ) : (
        <ul className="mt-2.5 divide-y divide-subtle">
          {rows.map((row) => (
            <li key={row.item.id} className="flex items-baseline gap-3 py-1.5">
              <span className="tnum w-14 shrink-0 text-[11px] text-muted-foreground">
                {formatTimeLabel(row.item.time)}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 text-[0.88rem] leading-snug",
                  row.done && "strike-done text-muted-foreground",
                )}
              >
                {row.title}
              </span>
              {row.item.link?.kind === "priority" && (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  priority
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 border-t border-border/70 pt-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex w-28 flex-col gap-1">
            <span className="text-[10px] text-muted-foreground">Time</span>
            <Picker
              value={time}
              onChange={setTime}
              label="Time for this block"
              placeholder="Pick a time"
              options={hours.map((slot) => ({ value: slot, label: formatTimeLabel(slot) }))}
            />
          </div>

          <label className="flex min-w-[9rem] flex-1 flex-col gap-1">
            <span className="text-[10px] text-muted-foreground">What is happening</span>
            <input
              type="text"
              value={text}
              placeholder="Dentist, deep work, dinner…"
              aria-label="What is happening"
              onChange={(e) => {
                setText(e.target.value);
                setNote(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              className="rounded-md border border-border bg-card px-2.5 py-1.5 text-[0.88rem]"
            />
          </label>

          <button type="button" onClick={add} className="btn btn-sm btn-primary gap-1.5">
            <Plus aria-hidden className="h-3.5 w-3.5" />
            Add
          </button>
        </div>

        {/*
          The question, asked at the moment it is answerable. A block and a
          priority are the same piece of work when this is ticked, not two
          records that can drift apart.
        */}
        <label className="mt-2.5 flex items-center gap-2 text-[0.85rem]">
          <input
            type="checkbox"
            checked={asPriority}
            onChange={(e) => {
              setAsPriority(e.target.checked);
              setNote(null);
            }}
            className="h-3.5 w-3.5 accent-[var(--primary)]"
          />
          Make this one of that day's three priorities
          {!slotsFree && (
            <span className="text-[11px] text-muted-foreground">(all three taken)</span>
          )}
        </label>

        {note && (
          <p role="status" className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}
