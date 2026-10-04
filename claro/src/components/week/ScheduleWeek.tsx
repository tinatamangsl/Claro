import { useEffect, useRef, useState } from "react";

import { CheckToggle } from "@/components/CheckToggle";
import { EditableText } from "@/components/EditableText";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, MoreHorizontal, Plus } from "lucide-react";

import { AllDayRow } from "./AllDayRow";
import { ItemMenu, type ItemAction } from "./ItemMenu";
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
  shiftDayId,
  weekDayIds,
} from "@/lib/dates";
import { labelsOf } from "@/lib/day-labels";
import { initiativeOn, unscheduledActions } from "@/lib/initiatives";
import { readDay } from "@/lib/storage";
import {
  moveActionToDay,
  moveBlock,
  moveBlockTo,
  moveBlockToDay,
  removeAction,
  removeBlock,
  renameAction,
  toggleAction,
} from "@/lib/week-plan";
import {
  renameScheduleItem,
  resolveSchedule,
  scheduleHabitId,
  scheduleHabitToggle,
  toggleScheduleItem,
  type ResolvedSchedule,
} from "@/lib/schedule";
import { cn } from "@/lib/utils";
import type { ISODate, WeekId } from "@/lib/types";

/**
 * The working day the grid always draws, whatever is booked.
 *
 * This used to be the *empty* week's window, and only the empty week's: one
 * block booked at 7 AM collapsed the whole grid to 6, 7 and 8 AM, because the
 * window was the booked hours and nothing else. Every other hour of every day
 * then had no cell to click, so a week with one early thing in it could not be
 * planned at all. The booked hours now widen this rather than replace it.
 */
const DAY_WINDOW: [string, string] = ["08:00", "18:00"];

/** How far the pointer moves before a press becomes a drag rather than a tap. */
const DRAG_THRESHOLD = 5;

/** A block being pressed, which may or may not turn into a drag. */
type Press = { id: string; from: ISODate; title: string; x: number; y: number };

/**
 * One thing on the calendar, whichever band it is drawn in.
 *
 * A booking and an untimed action behave the same way to the person looking at
 * them: both get ticked, moved and let go. They are different records
 * underneath, so the kind travels with the item and the writers branch once,
 * here, rather than in every handler.
 */
