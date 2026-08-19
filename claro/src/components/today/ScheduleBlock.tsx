import { Link2, Link2Off, X } from "lucide-react";

import { CheckToggle } from "@/components/CheckToggle";
import { DragHandle } from "@/components/DragHandle";
import { EditableText } from "@/components/EditableText";
import { SortAnnouncer } from "@/components/SortAnnouncer";
import { useSortable } from "@/hooks/use-sortable";
import { SCHEDULE_HOURS, formatHourLabel } from "@/lib/dates";
import { blockItem, resolveSchedule, settleHours, type ResolvedSchedule } from "@/lib/schedule";
import { cn } from "@/lib/utils";
import type { Day, Habit, HabitCompletion, ScheduleItem } from "@/lib/types";

type Props = {
  day: Day;
  habits: Record<string, Habit>;
  completions: Record<string, HabitCompletion>;
  onChange: (items: ScheduleItem[]) => void;
  /** Ticking a row. The route decides where the write actually lands. */
  onToggle: (itemId: string) => void;
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
}: Props) {
  const resolved = resolveSchedule(day, habits, completions);
  const byTime = new Map(resolved.map((row) => [row.item.time, row]));

  const sortable = useSortable<ScheduleItem>({
    items: day.scheduleItems,
    label: (item) => byTime.get(item.time)?.title || item.text,
    // A move can land two entries on one hour; `settleHours` swaps them apart.
    onReorder: (next) => onChange(settleHours(day.scheduleItems, next)),
    getGroup: (item) => item.time,
    setGroup: (item, time) => ({ ...item, time }),
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

      <div className="paper-panel mt-2 min-h-0 flex-1 divide-y divide-subtle">
        <SortAnnouncer message={sortable.announcement} />

        {SCHEDULE_HOURS.map((time) => {
          const row = byTime.get(time);
          const hour = formatHourLabel(time);
          const dragging = row && sortable.draggingId === row.item.id;

          return (
            <div
              key={time}
              ref={sortable.groupRef(time)}
              className={cn("group flex items-stretch", dragging && "bg-gold/8")}
            >
              <span className="tnum flex w-[3.25rem] shrink-0 items-center justify-end border-r border-gold/25 pr-2 text-[10px] text-muted-foreground">
                {hour}
              </span>

              {row ? (
                <span
                  ref={sortable.itemRef(row.item.id)}
                  className="flex min-w-0 flex-1 items-start gap-1"
                >
                  <DragHandle
                    {...sortable.handleProps(row.item)}
                    dragging={dragging}
                    className="mt-[3px] ml-1"
                  />
                  <ScheduleRow
                    row={row}
                    hour={hour}
                    onToggle={() => onToggle(row.item.id)}
                    onCommit={(text) => writeBlock(time, text)}
                    onRemove={() => removeRow(row.item.id)}
                  />
                </span>
              ) : (
                <EditableText
                  value=""
                  onCommit={(text) => writeBlock(time, text)}
                  wrap
                  ariaLabel={`Schedule at ${hour}`}
                  className="min-w-0 flex-1 py-0 pl-2 text-[0.78rem] leading-snug"
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
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
      <span className="flex min-w-0 flex-1 items-start gap-1.5 py-0.5 pl-1">
        <Link2Off aria-hidden className="mt-[3px] h-3 w-3 shrink-0 text-muted-foreground/70" />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.78rem] leading-snug text-muted-foreground">
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
          className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  const linked = kind !== "block";

  return (
    <span className="flex min-w-0 flex-1 items-start gap-1.5 py-0.5">
      <span className="mt-[2px]">
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
              "min-w-0 flex-1 text-[0.78rem] leading-snug",
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
            "min-w-0 flex-1 py-0 pl-1 text-[0.78rem] leading-snug",
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
        className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X aria-hidden className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
