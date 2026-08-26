import { Link2, Link2Off, X } from "lucide-react";

import { CheckToggle } from "@/components/CheckToggle";
import { DragHandle } from "@/components/DragHandle";
import { EditableText } from "@/components/EditableText";
import { SortAnnouncer } from "@/components/SortAnnouncer";
import { useSortable } from "@/hooks/use-sortable";
import {
  SCHEDULE_HOURS,
  SCHEDULE_MINUTES,
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
    const trimmed = text.trim();

    if (existing) {
      onChange(
        trimmed
          ? day.scheduleItems.map((i) => (i.id === existing.id ? { ...i, text: trimmed } : i))
          : day.scheduleItems.filter((i) => i.id !== existing.id),
      );
      return;
    }
    if (!trimmed) return;
    onChange([...day.scheduleItems, blockItem(time, trimmed)]);
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
                {rows.map((row) => (
                  <span key={row.item.id} className="flex items-start gap-1.5">
                    <DragHandle
                      {...sortable.handleProps(row.item)}
                      dragging={sortable.draggingId === row.item.id}
                      className="mt-[1px]"
                    />
                    <span ref={sortable.itemRef(row.item.id)} className="flex min-w-0 flex-1 gap-1.5">
                      <MinutePicker
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
                      <ScheduleRow
                        row={row}
                        hour={formatTimeLabel(row.item.time)}
                        onToggle={() => onToggle(row.item.id)}
                        onCommit={(text) => writeBlock(row.item.time, text)}
                        onRemove={() => removeRow(row.item.id)}
                      />
                    </span>
                  </span>
                ))}

                {/*
                  An empty hour offers its line straight away. An hour that
                  already holds something offers a quiet plus instead: putting a
                  second textarea in all eighteen rows would fill the page with
                  fields nobody asked for, and duplicate every row's label.
                */}
                {rows.length === 0 ? (
                  <EditableText
                    value=""
                    onCommit={(text) => writeBlock(time, text)}
                    wrap
                    ariaLabel={`Schedule at ${hour}`}
                    className="-ml-2 min-w-0 flex-1 py-0 text-[0.8rem] leading-snug"
                  />
                ) : adding === time ? (
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
      value={time}
      onChange={onChange}
      label={`Time of the block at ${formatTimeLabel(time)}`}
      placeholder={formatTimeLabel(time)}
      className="shrink-0"
      triggerClassName={cn(
        "minute-trigger",
        minutes === 0 && "opacity-0 focus-visible:opacity-100 group-hover:opacity-60",
      )}
      options={SCHEDULE_MINUTES.map((m) => atMinutes(hour, m))
        .filter((slot) => !taken.has(slot))
        .map((slot) => ({ value: slot, label: formatTimeLabel(slot) }))}
    />
  );
}

function ScheduleRow({
  row,
  hour,
  onToggle,
  onCommit,
  onRemove,
}: {
  row: ResolvedSchedule;
  hour: string;
  onToggle: () => void;
  onCommit: (text: string) => void;
  onRemove: () => void;
}) {
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