type CalItem = {
  kind: "block" | "action";
  dayId: ISODate;
  id: string;
  title: string;
  done: boolean;
  /** The time it sits on, or null for a record that has none. */
  time: string | null;
};

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
  const { state, updateDay, toggleHabitDone, patchHabit, recordUndo } = useClaro();
  /** Opened out to the full 5 AM to 10 PM, once somebody asks for it. */
  const [expanded, setExpanded] = useState(false);
  /** The cell being written into, as `dayId|hour`. */
  const [composing, setComposing] = useState<string | null>(null);
  /** What the drag looks like: the block lifted, the cell under it, the chip. */
  const [heldId, setHeldId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [chip, setChip] = useState<{ title: string; x: number; y: number } | null>(null);

  const days = weekDayIds(weekId);

  /** The menu's anchor and contents, or null when nothing is open. */
  const [menu, setMenu] = useState<{ rect: DOMRect; item: CalItem } | null>(null);

  /*
   * Ticking, from the calendar, without opening the day it sits on. A habit
   * row is handed to the store's own toggle rather than written here, because
   * a habit's completion is one row per habit per day and lives outside the
   * `Day` entirely.
   */
  const tick = (item: CalItem) => {
    if (item.kind === "action") {
      updateDay(item.dayId, (d) => toggleAction(d, item.id));
      return;
    }
    const habitId = scheduleHabitToggle(readDay(state, item.dayId), item.id);
    if (habitId) toggleHabitDone(habitId, item.dayId, new Date());
    else updateDay(item.dayId, (d) => toggleScheduleItem(d, item.id));
  };

  const moveTo = (item: CalItem, toDayId: ISODate) => {
    const from = readDay(state, item.dayId);
    const to = readDay(state, toDayId);
    const moved =
      item.kind === "action"
        ? moveActionToDay(from, to, item.id)
        : moveBlockToDay(from, to, item.id);
    if (!moved) return;

    updateDay(item.dayId, () => moved.from);
    updateDay(toDayId, () => moved.to);
  };

  /*
   * Renaming, through to whatever actually owns the words. A standalone block
   * owns its own; a linked row hands off to the priority, action or habit it
   * points at, so one record changes and every surface showing it follows.
   */
  const rename = (item: CalItem, text: string) => {
    if (item.kind === "action") {
      updateDay(item.dayId, (d) => renameAction(d, item.id, text));
      return;
    }
    const habitId = scheduleHabitId(readDay(state, item.dayId), item.id);
    if (habitId) patchHabit(habitId, { name: text.trim() });
    else updateDay(item.dayId, (d) => renameScheduleItem(d, item.id, text));
  };

  const moveToSlot = (item: CalItem, toDayId: ISODate, time: string | null) => {
    if (item.kind === "action" || time === null) {
      moveTo(item, toDayId);
      return;
    }
    const moved = moveBlockTo(readDay(state, item.dayId), readDay(state, toDayId), item.id, time);
    if (!moved) return;

    updateDay(item.dayId, () => moved.from);
    if (toDayId !== item.dayId) updateDay(toDayId, () => moved.to);
  };

  const letGo = (item: CalItem) => {
    recordUndo(item.kind === "action" ? "Action deleted" : "Block deleted");
    updateDay(item.dayId, (d) =>
      item.kind === "action" ? removeAction(d, item.id) : removeBlock(d, item.id),
    );
  };

  /**
   * What a calendar item offers, in the order the decisions actually come up.
   *
   * Done first because it is the one asked constantly. Then the two moves
   * somebody reaches for when a day slips, which is the other half of what
   * happens to a plan and the half dragging cannot reach, since the day being
   * moved to is usually off this grid. Letting go sits apart at the foot: it
   * is not a move, and it should take a deliberate look.
   */
  const actionsFor = (item: CalItem): ItemAction[] => [
    {
      id: "done",
      label: item.done ? "Mark as not done" : "Mark as done",
      run: () => tick(item),
    },
    { id: "open", label: "Open on Daily", run: () => onOpenDay(item.dayId) },
    { id: "remove", label: "Let it go", destructive: true, run: () => letGo(item) },
  ];

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
   * A week with leave written across it is not an empty week, even with no
   * hours booked, so the prompt to fill one stands down.
   */
  const labelled = days.some((dayId) => labelsOf(readDay(state, dayId)).length > 0);

  /*
   * A working day, widened by anything booked outside it, plus one hour either
   * side so the earliest and latest things are not flush against the edge.
   *
   * Widened rather than replaced. Eighteen rows every time is a spreadsheet,
   * but a window that only ever covers what is already booked is worse: it
   * leaves most of the week with no cell to click, which is exactly the state
   * a half-empty week is in when you sit down to fill it. The hours outside
   * are one press away.
   */
  const used = booked.map((row) => SCHEDULE_HOURS.indexOf(hourOf(row.item.time)));
  const last = SCHEDULE_HOURS.length - 1;
  const from = expanded
    ? 0
    : Math.max(0, Math.min(SCHEDULE_HOURS.indexOf(DAY_WINDOW[0]), ...used.map((i) => i - 1)));
  const to = expanded
    ? last
    : Math.min(last, Math.max(SCHEDULE_HOURS.indexOf(DAY_WINDOW[1]), ...used.map((i) => i + 1)));
  const hours = SCHEDULE_HOURS.slice(from, to + 1);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[38rem]">
        {booked.length === 0 && !labelled && (
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

          {/*
            What the days *are*, before what is in them. It sits under the
            headings and above the hours because that is where every calendar
            puts it, and because leave or an office day frames how the hours
            below should be read.
          */}
          <AllDayRow days={days} />

          {/*
            An initiative's dated work is mostly actions, and an action has no
            time until one is given to it. Drawn only in the hours below, a
            week holding a content day, a Substack block and a review looked
            like a week with one run club in it. The month grid already showed
            them; this is the same answer on the view you plan the week from.
          */}
          <PlannedRow
            days={days}
            todayId={todayId}
            onTick={tick}
            onRename={rename}
            onMenu={(rect, item) => setMenu({ rect, item })}
          />

          {from > 0 && (
            <MoreHours
              direction="up"
              label={`Earlier, from ${formatHourLabel(SCHEDULE_HOURS[0])}`}
              onClick={() => setExpanded(true)}
            />
          )}

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
              onClickBlock={(rect, item) => {
                // The tail of a drag, not a click on the block it landed on.
                if (dragged.current) {
                  dragged.current = false;
                  return;
                }
                setMenu({ rect, item });
              }}
              onTick={tick}
              onRename={rename}
              onCompose={setComposing}
            />
          ))}

          {to < last && (
            <MoreHours
              direction="down"
              label={`Later, to ${formatHourLabel(SCHEDULE_HOURS[last])}`}
              onClick={() => setExpanded(true)}
            />
          )}
        </div>
      </div>

      {/*
        The block travelling with the pointer. Portalled, because the grid
        scrolls inside `overflow-x-auto` and anything positioned within it is
        clipped at the edge of the panel no matter what its z-index says.
      */}
      {menu && (
        <ItemMenu
          anchor={menu.rect}
          title={menu.item.title || "Untitled"}
          actions={actionsFor(menu.item)}
          move={{
            fromDayId: menu.item.dayId,
            currentTime: menu.item.time,
            onPick: (dayId, time) => moveToSlot(menu.item, dayId, time),
          }}
          onClose={() => setMenu(null)}
        />
      )}

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

