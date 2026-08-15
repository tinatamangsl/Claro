import { AddItem } from "@/components/AddItem";
import { ItemRow } from "@/components/ItemRow";
import { newId } from "@/lib/id";
import { removeById, toggleById, updateById } from "@/lib/mutations";
import { BUCKETS, BUCKET_META, type ActionItem, type Bucket, type Day } from "@/lib/types";

type Props = {
  day: Day;
  onChange: (actions: ActionItem[]) => void;
};

/**
 * Quick Ticks / Tasks / Projects. All three live in one array discriminated by
 * `bucket`, so moving an item between them is a single field change.
 */
export function ActionLists({ day, onChange }: Props) {
  return (
    <section className="space-y-7">
      <div className="flex items-baseline gap-2.5">
        <h2 className="eyebrow">Actions</h2>
        <span className="text-[11px] text-muted-foreground">grouped by effort</span>
      </div>

      {BUCKETS.map((bucket) => (
        <BucketList
          key={bucket}
          bucket={bucket}
          items={day.actions.filter((a) => a.bucket === bucket)}
          allActions={day.actions}
          onChange={onChange}
        />
      ))}
    </section>
  );
}

function BucketList({
  bucket,
  items,
  allActions,
  onChange,
}: {
  bucket: Bucket;
  items: ActionItem[];
  allActions: ActionItem[];
  onChange: (actions: ActionItem[]) => void;
}) {
  const meta = BUCKET_META[bucket];
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h3 className="text-[0.95rem] font-medium tracking-tight">{meta.label}</h3>
          <span className="text-[11px] text-muted-foreground">{meta.hint}</span>
        </div>
        {items.length > 0 && (
          <span className="tnum text-[11px] text-muted-foreground">
            {doneCount}/{items.length}
          </span>
        )}
      </div>

      <div className="mt-2 divide-y divide-subtle">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            text={item.text}
            done={item.done}
            label={meta.short}
            onToggle={() => onChange(toggleById(allActions, item.id))}
            onCommit={(text) => onChange(updateById(allActions, item.id, { text }))}
            onDelete={() => onChange(removeById(allActions, item.id))}
            trailing={
              <BucketSwitcher
                value={item.bucket}
                onChange={(next) => onChange(updateById(allActions, item.id, { bucket: next }))}
                itemLabel={item.text || meta.short}
              />
            }
          />
        ))}
      </div>

      <div className="mt-1">
        <AddItem
          label={`Add to ${meta.label.toLowerCase()}`}
          onAdd={(text) =>
            onChange([
              ...allActions,
              {
                id: newId(),
                text,
                bucket,
                done: false,
                createdAt: new Date().toISOString(),
              },
            ])
          }
        />
      </div>
    </div>
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
      className="shrink-0 cursor-pointer rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:border-border focus-visible:opacity-100 group-hover:opacity-100"
    >
      {BUCKETS.map((b) => (
        <option key={b} value={b}>
          {BUCKET_META[b].short}
        </option>
      ))}
    </select>
  );
}
