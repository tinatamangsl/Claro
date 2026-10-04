import { useClaro } from "@/lib/claro-store";
import { monthGrid, monthOfDay } from "@/lib/calendar";
import { labelsOf } from "@/lib/day-labels";
import { initiativeOn, labelledActions } from "@/lib/initiatives";
import {
  formatDayLong,
  formatTimeLabel,
  formatWeekNumber,
  hourOf,
  minutesOf,
  weekOfDay,
} from "@/lib/dates";
import { readDay } from "@/lib/storage";
import { resolveSchedule, scheduleHabitToggle, toggleScheduleItem } from "@/lib/schedule";
import { toggleAction } from "@/lib/week-plan";
import { cn } from "@/lib/utils";
import type { ClaroState, ISODate, WeekId } from "@/lib/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** How many blocks a cell shows before it stops listing and starts counting. */
const SHOWN = 3;

/**
 * The month, as what is booked in it.
 *
 * **This is not the month on `/calendar`, and the difference is the reason
 * both exist.** That one answers "how did my month go": habits kept, focus
 * time, days with something on them, all as counts. This one answers "what is
 * on my month", which is a different question asked at a different moment, and
 * a count of three cannot answer it — you need the words.
 *
 * Read-only, and it stays that way: a cell seventy pixels tall cannot hold an
 * editor worth using. What it offers instead is the way down. The week numbers
 * down the left open that week in the grid beside this one, and a day opens
 * Daily, so month to week to day is two clicks and neither is a guess.
 */
