import { EditableText } from "@/components/EditableText";
import { CheckToggle } from "@/components/CheckToggle";
import { newId } from "@/lib/id";
import { removeById, toggleById, updateById } from "@/lib/mutations";
import { MAX_NON_NEGOTIABLES, type Day, type NonNegotiable } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  day: Day;
  onChange: (items: NonNegotiable[]) => void;
  className?: string;
};

/** Always three numbered lines, so the shape of the promise is visible even when empty. */
const SLOTS = Array.from({ length: MAX_NON_NEGOTIABLES }, (_, i) => i);

/**
 * Deliberately not styled like the task lists — these aren't productivity
 * items, they're the things that happen regardless of how the day goes. Three
 * ruled lines in a tinted box, as on the paper page.
 */
export function NonNegotiablesBlock({ day, onChange, className }: Props) {
  const items = day.nonNegotiables;

  const write = (index: number, text: string) => {
    const existing = items[index];
    const trimmed = text.trim();

    if (existing) {
      onChange(trimmed ? updateById(items, existing.id, { text: trimmed }) : removeById(items, existing.id));
      return;
    }
    if (!trimmed) return;
    onChange([...items, { id: newId(), text: trimmed, done: false }]);
  };

  return (
    <section className={cn("shrink-0", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="eyebrow">My three anchors</h2>
          <span className="hidden text-[10px] text-muted-foreground xl:inline">promises, not tasks</span>
        </div>
        <span className="eyebrow tnum">
          {items.filter((i) => i.done).length}/{MAX_NON_NEGOTIABLES}
        </span>
      </div>

      <div className="anchor-box mt-2 divide-y divide-subtle px-3">
        {SLOTS.map((index) => {
          const item = items[index];
          return (
            <div key={index} className="flex items-center gap-2">
              <span aria-hidden className="tnum w-3 shrink-0 text-[11px] text-muted-foreground">
                {index + 1}
              </span>
              <CheckToggle
                checked={item?.done ?? false}
                onChange={() => item && onChange(toggleById(items, item.id))}
                label={item ? `Complete ${item.text}` : `Anchor ${index + 1}`}
                size="sm"
                className={cn(!item && "invisible")}
              />
              <EditableText
                value={item?.text ?? ""}
                onCommit={(text) => write(index, text)}
                ariaLabel={`Anchor ${index + 1}`}
                placeholder="…"
                className={cn(
                  "flex-1 py-1 text-[0.82rem]",
                  item?.done && "strike-done text-muted-foreground",
                )}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
