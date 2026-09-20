import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";

import { WeekCellComposer } from "./WeekCellComposer";

import { useClaro } from "@/lib/claro-store";
import {
  SCHEDULE_HOURS,
  formatDayLong,
  formatDayOfMonth,
  formatHourLabel,
  formatTimeLabel,
  formatWeekdayShort,
  hourOf,
  minutesOf,
  weekDayIds,
} from "@/lib/dates";
import { readDay } from "@/lib/storage";
import { moveBlock } from "@/lib/week-plan";
import { resolveSchedule, type ResolvedSchedule } from "@/lib/schedule";
import { cn } from "@/lib/utils";
import type { ISODate, WeekId } from "@/lib/types";

/** The hours an empty week opens on, so there is somewhere to click. */
const EMPTY_WINDOW: [string, string] = ["08:00", "18:00"];

/** How far the pointer moves before a press becomes a drag rather than a tap. */
const DRAG_THRESHOLD = 5;

/** A block being pressed, which may or may not turn into a drag. */
type Press = { id: string; from: ISODate; title: string; x: number; y: number };

/**
 * The week as a time grid: seven columns of hours, with what is booked in them.
 *
 * **This is the one view Claro did not have.** `SCHEDULE_HOURS` appeared in a
 * single component before this, and that component draws one day. Somebody
 * could fill Monday to Friday an hour at a time and never once see the shape of
 * the week they had built, which is the question a week page exists to answer.
 *
 * It writes, but it never keeps anything of its own: every cell edits the
 * `Day` it is drawn under, through the same `updateDay` Daily uses. A second
 * store of schedule items is how a planner and a calendar start disagreeing
 * about Thursday. Seeing the week and then having to go elsewhere to change it
 * is the other half of the job, so both the drag and the composer write
 * straight through.
 *
 * The hours drawn are only the ones the week actually uses, bounded by the
 * earliest and latest thing booked. Eighteen empty rows is a spreadsheet; four
 * rows around a 9am and a 4pm is a week somebody can read at a glance.
 */
