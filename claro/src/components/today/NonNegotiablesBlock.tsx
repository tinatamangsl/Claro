import { AddItem } from "@/components/AddItem";
import { CheckToggle } from "@/components/CheckToggle";
import { EditableText } from "@/components/EditableText";
import { newId } from "@/lib/id";
import { addCapped, removeById, toggleById, updateById } from "@/lib/mutations";
import { MAX_NON_NEGOTIABLES, type Day, type NonNegotiable } from "@/lib/types";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

type Props = {
  day: Day;
  onChange: (items: NonNegotiable[]) => void;
};

/**
 * Deliberately not styled like the task lists — these aren't productivity items,
 * they're the things that happen regardless of how the day goes.
 */
export function NonNegotiablesBlock({ day, onChange }: Props) {
  const items = day.nonNegotiables;
  const atCap = items.length >= MAX_NON_NEGOTIABLES;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="eyebrow">Non-Negotiables</h2>
          <span className="text-[11px] text-muted-foreground">whatever else happens</span>
        </div>
        <span className="eyebrow tnum">
          {items.filter((i) => i.done).length}/{items.length || MAX_NON_NEGOTIABLES}
        </span>
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "group flex items-center gap-2.5 rounded-lg border px-3 py-3 transition-colors",
              item.done ? "border-positive/30 bg-positive/6" : "border-border bg-card",
            )}
          >
            <CheckToggle
              checked={item.done}
              onChange={() => onChange(toggleById(items, item.id))}
              label={`Complete ${item.text || "non-negotiable"}`}
            />
            <EditableText
              value={item.text}
              onCommit={(text) => onChange(updateById(items, item.id, { text }))}
              ariaLabel="Non-negotiable"
              className={cn(
                "flex-1 text-[0.88rem]",
                item.done && "strike-done text-muted-foreground",
              )}
            />
            <button
              type="button"
              onClick={() => onChange(removeById(items, item.id))}
              aria-label={`Delete ${item.text || "non-negotiable"}`}
              className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {!atCap && (
          <div className="rounded-lg border border-dashed border-border">
            <AddItem
              label="Add a non-negotiable"
              className="px-3 py-3"
              onAdd={(text) =>
                onChange(
                  addCapped(items, { id: newId(), text, done: false }, MAX_NON_NEGOTIABLES),
                )
              }
            />
          </div>
        )}
      </div>
    </section>
  );
}
