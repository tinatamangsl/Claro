import { Link } from "@tanstack/react-router";

import { useClaro } from "@/lib/claro-store";
import {
  SCHEDULE_HOURS,
  formatDayOfMonth,
  formatHourLabel,
  formatTimeLabel,
  formatWeekdayShort,
  hourOf,
  minutesOf,
  weekDayIds,
} from "@/lib/dates";
import { readDay } from "@/lib/storage";
import { resolveSchedule, type ResolvedSchedule } from "@/lib/schedule";
import { cn } from "@/lib/utils";
import type { ISODate, WeekId } from "@/lib/types";

/**
 * The week as a time grid: seven columns of hours, with what is booked in them.
 *
 * **This is the one view Claro did not have.** `SCHEDULE_HOURS` appeared in a
 * single component before this, and that component draws one day. Somebody
 * could fill Monday to Friday an hour at a time and never once see the shape of
 * the week they had built, which is the question a week page exists to answer.
 *
 * It reads and it never writes. Every block here belongs to a `Day`, so
 * changing one means opening that day, and the whole grid links back to Daily
 * for exactly that. A second place to edit the same records is how a planner
 * and a calendar start disagreeing about Thursday.
 *
 * The hours drawn are only the ones the week actually uses, bounded by the
 * earliest and latest thing booked. Eighteen empty rows is a spreadsheet; four
 * rows around a 9am and a 4pm is a week somebody can read at a glance.
 */
export function ScheduleWeek({ weekId, todayId }: { weekId: WeekId; todayId: ISODate }) {
  const { state } = useClaro();
  const days = weekDayIds(weekId);

  const byDay = new Map<ISODate, ResolvedSchedule[]>(
    days.map((dayId) => [
      dayId,
      resolveSchedule(readDay(state, dayId), state.habits, state.habitCompletions).filter(
        (row) => row.item.carriedTo == null,
      ),
    ]),
  );

  const booked = [...byDay.values()].flat();
  if (booked.length === 0) {
    return (
      <p className="text-[0.85rem] leading-relaxed text-muted-foreground">
        Nothing is on the week yet. Hours filled in on{" "}
        <Link to="/today" className="underline underline-offset-2 hover:text-foreground">
          Daily
        </Link>{" "}
        show up here.
      </p>
    );
  }

  /*
   * Only the hours in use, plus one either side so the first and last things
   * are not flush against the edge. A week with one 9am meeting should be four
   * rows, not eighteen.
   */
  const used = booked.map((row) => SCHEDULE_HOURS.indexOf(hourOf(row.item.time)));
  const from = Math.max(0, Math.min(...used) - 1);
  const to = Math.min(SCHEDULE_HOURS.length - 1, Math.max(...used) + 1);
  const hours = SCHEDULE_HOURS.slice(from, to + 1);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[38rem]">
        {/* One grid, so the day headings cannot drift from the columns. */}
        <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] gap-px">
          <span aria-hidden />
          {days.map((dayId) => (
            <Link
              key={dayId}
              to="/today"
              search={dayId === todayId ? {} : { d: dayId }}
              className={cn(
                "rounded-t-md px-1 py-1.5 text-center transition-colors hover:bg-muted",
                dayId === todayId && "bg-gold/10",
              )}
            >
              <span className="eyebrow block text-[9px]">{formatWeekdayShort(dayId)}</span>
              <span
                className={cn(
                  "tnum mt-0.5 block text-[0.95rem] leading-none",
                  dayId === todayId ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {formatDayOfMonth(dayId)}
              </span>
            </Link>
          ))}

          {hours.map((hour) => (
            <Row key={hour} hour={hour} days={days} byDay={byDay} todayId={todayId} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({
  hour,
  days,
  byDay,
  todayId,
}: {
  hour: string;
  days: ISODate[];
  byDay: Map<ISODate, ResolvedSchedule[]>;
  todayId: ISODate;
}) {
  return (
    <>
      <span className="tnum pt-1.5 pr-1.5 text-right text-[10px] leading-none text-muted-foreground">
        {formatHourLabel(hour)}
      </span>
      {days.map((dayId) => {
        const rows = (byDay.get(dayId) ?? [])
          .filter((row) => hourOf(row.item.time) === hour)
          .sort((a, b) => minutesOf(a.item.time) - minutesOf(b.item.time));

        return (
          <div
            key={dayId}
            className={cn(
              "min-h-[2.1rem] space-y-0.5 border-t border-subtle p-0.5",
              dayId === todayId && "bg-gold/[0.06]",
            )}
          >
            {rows.map((row) => (
              <Link
                key={row.item.id}
                to="/today"
                search={dayId === todayId ? {} : { d: dayId }}
                title={`${formatTimeLabel(row.item.time)} · ${row.title}`}
                className={cn(
                  "block truncate rounded px-1.5 py-1 text-[11px] leading-tight transition-colors",
                  /*
                    A linked row borrows its words from a priority, an action or
                    a habit, so it is tinted to say it belongs to something
                    else. A plain block is the day's own.
                  */
                  row.kind === "block"
                    ? "bg-muted text-foreground hover:bg-muted/70"
                    : "bg-gold/20 text-foreground hover:bg-gold/30",
                  row.done && "text-muted-foreground line-through decoration-muted-foreground/60",
                )}
              >
                <span className="tnum text-muted-foreground">
                  {minutesOf(row.item.time) === 0 ? "" : `${formatTimeLabel(row.item.time)} `}
                </span>
                {row.title || "Untitled"}
              </Link>
            ))}
          </div>
        );
      })}
    </>
  );
}