export function ScheduleWeek({
  weekId,
  todayId,
  onOpenDay,
}: {
  weekId: WeekId;
  todayId: ISODate;
  /** Opening a day on Daily, so the grid never has to know about routing. */
  onOpenDay: (dayId: ISODate) => void;
}) {
  const { state, updateDay } = useClaro();
  /** The cell being written into, as `dayId|hour`. */
  const [composing, setComposing] = useState<string | null>(null);
  /** What the drag looks like: the block lifted, the cell under it, the chip. */
  const [heldId, setHeldId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [chip, setChip] = useState<{ title: string; x: number; y: number } | null>(null);

  const days = weekDayIds(weekId);

  const drop = (press: Press, toDay: ISODate, hour: string) => {
    const moved = moveBlock(readDay(state, press.from), readDay(state, toDay), press.id, hour);
    if (!moved) return;

    /*
     * Two writes when the day changes, because a move across days is the block
     * leaving one record and joining another. Both go through `updateDay`, the
     * same writer Daily uses, so there is still one store of schedule items.
     */
    updateDay(press.from, () => moved.from);
    if (toDay !== press.from) updateDay(toDay, () => moved.to);
  };

  /*
   * Pointer events rather than the browser's own drag-and-drop.
   *
   * HTML5 dragging does not exist on a touch screen, and a week grid that can
   * only be rearranged with a mouse is half a feature. This is also the model
   * the rest of Claro already drags by, so there is one answer to "how do
   * things move here" rather than two.
   *
   * The listeners live on the window and read through refs, so a press that
   * leaves the cell it started in is still followed, and re-rendering the grid
   * mid-drag cannot detach them.
   */
  const press = useRef<Press | null>(null);
  const dragging = useRef(false);
  const overRef = useRef<string | null>(null);
  /** A drag that ends on its own block would otherwise also read as a click. */
  const dragged = useRef(false);
  const dropRef = useRef(drop);
  dropRef.current = drop;

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const held = press.current;
      if (!held) return;

      if (!dragging.current) {
        const far = Math.hypot(event.clientX - held.x, event.clientY - held.y) > DRAG_THRESHOLD;
        if (!far) return;
        dragging.current = true;
        setHeldId(held.id);
        // A drag that also sweeps a text selection behind it looks broken.
        window.getSelection?.()?.removeAllRanges();
      }

      event.preventDefault();
      setChip({ title: held.title, x: event.clientX, y: event.clientY });

      const under = document
        .elementFromPoint?.(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-cell]");
      const cell = under?.dataset.cell ?? null;
      overRef.current = cell;
      setOver(cell);
    };

    const end = () => {
      const held = press.current;
      press.current = null;
      if (!dragging.current) return;

      dragging.current = false;
      dragged.current = true;
      const target = overRef.current;
      overRef.current = null;
      setHeldId(null);
      setOver(null);
      setChip(null);

      if (!held || !target) return;
      const [dayId, hour] = target.split("|");
      dropRef.current(held, dayId, hour);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  const byDay = new Map<ISODate, ResolvedSchedule[]>(
    days.map((dayId) => [
      dayId,
      resolveSchedule(readDay(state, dayId), state.habits, state.habitCompletions).filter(
        (row) => row.item.carriedTo == null,
      ),
    ]),
  );

  const booked = [...byDay.values()].flat();

  /*
   * Only the hours in use, plus one either side so the first and last things
   * are not flush against the edge. A week with one 9am meeting should be four
   * rows, not eighteen. An empty week opens on a working day rather than on
   * nothing, because a grid you cannot click is not a way to plan a week.
   */
  const used = booked.map((row) => SCHEDULE_HOURS.indexOf(hourOf(row.item.time)));
  const first = booked.length
    ? Math.max(0, Math.min(...used) - 1)
    : SCHEDULE_HOURS.indexOf(EMPTY_WINDOW[0]);
  const last = booked.length
    ? Math.min(SCHEDULE_HOURS.length - 1, Math.max(...used) + 1)
    : SCHEDULE_HOURS.indexOf(EMPTY_WINDOW[1]);
  const hours = SCHEDULE_HOURS.slice(first, last + 1);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[38rem]">
        {booked.length === 0 && (
          <p className="pb-2 text-[0.8rem] leading-relaxed text-muted-foreground">
            Nothing is on this week yet. Click an hour to put something in it.
          </p>
        )}

        {/* One grid, so the day headings cannot drift from the columns. */}
        <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] gap-px">
          <span aria-hidden />
          {days.map((dayId) => (
            <button
              key={dayId}
              type="button"
              onClick={() => onOpenDay(dayId)}
              aria-label={`Open ${formatDayLong(dayId)} on Daily`}
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
            </button>
          ))}

          {hours.map((hour) => (
            <Row
              key={hour}
              hour={hour}
              days={days}
              byDay={byDay}
              todayId={todayId}
              heldId={heldId}
              over={over}
              composing={composing}
              onPress={(next) => {
                /*
                 * Cleared on every press, not only when a click follows one.
                 * A drag released over empty space is never followed by a
                 * click, and a flag left standing would swallow the next
                 * genuine tap on a block.
                 */
                dragged.current = false;
                press.current = next;
              }}
              onClickBlock={(dayId) => {
                // The tail of a drag, not a click on the block it landed on.
                if (dragged.current) {
                  dragged.current = false;
                  return;
                }
                onOpenDay(dayId);
              }}
              onCompose={setComposing}
            />
          ))}
        </div>
      </div>

      {/*
        The block travelling with the pointer. Portalled, because the grid
        scrolls inside `overflow-x-auto` and anything positioned within it is
        clipped at the edge of the panel no matter what its z-index says.
      */}
      {chip &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            aria-hidden
            style={{ left: chip.x + 10, top: chip.y + 10 }}
            className="pointer-events-none fixed z-50 max-w-[12rem] truncate rounded bg-card px-1.5 py-1 text-[11px] leading-tight shadow-md ring-1 ring-primary/40"
          >
            {chip.title || "Untitled"}
          </span>,
          document.body,
        )}
    </div>
  );
}

