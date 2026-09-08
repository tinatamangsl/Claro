import { Link2, Link2Off, X } from "lucide-react";

import { CheckToggle } from "@/components/CheckToggle";
import { DragHandle } from "@/components/DragHandle";
import { EditableText } from "@/components/EditableText";
import { SortAnnouncer } from "@/components/SortAnnouncer";
import { useSortable } from "@/hooks/use-sortable";
import {
  SCHEDULE_HOURS,
  SCHEDULE_MINUTES,
  parseMinutes,
  atMinutes,
  formatHourLabel,
  formatTimeLabel,
  hourOf,
  minutesOf,
} from "@/lib/dates";
import { blockItem, resolveSchedule, settleHours, type ResolvedSchedule } from "@/lib/schedule";
import { Plus } from "lucide-react";
import { useState } from "react";

import { Picker } from "@/components/Picker";
import { registerZone } from "@/lib/drop-zones";
import { nextFreeSlot } from "@/lib/day-plan";
import { cn } from "@/lib/utils";
import type { Day, Habit, HabitCompletion, ScheduleItem } from "@/lib/types";

type Props = {
  day: Day;
  habits: Record<string, Habit>;
  completions: Record<string, HabitCompletion>;
  onChange: (items: ScheduleItem[]) => void;
  /** Ticking a row. The route decides where the write actually lands. */
  onToggle: (itemId: string) => void;
  /** The hour a drag from elsewhere on the page is currently hovering. */
  dropHour?: string | null;
  className?: string;
};

const KIND_LABEL: Record<ResolvedSchedule["kind"], string> = {
  block: "time block",
  priority: "priority",
  action: "action",
  habit: "habit",
};

/**
 * A deliberately lightweight 5 AM to 10 PM grid, one line per hour. This is a
 * place to block time, not a calendar product.
 *
 * A row is either a standalone block, whose words and completion live here, or
 * a reference to a priority, action or habit, whose words and completion are
 * read from that record. A linked row is never editable text: editing it here
 * would fork a second version of the same task, which is the whole thing this
 * model exists to prevent.
 */
