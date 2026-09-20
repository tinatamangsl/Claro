import { Link } from "@tanstack/react-router";

import { useClaro } from "@/lib/claro-store";
import { monthGrid, monthOfDay } from "@/lib/calendar";
import { formatTimeLabel, hourOf, minutesOf } from "@/lib/dates";
import { readDay } from "@/lib/storage";
import { resolveSchedule } from "@/lib/schedule";
import { cn } from "@/lib/utils";
import type { ISODate } from "@/lib/types";

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
 * Read-only, like the week grid beside it. Every block belongs to a `Day`, and
 * the way to change one is to open that day.
 */
export function ScheduleMonth({ anchor, todayId }: { anchor: ISODate; todayId: ISODate }) {
  const { state } = useClaro();
  const monthId = monthOfDay(anchor);
  const cells = monthGrid(monthId);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[34rem]">
        <div className="grid grid-cols-7 gap-px">
          {WEEKDAYS.map((name) => (
            <span key={name} className="eyebrow px-1 pb-1 text-center text-[9px]">
              {name}
            </span>
          ))}

          {cells.map((cell) => {
            const rows = resolveSchedule(
              readDay(state, cell.dayId),
              state.habits,
              state.habitCompletions,
            )
              .filter((row) => row.item.carriedTo == null)
              .sort(
                (a, b) =>
                  hourOf(a.item.time).localeCompare(hourOf(b.item.time)) ||
                  minutesOf(a.item.time) - minutesOf(b.item.time),
              );

            return (
              <Link
                key={cell.dayId}
                to="/today"
                search={cell.dayId === todayId ? {} : { d: cell.dayId }}
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
                    cell.dayId === todayId
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {Number(cell.dayId.slice(-2))}
                </span>

                <span className="mt-1 block space-y-0.5">
                  {rows.slice(0, SHOWN).map((row) => (
                    <span
                      key={row.item.id}
                      title={`${formatTimeLabel(row.item.time)} · ${row.title}`}
                      className={cn(
                        "block truncate rounded px-1 py-0.5 text-[10px] leading-tight",
                        row.kind === "block" ? "bg-muted" : "bg-gold/20",
                        row.done && "text-muted-foreground line-through",
                      )}
                    >
                      {row.title || "Untitled"}
                    </span>
                  ))}
                  {/*
                    Past three the cell stops listing and says how many are
                    left. Squeezing six blocks into 72px makes every one of them
                    unreadable, which serves nobody.
                  */}
                  {rows.length > SHOWN && (
                    <span className="block px-1 text-[10px] text-muted-foreground">
                      {rows.length - SHOWN} more
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
