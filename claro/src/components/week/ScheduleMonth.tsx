import { useClaro } from "@/lib/claro-store";
import { monthGrid, monthOfDay } from "@/lib/calendar";
import { labelsOf } from "@/lib/day-labels";
import {
  formatDayLong,
  formatTimeLabel,
  formatWeekNumber,
  hourOf,
  minutesOf,
  weekOfDay,
} from "@/lib/dates";
import { readDay } from "@/lib/storage";
import { resolveSchedule } from "@/lib/schedule";
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
  const { state } = useClaro();
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
  state,
}: {
  weekId: WeekId;
  hasToday: boolean;
  row: { dayId: ISODate; inMonth: boolean }[];
  todayId: ISODate;
  onOpenWeek: (weekId: WeekId) => void;
  onOpenDay: (dayId: ISODate) => void;
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
        const rows = resolveSchedule(
          readDay(state, cell.dayId),
          state.habits,
          state.habitCompletions,
        )
          .filter((item) => item.item.carriedTo == null)
          .sort(
            (a, b) =>
              hourOf(a.item.time).localeCompare(hourOf(b.item.time)) ||
              minutesOf(a.item.time) - minutesOf(b.item.time),
          );

        return (
          <button
            key={cell.dayId}
            type="button"
            onClick={() => onOpenDay(cell.dayId)}
            aria-label={`Open ${formatDayLong(cell.dayId)} on Daily`}
            className={cn(
              "min-h-[4.5rem] rounded-md border border-transparent p-1 text-left transition-colors hover:border-border hover:bg-muted/50",
              // A day from a neighbouring month is context, not content.
              !cell.inMonth && "opacity-40",
              cell.dayId === todayId && "bg-gold/10",
            )}
          >
            <span
              className={cn(
                "tnum block px-0.5 text-[11px] leading-none",
                cell.dayId === todayId ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {Number(cell.dayId.slice(-2))}
            </span>

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
              {rows.slice(0, SHOWN).map((item) => (
                <span
                  key={item.item.id}
                  title={`${formatTimeLabel(item.item.time)} · ${item.title}`}
                  className={cn(
                    "block truncate rounded px-1 py-0.5 text-[10px] leading-tight",
                    item.kind === "block" ? "bg-muted" : "bg-gold/20",
                    item.done && "text-muted-foreground line-through",
                  )}
                >
                  {item.title || "Untitled"}
                </span>
              ))}
              {/*
                Past three the cell stops listing and says how many are left.
                Squeezing six blocks into 72px makes every one of them
                unreadable, which serves nobody.
              */}
              {rows.length > SHOWN && (
                <span className="block px-1 text-[10px] text-muted-foreground">
                  {rows.length - SHOWN} more
                </span>
              )}
            </span>
          </button>
        );
      })}
    </>
  );
}