export function ScheduleBlock({
  day,
  habits,
  completions,
  onChange,
  onToggle,
  className,
  dropHour,
}: Props) {
  const resolved = resolveSchedule(day, habits, completions);
  const byTime = new Map(resolved.map((row) => [row.item.time, row]));

  /*
   * An hour is a frame, not a slot. A block placed at 4:15 belongs to the four
   * o'clock row alongside anything at 4:00, so the row holds a list rather than
   * one entry and sorts its contents by the minute they sit on.
   */
  const byHour = new Map<string, typeof resolved>();
  for (const row of resolved) {
    const hour = hourOf(row.item.time);
    byHour.set(hour, [...(byHour.get(hour) ?? []), row]);
  }
  for (const rows of byHour.values()) {
    rows.sort((a, b) => minutesOf(a.item.time) - minutesOf(b.item.time));
  }

  /** Which hour has its extra line open. One at a time keeps the page calm. */
  const [adding, setAdding] = useState<string | null>(null);

  const sortable = useSortable<ScheduleItem>({
    items: day.scheduleItems,
    label: (item) => byTime.get(item.time)?.title || item.text,
    // A move can land two entries on one hour; `settleHours` swaps them apart.
    onReorder: (next) => onChange(settleHours(day.scheduleItems, next)),
    // Dragging still moves between hours; the minute within an hour is kept.
    getGroup: (item) => hourOf(item.time),
    setGroup: (item, hour) => ({ ...item, time: atMinutes(hour, minutesOf(item.time)) }),
    groupNoun: "hour",
    verticalGroups: true,
  });

  /** Only ever writes a standalone block: linking is a deliberate act elsewhere. */
  const writeBlock = (time: string, text: string) => {
    const existing = day.scheduleItems.find((i) => i.time === time);

    /*
     * Trimmed to decide whether there is anything here, stored as typed.
     *
     * This used to store the trimmed text, and because the save runs 350ms
     * after the last keystroke, it fired on the pause after a space and wrote
     * back a value one character shorter than what was on screen. The field
     * took that as the truth, the space vanished, and the next word ran into
     * the last one: "morning run" came out "morningrun". Whitespace on its own
     * is still nothing, so an all-space entry is removed rather than kept.
     */
    const empty = text.trim() === "";

    if (existing) {
      onChange(
        empty
          ? day.scheduleItems.filter((i) => i.id !== existing.id)
          : day.scheduleItems.map((i) => (i.id === existing.id ? { ...i, text } : i)),
      );
      return;
    }
    if (empty) return;
    onChange([...day.scheduleItems, blockItem(time, text)]);
  };

  const removeRow = (id: string) => onChange(day.scheduleItems.filter((i) => i.id !== id));

  return (
    <section className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-baseline gap-2">
        <h2 className="eyebrow">Schedule</h2>
        <span className="text-[10px] text-muted-foreground">5 AM to 10 PM</span>
      </div>

      <div className="paper-panel schedule mt-2 min-h-0 flex-1 overflow-hidden">
        <SortAnnouncer message={sortable.announcement} />

        {SCHEDULE_HOURS.map((time) => {
          const rows = byHour.get(time) ?? [];
          const hour = formatHourLabel(time);
          const dragging = rows.some((r) => sortable.draggingId === r.item.id);

          return (
            <div
              key={time}
              ref={(el) => {
                sortable.groupRef(time)(el);
                // Also a place a task or a habit can be dropped from elsewhere
                // on the page.
                registerZone(`hour:${time}`, el);
              }}
              data-over={dropHour === time ? "true" : undefined}
              data-filled={rows.length > 0 ? "true" : "false"}
              className={cn("schedule-row group", dragging && "bg-gold/8")}
            >
              <span className="schedule-time">{hour}</span>

              <span className="schedule-body flex-col items-stretch gap-0.5">
                {/*
                  An empty hour renders the same line a filled one does, with
                  `row` null, and the first line is keyed by the hour rather
                  than by the item that may not exist yet.

                  Both of those are load-bearing. This used to branch: an empty
                  hour got a bare EditableText, and the moment the debounce
                  committed, the branch flipped to the row list and the field
                  being typed into was unmounted mid-sentence. It surfaced as
                  "pressing space throws me out of the box", because 350ms after
                  the last keystroke is, in practice, the first time you pause,
                  and that is usually just after a space.

                  The handle and the minute picker appear beside the line once
                  there is an item to drag or reschedule. They carry explicit
                  keys so React matches the field to the field across that,
                  rather than by sibling index, which shifts as they arrive.
                */}
                {(rows.length ? rows : [null]).map((row, index) => (
                  <span
                    key={row && index > 0 ? row.item.id : `line-${time}`}
                    className="flex items-start gap-1.5"
                  >
                    {row && (
                      <DragHandle
                        key="handle"
                        {...sortable.handleProps(row.item)}
                        dragging={sortable.draggingId === row.item.id}
                        className="mt-[1px]"
                      />
                    )}
                    <span
                      key="body"
                      ref={row ? sortable.itemRef(row.item.id) : undefined}
                      className="flex min-w-0 flex-1 gap-1.5"
                    >
                      {row && (
                        <MinutePicker
                          key="minute"
                          time={row.item.time}
                          day={day}
                          onChange={(next) =>
                            onChange(
                              day.scheduleItems.map((i) =>
                                i.id === row.item.id ? { ...i, time: next } : i,
                              ),
                            )
                          }
                        />
                      )}
                      <ScheduleRow
                        key="line"
                        row={row}
                        hour={row ? formatTimeLabel(row.item.time) : hour}
                        onToggle={() => row && onToggle(row.item.id)}
                        onCommit={(text) => writeBlock(row ? row.item.time : time, text)}
                        onRemove={() => row && removeRow(row.item.id)}
                      />
                    </span>
                  </span>
                ))}

                {/*
                  An hour that already holds something offers a quiet plus for a
                  second entry: putting another textarea in all eighteen rows
                  would fill the page with fields nobody asked for, and duplicate
                  every row's label.
                */}
                {rows.length === 0 ? null : adding === time ? (
                  <EditableText
                    value=""
                    onCommit={(text) => {
                      writeBlock(nextFreeSlot(day, time), text);
                      setAdding(null);
                    }}
                    wrap
                    autoFocus
                    // Named for the slot it will write, not for the button that
                    // opened it: two controls with one name is two things a
                    // screen reader cannot tell apart.
                    ariaLabel={`What happens at ${formatTimeLabel(nextFreeSlot(day, time))}`}
                    className="-ml-2 min-w-0 flex-1 py-0 text-[0.8rem] leading-snug"
                  />
                ) : (
                  nextFreeSlot(day, time) !== time && (
                    <button
                      type="button"
                      onClick={() => setAdding(time)}
                      aria-label={`Add another at ${hour}`}
                      // Visible at rest, not on hover. An hour that already
                      // holds something showed nothing but that block's own
                      // field, so the only apparent way to add a second was to
                      // type into the first and overwrite it — and on touch,
                      // where there is no hover, the plus could not be reached
                      // at all.
                      className="mt-0.5 flex w-fit items-center gap-1 rounded px-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground"
                    >
                      <Plus aria-hidden className="h-2.5 w-2.5" />
                      {formatTimeLabel(nextFreeSlot(day, time))}
                    </button>
                  )
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Moving a block within its hour.
 *
 * The minute is the control rather than a label: an entry that landed on the
 * hour and belongs at quarter past should be draggable there in one tap, not
 * deleted and retyped. On the hour it stays almost invisible until the row is
 * hovered, because eighteen ":00"s down the page is noise.
 *
 * **The four quarters are the quick path, not the vocabulary.** A stand-up at
 * 9:05 and a train at 4:37 are ordinary times, so the panel carries a field
 * for any minute of the hour under its four options — the same shape as the
 * focus block's plain minutes field beside its named presets. `time` was
 * always a string, so nothing about the model had to change for this.
 */
function MinutePicker({
  time,
  day,
  onChange,
}: {
  time: string;
  day: Day;
  onChange: (time: string) => void;
}) {
  const hour = hourOf(time);
  const taken = new Set(
    day.scheduleItems
      .filter((item) => item.carriedTo == null && item.time !== time)
      .map((item) => item.time),
  );
  const minutes = minutesOf(time);

  return (
    <Picker
      footer={({ close }) => (
        <ExactMinute
          hour={hour}
          current={minutes}
          isTaken={(slot) => taken.has(slot)}
          onPick={(slot) => {
            onChange(slot);
            close();
          }}
        />
      )}
      value={time}
      onChange={onChange}
      label={`Time of the block at ${formatTimeLabel(time)}`}
      placeholder={formatTimeLabel(time)}
      className="shrink-0"
      triggerClassName={cn(
        "minute-trigger",
        minutes === 0 && "opacity-0 focus-visible:opacity-100 group-hover:opacity-60",
      )}
      options={[...new Set([...SCHEDULE_MINUTES, minutes])]
        .sort((a, b) => a - b)
        .map((m) => atMinutes(hour, m))
        .filter((slot) => slot === time || !taken.has(slot))
        .map((slot) => ({ value: slot, label: formatTimeLabel(slot) }))}
    />
  );
}

/**
 * Any minute of the hour, typed.
 *
 * Refuses rather than corrects. Clamping 75 to 59 would move the block to a
 * time nobody asked for, and an hour that already holds something at that
 * minute says so instead of quietly swapping the two.
 */
function ExactMinute({
  hour,
  current,
  isTaken,
  onPick,
}: {
  hour: string;
  current: number;
  isTaken: (slot: string) => boolean;
  onPick: (time: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [refused, setRefused] = useState<string | null>(null);

  const commit = () => {
    if (draft.trim() === "") return;
    const parsed = parseMinutes(draft);
    if (parsed === null) return setRefused("A minute is 0 to 59.");
    const slot = atMinutes(hour, parsed);
    if (isTaken(slot)) return setRefused(`${formatTimeLabel(slot)} already has something.`);
    setRefused(null);
    setDraft("");
    onPick(slot);
  };

  return (
    <div className="px-1">
      {/*
        Stacked rather than in a row: the panel is sized by its options, which
        are short, and a label and a field side by side ran past its edge.
      */}
      <label className="block text-[10px] text-muted-foreground">
        <span className="block">Or exact minutes</span>
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          placeholder={String(current).padStart(2, "0")}
          onChange={(event) => {
            setDraft(event.target.value);
            setRefused(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
          aria-label={`Minutes past ${formatHourLabel(hour)}`}
          // Same field as the focus block's minutes, so a number typed into
          // Claro looks the same wherever it is typed.
          className="tnum mt-1 w-full rounded-md border border-border bg-card px-2 py-1 text-center text-[0.8rem]"
        />
      </label>
      {refused && (
        <p role="status" className="mt-1 text-[10px] text-muted-foreground">
          {refused}
        </p>
      )}
    </div>
  );
}

function ScheduleRow({
  row,
  hour,
  onToggle,
  onCommit,
  onRemove,
}: {
  /** Null while the hour is still empty: the same line, with nothing in it yet. */
  row: ResolvedSchedule | null;
  hour: string;
  onToggle: () => void;
  onCommit: (text: string) => void;
  onRemove: () => void;
}) {
  /*
   * An empty hour is this component with nothing in it, not a different
   * component. It has to be, or the field is destroyed and rebuilt the instant
   * the first commit lands, which takes the cursor with it.
   *
   * The checkbox is here as a reserved, hidden space rather than left out, so
   * that when the real one arrives it appears beside the words instead of
   * shoving them sideways.
   */
  if (!row) {
    return (
      <span className="flex min-w-0 flex-1 items-start gap-1.5">
        <span aria-hidden className="invisible mt-[1px]">
          <CheckToggle checked={false} onChange={() => {}} label="" size="sm" />
        </span>
        <EditableText
          value=""
          onCommit={onCommit}
          wrap
          ariaLabel={`Schedule at ${hour}`}
          className="-ml-2 min-w-0 flex-1 py-0 text-[0.8rem] leading-snug"
        />
      </span>
    );
  }

  const { item, title, done, kind, available } = row;

  /**
   * The linked record has been deleted or archived. The row keeps the words it
   * was given so the hour still reads, but it is plainly marked and it stays
   * read-only: turning a dead reference into editable text would quietly
   * recreate the task as a second, unconnected copy.
   */
  if (!available) {
    return (
      <span className="flex min-w-0 flex-1 items-start gap-1.5">
        <Link2Off aria-hidden className="mt-[3px] h-3 w-3 shrink-0 text-muted-foreground/70" />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.8rem] leading-snug text-muted-foreground">
            {title || "Untitled"}
          </span>
          <span className="block text-[10px] text-muted-foreground/80">
            This {KIND_LABEL[kind]} is no longer here. The time is still yours.
          </span>
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove the ${hour} row`}
          className="-mt-0.5 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  const linked = kind !== "block";

  return (
    <span className="flex min-w-0 flex-1 items-start gap-1.5">
      <span className="mt-[1px]">
        <CheckToggle
          checked={done}
          onChange={onToggle}
          label={
            linked
              ? `Complete ${title || KIND_LABEL[kind]}, the ${KIND_LABEL[kind]} at ${hour}`
              : `Complete ${title || "the time block"} at ${hour}`
          }
          size="sm"
        />
      </span>

      {linked ? (
        // Read-only on purpose: the words belong to the record it points at.
        <span className="flex min-w-0 flex-1 items-start gap-1">
          <Link2
            aria-hidden
            className="mt-[3px] h-3 w-3 shrink-0 text-muted-foreground/70"
          />
          <span
            className={cn(
              "min-w-0 flex-1 text-[0.8rem] leading-snug",
              done && "strike-done text-muted-foreground",
            )}
            title={`This is the ${KIND_LABEL[kind]}'s own title. Edit it where it lives.`}
          >
            {title}
            <span className="sr-only"> (linked {KIND_LABEL[kind]}, read only here)</span>
          </span>
        </span>
      ) : (
        <EditableText
          value={item.text}
          onCommit={onCommit}
          wrap
          ariaLabel={`Schedule at ${hour}`}
          className={cn(
            "-ml-2 min-w-0 flex-1 py-0 text-[0.8rem] leading-snug",
            done && "strike-done text-muted-foreground",
          )}
        />
      )}

      {/*
        Removes this placement and nothing else. For a linked row the original
        priority, action or habit is untouched: only the hour it was booked in
        goes away.
      */}
      <button
        type="button"
        onClick={onRemove}
        aria-label={
          linked
            ? `Remove ${title || KIND_LABEL[kind]} from ${hour}, keeping the ${KIND_LABEL[kind]}`
            : `Remove the ${hour} time block`
        }
        className="-mt-0.5 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X aria-hidden className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