export function ScheduleMonth({
  anchor,
  todayId,
  onOpenWeek,
  onOpenDay,
}: {
  anchor: ISODate;
  todayId: ISODate;
  onOpenWeek: (weekId: WeekId) => void;
  onOpenDay: (dayId: ISODate) => void;
}) {
  const { state, updateDay, toggleHabitDone } = useClaro();

  /*
   * Ticking from the month, in place. The same branch the week grid makes: a
   * habit's completion is one row per habit per day and lives outside the
   * `Day`, so it goes to the store's own toggle rather than being written
   * here.
   */
  const onTick = (item: { kind: "block" | "action"; dayId: ISODate; id: string }) => {
    if (item.kind === "action") {
      updateDay(item.dayId, (d) => toggleAction(d, item.id));
      return;
    }
    const habitId = scheduleHabitToggle(readDay(state, item.dayId), item.id);
    if (habitId) toggleHabitDone(habitId, item.dayId, new Date());
    else updateDay(item.dayId, (d) => toggleScheduleItem(d, item.id));
  };
  const monthId = monthOfDay(anchor);
  const cells = monthGrid(monthId);

  /** Six rows of seven, so each row is one ISO week. */
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[36rem]">
        <div className="grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] gap-px">
          <span aria-hidden />
          {WEEKDAYS.map((name) => (
            <span key={name} className="eyebrow px-1 pb-1 text-center text-[9px]">
              {name}
            </span>
          ))}

          {weeks.map((row) => {
            const weekId = weekOfDay(row[0].dayId);
            const hasToday = row.some((cell) => cell.dayId === todayId);

            return (
              <WeekRow
                key={weekId}
                weekId={weekId}
                hasToday={hasToday}
                row={row}
                todayId={todayId}
                onOpenWeek={onOpenWeek}
                onOpenDay={onOpenDay}
                onTick={onTick}
                state={state}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeekRow({
  weekId,
  hasToday,
  row,
  todayId,
  onOpenWeek,
  onOpenDay,
  onTick,
  state,
}: {
  weekId: WeekId;
  hasToday: boolean;
  row: { dayId: ISODate; inMonth: boolean }[];
  todayId: ISODate;
  onOpenWeek: (weekId: WeekId) => void;
  onOpenDay: (dayId: ISODate) => void;
  onTick: (item: { kind: "block" | "action"; dayId: ISODate; id: string }) => void;
  state: ClaroState;
}) {
  return (
    <>
      {/*
        The week number as the way in, the way a paper diary and every desk
        calendar mark the weeks down the margin. It is the only control on this
        view that changes what you are looking at rather than where you are.
      */}
      <button
        type="button"
        onClick={() => onOpenWeek(weekId)}
        aria-label={`Open ${formatWeekNumber(weekId)} in the week grid`}
        title={`Open ${formatWeekNumber(weekId)}`}
        className={cn(
          "tnum rounded-l-md pt-1.5 text-center text-[10px] leading-none transition-colors hover:bg-muted hover:text-foreground",
          hasToday ? "text-foreground" : "text-muted-foreground/70",
        )}
      >
        {Number(weekId.split("-W")[1])}
      </button>

      {row.map((cell) => {
        const day = readDay(state, cell.dayId);
        const rows = resolveSchedule(day, state.habits, state.habitCompletions)
          .filter((item) => item.item.carriedTo == null)
          .sort(
            (a, b) =>
              hourOf(a.item.time).localeCompare(hourOf(b.item.time)) ||
              minutesOf(a.item.time) - minutesOf(b.item.time),
          );

        /*
         * An initiative's dated work is mostly actions, not bookings: a
         * Substack Saturday and a midpoint review have no time on them and
         * would otherwise be invisible on the one view meant to answer "what
         * is on my month". They come first in the cell, because the point of
         * a milestone is that it is not one of the ordinary rows.
         */
        const running = initiativeOn(state, cell.dayId);
        const milestones = running ? labelledActions(day, running.id) : [];

        const entries = [
          ...milestones.map((action) => ({
            id: action.id,
            title: action.text,
            done: action.done,
            kind: "milestone" as const,
            tick: () => onTick({ kind: "action", dayId: cell.dayId, id: action.id }),
          })),
          ...rows.map((item) => ({
            id: item.item.id,
            title: `${formatTimeLabel(item.item.time)} · ${item.title}`,
            done: item.done,
            kind: item.kind === "block" ? ("block" as const) : ("linked" as const),
            tick: () => onTick({ kind: "block", dayId: cell.dayId, id: item.item.id }),
          })),
        ];

        return (
          /*
            A container, not one big button. The cell used to be a single
            button that opened the day, which made everything inside it
            decoration: there was no way to tick a thing from the month at all.
            The day number opens the day now, and each row answers for itself.
          */
          <div
            key={cell.dayId}
            className={cn(
              "min-h-[4.5rem] rounded-md border border-transparent p-1 text-left transition-colors hover:border-border",
              // A day from a neighbouring month is context, not content.
              !cell.inMonth && "opacity-40",
              cell.dayId === todayId && "bg-gold/10",
            )}
          >
            <button
              type="button"
              onClick={() => onOpenDay(cell.dayId)}
              aria-label={`Open ${formatDayLong(cell.dayId)} on Daily`}
              className={cn(
                "tnum block rounded px-0.5 text-[11px] leading-none transition-colors hover:bg-muted",
                cell.dayId === todayId ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {Number(cell.dayId.slice(-2))}
            </button>

            {/*
              What the day is, above what is in it, the same order the week
              band uses. Leave or an office day frames the rest of the cell.
            */}
            {labelsOf(readDay(state, cell.dayId)).map((label) => (
              <span
                key={label.id}
                title={label.text}
                className="mt-0.5 block truncate rounded bg-gold/25 px-1 text-[10px] leading-tight"
              >
                {label.text}
              </span>
            ))}

            <span className="mt-1 block space-y-0.5">
              {/*
                The whole row is the tick target rather than a circle beside
                it. A 72px cell has no room for a checkbox worth tapping, and
                the strikethrough is the feedback; tapping again is the way
                back, which is how every other tick in Claro behaves.
              */}
              {entries.slice(0, SHOWN).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="checkbox"
                  aria-checked={entry.done}
                  onClick={entry.tick}
                  title={entry.title}
                  aria-label={`${entry.title || "Untitled"} on ${formatDayLong(cell.dayId)}`}
                  className={cn(
                    "block w-full truncate rounded px-1 py-0.5 text-left text-[10px] leading-tight transition-colors",
                    entry.kind === "block" && "bg-muted hover:bg-muted/70",
                    entry.kind === "linked" && "bg-gold/20 hover:bg-gold/30",
                    // A milestone is outlined rather than filled, so it reads
                    // as a marker on the month rather than another booking.
                    entry.kind === "milestone" &&
                      "bg-transparent ring-1 ring-gold/60 hover:bg-gold/15",
                    entry.done && "text-muted-foreground line-through",
                  )}
                >
                  {entry.title || "Untitled"}
                </button>
              ))}
              {/*
                Past three the cell stops listing and says how many are left.
                Squeezing six blocks into 72px makes every one of them
                unreadable, which serves nobody.
              */}
              {entries.length > SHOWN && (
                <span className="block px-1 text-[10px] text-muted-foreground">
                  {entries.length - SHOWN} more
                </span>
              )}
            </span>
          </div>
        );
      })}
    </>
  );
}
