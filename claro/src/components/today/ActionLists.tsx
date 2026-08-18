import { AddItem } from "@/components/AddItem";
import { ItemRow } from "@/components/ItemRow";
import { newId } from "@/lib/id";
import { removeById, toggleById, updateById } from "@/lib/mutations";
import { BUCKET_META, type ActionItem, type Bucket } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  bucket: Bucket;
  /** The whole day's actions — one array holds all three buckets. */
  actions: ActionItem[];
  onChange: (actions: ActionItem[]) => void;
  className?: string;
};

/**
 * One effort bucket as its own column, so Quick Ticks, Tasks and Projects can
 * sit side by side across the spread rather than stacking into a long page.
 *
 * All three read from the same array, discriminated by `bucket`, which is what
 * makes recategorising an item a single field change.
 */
export function BucketColumn({ bucket, actions, onChange, className }: Props) {
  const meta = BUCKET_META[bucket];
  const items = actions.filter((a) => a.bucket === bucket);
  const doneCount = items.filter((i) => i.done).length;

  return (
    <section className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="eyebrow truncate">{meta.column}</h2>
          <span className="shrink-0 text-[10px] text-muted-foreground">{meta.hint}</span>
        </div>
        {items.length > 0 && (
          <span className="tnum shrink-0 text-[10px] text-muted-foreground">
            {doneCount}/{items.length}
          </span>
        )}
      </div>

      <div className="paper-panel scroll-pane mt-2 flex min-h-0 flex-1 flex-col px-3 py-1">
        <div className="min-h-0 flex-1 divide-y divide-subtle">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              dense
              text={item.text}
              done={item.done}
              label={meta.short}
              onToggle={() => onChange(toggleById(actions, item.id))}
              onCommit={(text) => onChange(updateById(actions, item.id, { text }))}
              onDelete={() => onChange(removeById(actions, item.id))}
              trailing={
                <BucketSwitcher
                  value={item.bucket}
                  onChange={(next) => onChange(updateById(actions, item.id, { bucket: next }))}
                  itemLabel={item.text || meta.short}
                />
              }
            />
          ))}
        </div>

        <AddItem
          label={`Add to ${meta.label.toLowerCase()}`}
          className="shrink-0 text-[0.8rem]"
          onAdd={(text) =>
            onChange([
              ...actions,
              {
                id: newId(),
                text,
                bucket,
                done: false,
                createdAt: new Date().toISOString(),
                originDayId: null,
                carriedTo: null,
              },
            ])
          }
        />
      </div>
    </section>
  );
}

/** Recategorising an item is just changing its bucket. */
function BucketSwitcher({
  value,
  onChange,
  itemLabel,
}: {
  value: Bucket;
  onChange: (bucket: Bucket) => void;
  itemLabel: string;
}) {
  return (
    <select
      aria-label={`Move "${itemLabel}" to another list`}
      value={value}
      onChange={(e) => onChange(e.target.value as Bucket)}
      className="field-select w-0 shrink-0 overflow-hidden p-0 opacity-0 transition-opacity focus-visible:w-auto focus-visible:p-[0.125rem_0.375rem] focus-visible:opacity-100 group-hover:w-auto group-hover:p-[0.125rem_0.375rem] group-hover:opacity-100"
    >
      {(["quickTick", "task", "project"] as Bucket[]).map((b) => (
        <option key={b} value={b}>
          {BUCKET_META[b].short}
        </option>
      ))}
    </select>
  );
}