function Row({
  hour,
  days,
  byDay,
  todayId,
  heldId,
  over,
  composing,
  onPress,
  onClickBlock,
  onCompose,
}: {
  hour: string;
  days: ISODate[];
  byDay: Map<ISODate, ResolvedSchedule[]>;
  todayId: ISODate;
  heldId: string | null;
  over: string | null;
  composing: string | null;
  onPress: (press: Press | null) => void;
  onClickBlock: (dayId: ISODate) => void;
  onCompose: (cell: string | null) => void;
}) {
  return (
    <>
      <span className="tnum pt-1.5 pr-1.5 text-right text-[10px] leading-none text-muted-foreground">
        {formatHourLabel(hour)}
      </span>
      {days.map((dayId) => {
        const cell = `${dayId}|${hour}`;
        const rows = (byDay.get(dayId) ?? [])
          .filter((row) => hourOf(row.item.time) === hour)
          .sort((a, b) => minutesOf(a.item.time) - minutesOf(b.item.time));

        return (
          <div
            key={dayId}
            // The drop target, found by hit-testing the pointer rather than by
            // a registry of rectangles that scrolling would put out of date.
            data-cell={cell}
            className={cn(
              "flex min-h-[2.1rem] flex-col gap-0.5 border-t border-subtle p-0.5 transition-colors",
              dayId === todayId && "bg-gold/[0.06]",
              over === cell && "bg-primary/15 ring-1 ring-primary/40",
            )}
          >
            {rows.map((row) => (
              <button
                key={row.item.id}
                type="button"
                onPointerDown={(event) =>
                  onPress(
                    row.kind === "block" && event.button === 0
                      ? {
                          id: row.item.id,
                          from: dayId,
                          title: row.title,
                          x: event.clientX,
                          y: event.clientY,
                        }
                      : null,
                  )
                }
                onClick={() => onClickBlock(dayId)}
                aria-label={`${row.title || "Untitled"} at ${formatTimeLabel(row.item.time)} on ${formatDayLong(dayId)}`}
                title={`${formatTimeLabel(row.item.time)} · ${row.title}`}
                className={cn(
                  "block w-full truncate rounded px-1.5 py-1 text-left text-[11px] leading-tight transition-colors",
                  /*
                   * A linked row borrows its words from a priority, an action
                   * or a habit, so it is tinted to say it belongs to something
                   * else, and it does not drag: moving it would move the
                   * booking and leave the record it points at behind.
                   */
                  row.kind === "block"
                    ? "cursor-grab touch-none select-none bg-muted text-foreground hover:bg-muted/70 active:cursor-grabbing"
                    : "bg-gold/20 text-foreground hover:bg-gold/30",
                  heldId === row.item.id && "opacity-40",
                  row.done && "text-muted-foreground line-through decoration-muted-foreground/60",
                )}
              >
                <span className="tnum text-muted-foreground">
                  {minutesOf(row.item.time) === 0 ? "" : `${formatTimeLabel(row.item.time)} `}
                </span>
                {row.title || "Untitled"}
              </button>
            ))}

            {composing === cell ? (
              <WeekCellComposer dayId={dayId} hour={hour} onClose={() => onCompose(null)} />
            ) : (
              /*
                A real button rather than a click handler on the cell: it is
                reachable, it can be named, and the name is what the tests find
                it by. It shows itself only on hover so that seventy plus signs
                do not compete with the week.
              */
              <button
                type="button"
                onClick={() => onCompose(cell)}
                aria-label={`Add at ${formatHourLabel(hour)} on ${formatDayLong(dayId)}`}
                className="flex min-h-[1.1rem] flex-1 items-center justify-center rounded text-transparent transition-colors hover:bg-muted/70 hover:text-muted-foreground focus-visible:bg-muted/70 focus-visible:text-muted-foreground"
              >
                <Plus className="h-3 w-3" aria-hidden />
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}
