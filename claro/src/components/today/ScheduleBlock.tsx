import { EditableText } from "@/components/EditableText";
import { SCHEDULE_HOURS, formatHourLabel } from "@/lib/dates";
import { newId } from "@/lib/id";
import type { Day, ScheduleItem } from "@/lib/types";

type Props = {
  day: Day;
  onChange: (items: ScheduleItem[]) => void;
};

/**
 * A deliberately lightweight 5 AM – 10 PM grid — one line per hour. This is a
 * place to block time, not a calendar product.
 */
export function ScheduleBlock({ day, onChange }: Props) {
  const byTime = new Map(day.scheduleItems.map((item) => [item.time, item]));

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
    <section>
      <div className="flex items-baseline gap-2.5">
        <h2 className="eyebrow">Schedule</h2>
        <span className="text-[11px] text-muted-foreground">5 AM – 10 PM</span>
      </div>

      <div className="paper-panel mt-3 divide-y divide-subtle py-1">
        {SCHEDULE_HOURS.map((time) => {
          const item = byTime.get(time);
          return (
            <div key={time} className="flex items-stretch">
              <span className="tnum flex w-16 shrink-0 items-center justify-end border-r border-gold/25 py-1.5 pr-3 text-[11px] text-muted-foreground">
                {formatHourLabel(time)}
              </span>
              <EditableText
                value={item?.text ?? ""}
                onCommit={(text) => setAt(time, text)}
                ariaLabel={`Schedule at ${formatHourLabel(time)}`}
                className="flex-1 pl-3 text-[0.88rem]"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
