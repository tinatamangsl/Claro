import { AddItem } from "@/components/AddItem";
import { DragHandle } from "@/components/DragHandle";
import { ItemRow } from "@/components/ItemRow";
import { SortAnnouncer } from "@/components/SortAnnouncer";
import { useSortable } from "@/hooks/use-sortable";
import { newId } from "@/lib/id";
import { removeById, toggleById, updateById } from "@/lib/mutations";
import { BUCKETS, BUCKET_META, type ActionItem, type Bucket } from "@/lib/types";
import { Picker } from "@/components/Picker";
import { cn } from "@/lib/utils";

type Props = {
  actions: ActionItem[];
  onChange: (actions: ActionItem[]) => void;
  className?: string;
  /** Renders the three buckets side by side rather than stacked. */
  columns?: boolean;
};

/**
 * Quick Ticks, Tasks and Projects. All three read from one array discriminated
 * by `bucket`, which is what lets an item be dragged from one to another
 * without either list owning the data.
 *
 * One `useSortable` covers all three lanes, so a drag that starts in Tasks can
 * finish in Projects. The bucket picker on each row stays as the non-drag
 * fallback, and the grip's arrow keys move between lanes too.
 */
export function ActionLists({ actions, onChange, className, columns }: Props) {
  const sortable = useSortable<ActionItem>({
    items: actions,
    label: (item) => item.text || BUCKET_META[item.bucket].short,
    onReorder: onChange,
    getGroup: (item) => item.bucket,
    setGroup: (item, bucket) => ({ ...item, bucket: bucket as Bucket }),
    groupNoun: "bucket",
  });

  return (
    <div className={cn(columns ? "grid gap-5 sm:grid-cols-3" : "space-y-5", className)}>
      <SortAnnouncer message={sortable.announcement} />

      {BUCKETS.map((bucket) => (
        <BucketColumn
          key={bucket}
          bucket={bucket}
          items={sortable.ordered.filter((a) => a.bucket === bucket)}
          allActions={actions}
          sortable={sortable}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function BucketColumn({
  bucket,
  items,
  allActions,
  sortable,
  onChange,
}: {
  bucket: Bucket;
  items: ActionItem[];
  allActions: ActionItem[];
  sortable: ReturnType<typeof useSortable<ActionItem>>;
  onChange: (actions: ActionItem[]) => void;
}) {
  const meta = BUCKET_META[bucket];
  const doneCount = items.filter((i) => i.done).length;

  return (
    <section className="flex min-h-0 flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="eyebrow">{meta.column}</h3>
          <span className="shrink-0 text-[10px] text-muted-foreground">{meta.hint}</span>
        </div>
        {items.length > 0 && (
          <span className="tnum shrink-0 text-[10px] text-muted-foreground">
            {doneCount}/{items.length}
          </span>
        )}
      </div>

      {/* The lane the pointer is tested against when a drag crosses buckets. */}
      <div
        ref={sortable.groupRef(bucket)}
        className="paper-panel mt-2 flex min-h-0 flex-1 flex-col px-2 py-1"
      >
        <div className="min-h-0 flex-1 divide-y divide-subtle">
          {items.map((item) => (
            <div key={item.id} ref={sortable.itemRef(item.id)}>
              <ItemRow
                dense
                text={item.text}
                done={item.done}
                label={item.text || meta.short}
                dragging={sortable.draggingId === item.id}
                handle={
                  <DragHandle
                    {...sortable.handleProps(item)}
                    dragging={sortable.draggingId === item.id}
                    className="mt-1"
                  />
                }
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
            </div>
          ))}
        </div>

        <AddItem
          label={`Add to ${meta.column.toLowerCase()}`}
          className="shrink-0 text-[0.8rem]"
          onAdd={(text) =>
            onChange([
              ...allActions,
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

/** The non-drag way to recategorise: still just changing one field. */
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
    <Picker
      value={value}
      onChange={(bucket) => onChange(bucket as Bucket)}
      label={`Move "${itemLabel}" to another list`}
      placeholder={BUCKET_META[value].short}
      align="right"
      className="w-0 shrink-0 overflow-hidden opacity-0 transition-opacity focus-within:w-auto focus-within:overflow-visible focus-within:opacity-100 group-hover:w-auto group-hover:overflow-visible group-hover:opacity-100"
      triggerClassName="goal-trigger whitespace-nowrap"
      options={BUCKETS.map((b) => ({ value: b, label: BUCKET_META[b].short }))}
    />
  );
}
