import { DragHandle } from "@/components/DragHandle";
import { EditableText } from "@/components/EditableText";
import { SortAnnouncer } from "@/components/SortAnnouncer";
import { useSortable } from "@/hooks/use-sortable";
import { SCHEDULE_HOURS, formatHourLabel } from "@/lib/dates";
import { newId } from "@/lib/id";
import { settleHours } from "@/lib/schedule";
import { cn } from "@/lib/utils";
import type { Day, ScheduleItem } from "@/lib/types";

type Props = {
  day: Day;
  onChange: (items: ScheduleItem[]) => void;
  className?: string;
};

/**
 * A deliberately lightweight 5 AM – 10 PM grid — one line per hour. This is a
 * place to block time, not a calendar product.
 *
 * Each hour is a drop lane, so "reordering" a schedule means moving an entry to
 * another hour. Only an hour that already holds something gets a grip: an empty
 * row is a text field, and text fields are never draggable.
 */
export function ScheduleBlock({ day, onChange, className }: Props) {
  const byTime = new Map(day.scheduleItems.map((item) => [item.time, item]));

  const sortable = useSortable<ScheduleItem>({
    items: day.scheduleItems,
    label: (item) => item.text,
    // A move can land two entries on one hour; `settleHours` swaps them back apart.
    onReorder: (next) => onChange(settleHours(day.scheduleItems, next)),
    getGroup: (item) => item.time,
    setGroup: (item, time) => ({ ...item, time }),
    groupNoun: "hour",
    verticalGroups: true,
  });

  const setAt = (time: string, text: string) => {
    const existing = byTime.get(time);
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
    onChange([...day.scheduleItems, { id: newId(), time, text: trimmed }]);
  };

  return (
    <section className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-baseline gap-2">
        <h2 className="eyebrow">Schedule</h2>
        <span className="text-[10px] text-muted-foreground">5 AM – 10 PM</span>
      </div>

      <div className="paper-panel mt-2 min-h-0 flex-1 divide-y divide-subtle">
        <SortAnnouncer message={sortable.announcement} />

        {SCHEDULE_HOURS.map((time) => {
          const item = sortable.ordered.find((i) => i.time === time);
          const dragging = item && sortable.draggingId === item.id;

          return (
            <div
              key={time}
              ref={sortable.groupRef(time)}
              className={cn("group flex items-stretch", dragging && "bg-gold/8")}
            >
              <span className="tnum flex w-[3.25rem] shrink-0 items-center justify-end border-r border-gold/25 pr-2 text-[10px] text-muted-foreground">
                {formatHourLabel(time)}
              </span>

              {item ? (
                <span ref={sortable.itemRef(item.id)} className="flex min-w-0 flex-1 items-start">
                  <DragHandle
                    {...sortable.handleProps(item)}
                    dragging={dragging}
                    className="mt-[3px] ml-1"
                  />
                  <EditableText
                    value={item.text}
                    onCommit={(text) => setAt(time, text)}
                    wrap
                    ariaLabel={`Schedule at ${formatHourLabel(time)}`}
                    className="min-w-0 flex-1 py-0 pl-1 text-[0.78rem] leading-snug"
                  />
                </span>
              ) : (
                <EditableText
                  value=""
                  onCommit={(text) => setAt(time, text)}
                  wrap
                  ariaLabel={`Schedule at ${formatHourLabel(time)}`}
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