/**
 * The way out to the rest of the day.
 *
 * A full row rather than a control tucked in the time rail, because it is the
 * answer to "there is nowhere to put my 8 PM thing" and that question is asked
 * while looking at the bottom edge of the grid.
 */
function MoreHours({
  direction,
  label,
  onClick,
}: {
  direction: "up" | "down";
  label: string;
  onClick: () => void;
}) {
  const Icon = direction === "up" ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      onClick={onClick}
      /*
        Aligned to where the day columns start, not centred. Centred put the
        label near the middle of a 38rem grid, which is off the right-hand
        edge of a phone: the control that reaches the rest of the day was the
        one control you could not read on the screen that needs it most.
      */
      className="col-span-full flex items-center gap-1 rounded py-1 pl-[3.25rem] text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </button>
  );
}

/**
 * The initiative's untimed work for each day, under the all-day band.
 *
 * Ticked and moved in place, like anything else on the calendar. An action
 * with no hour yet is still the thing that either happened or did not, and
 * sending somebody to Daily to say so was the long way round.
 */
function PlannedRow({
  days,
  todayId,
  onTick,
  onRename,
  onMenu,
}: {
  days: ISODate[];
  todayId: ISODate;
  onTick: (item: CalItem) => void;
  onRename: (item: CalItem, text: string) => void;
  onMenu: (rect: DOMRect, item: CalItem) => void;
}) {
  const { state } = useClaro();

  const byDay = days.map((dayId) => {
    const running = initiativeOn(state, dayId);
    return running ? unscheduledActions(readDay(state, dayId), running.id) : [];
  });
  if (byDay.every((actions) => actions.length === 0)) return null;

  return (
    <div className="col-span-full grid grid-cols-subgrid gap-px border-b border-border/70 pb-1">
      <span className="self-start whitespace-nowrap pr-1.5 pt-0.5 text-right text-[9px] uppercase leading-none text-muted-foreground">
        planned
      </span>
      {days.map((dayId, index) => (
        <div
          key={dayId}
          className={cn("space-y-0.5 py-0.5", dayId === todayId && "bg-gold/[0.06]")}
        >
          {byDay[index].map((action) => {
            const item: CalItem = {
              kind: "action",
              dayId,
              id: action.id,
              title: action.text,
              done: action.done,
              time: null,
            };

            return (
              <div
                key={action.id}
                className="group flex w-full items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-tight ring-1 ring-gold/60 transition-colors hover:bg-gold/15"
              >
                <CheckToggle
                  checked={action.done}
                  onChange={() => onTick(item)}
                  label={`${action.text} on ${formatDayLong(dayId)}`}
                  size="sm"
                  className={cn("rounded-[3px]", !action.done && "reveal-on-hover")}
                />
                <EditableText
                  value={action.text}
                  onCommit={(text) => onRename(item, text)}
                  wrap
                  ariaLabel={`${action.text} on ${formatDayLong(dayId)}`}
                  placeholder="Untitled"
                  className={cn(
                    "-mx-1 min-w-0 flex-1 py-0 text-[10px] leading-tight",
                    action.done &&
                      "text-muted-foreground line-through decoration-muted-foreground/60",
                  )}
                />
                <MoreButton
                  label={`${action.text} on ${formatDayLong(dayId)}`}
                  onOpen={(rect) => onMenu(rect, item)}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * The way into an item's menu.
 *
 * Its own control rather than the words, because the words are now the field
 * you edit: one of them had to give, and renaming is the thing somebody does
 * far more often than moving. It waits for the pointer, like the tick does.
 */
function MoreButton({
  label,
  onOpen,
}: {
  label: string;
  onOpen: (rect: DOMRect) => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => onOpen(event.currentTarget.getBoundingClientRect())}
      aria-label={`${label}. More`}
      aria-haspopup="menu"
      className="reveal-on-hover -mr-0.5 grid h-4 w-4 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
    >
      <MoreHorizontal aria-hidden className="h-3 w-3" />
    </button>
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
  onTick,
  onRename,
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
  onClickBlock: (rect: DOMRect, item: CalItem) => void;
  onTick: (item: CalItem) => void;
  onRename: (item: CalItem, text: string) => void;
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
            {rows.map((row) => {
              const item: CalItem = {
                kind: "block",
                dayId,
                id: row.item.id,
                title: row.title,
                done: row.done,
                time: row.item.time,
              };

              return (
                /*
                  A row, not a single button. The tick, the words and the menu
                  are three different jobs on one line and a button cannot
                  contain another, so the chip is a container holding all three.
                */
                <div
                  key={row.item.id}
                  onPointerDown={(event) => {
                    /*
                     * A press on the words starts a drag, unless somebody is
                     * already editing them. The same rule `ownsItsPress` keeps
                     * on Daily: pointing at text nobody is editing means "I am
                     * pointing at this", and the moment the field is being
                     * edited it owns its own press and selecting a word works.
                     */
                    const target = event.target as HTMLElement;
                    const editing =
                      target instanceof HTMLTextAreaElement && document.activeElement === target;
                    const onControl = target.closest("button") !== null;

                    onPress(
                      row.kind === "block" && event.button === 0 && !editing && !onControl
                        ? {
                            id: row.item.id,
                            from: dayId,
                            title: row.title,
                            x: event.clientX,
                            y: event.clientY,
                          }
                        : null,
                    );
                  }}
                  className={cn(
                    "group flex w-full items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-tight transition-colors",
                    /*
                     * A linked row borrows its words from a priority, an
                     * action or a habit, so it is tinted to say it belongs to
                     * something else, and it does not drag: moving it would
                     * move the booking and leave the record behind.
                     */
                    row.kind === "block"
                      ? "bg-muted hover:bg-muted/70"
                      : "bg-gold/20 hover:bg-gold/30",
                    row.kind === "block" && "cursor-grab touch-none",
                    heldId === row.item.id && "opacity-40",
                  )}
                >
                  <CheckToggle
                    checked={row.done}
                    onChange={() => onTick(item)}
                    label={`${row.title || "Untitled"} at ${formatTimeLabel(row.item.time)} on ${formatDayLong(dayId)}`}
                    size="sm"
                    className={cn("rounded-[3px]", !row.done && "reveal-on-hover")}
                  />

                  <span className="tnum shrink-0 text-muted-foreground">
                    {minutesOf(row.item.time) === 0 ? "" : formatTimeLabel(row.item.time)}
                  </span>

                  {/*
                    Editable in place, and the edit goes to whatever owns the
                    words: a block's own text, or the priority, action or habit
                    a tinted row points at. One record, so Daily and the month
                    show the new words without being told.
                  */}
                  <EditableText
                    value={row.title}
                    onCommit={(text) => onRename(item, text)}
                    wrap
                    ariaLabel={`${row.title || "Untitled"} at ${formatTimeLabel(row.item.time)} on ${formatDayLong(dayId)}`}
                    placeholder="Untitled"
                    className={cn(
                      "-mx-1 min-w-0 flex-1 py-0 text-[11px] leading-tight",
                      row.done &&
                        "text-muted-foreground line-through decoration-muted-foreground/60",
                    )}
                  />

                  <MoreButton
                    label={`${row.title || "Untitled"} at ${formatTimeLabel(row.item.time)} on ${formatDayLong(dayId)}`}
                    onOpen={(rect) => onClickBlock(rect, item)}
                  />
                </div>
              );
            })}

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
