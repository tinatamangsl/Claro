import type { ReactNode } from "react";

import { DragHandle } from "@/components/DragHandle";
import { ItemRow } from "@/components/ItemRow";
import { SortAnnouncer } from "@/components/SortAnnouncer";
import { useSortable } from "@/hooks/use-sortable";

type Row = { id: string; text: string; done: boolean };

type Props<T extends Row> = {
  items: T[];
  label: string;
  onReorder: (next: T[]) => void;
  onToggle: (item: T) => void;
  onCommit: (item: T, value: string) => void;
  onDelete: (item: T) => void;
  trailing?: (item: T) => ReactNode;
  className?: string;
};

/**
 * A plain reorderable list of completable lines — the shape Week's actions and
 * Quarter's side quests both have. Everything specific to those screens stays
 * in the callbacks; the drag, keyboard and announcement wiring lives here once.
 */
export function SortableRows<T extends Row>({
  items,
  label,
  onReorder,
  onToggle,
  onCommit,
  onDelete,
  trailing,
  className,
}: Props<T>) {
  const sortable = useSortable<T>({
    items,
    label: (item) => item.text || label,
    onReorder,
  });

  return (
    <div className={className}>
      <SortAnnouncer message={sortable.announcement} />
      {sortable.ordered.map((item) => (
        <div key={item.id} ref={sortable.itemRef(item.id)}>
          <ItemRow
            text={item.text}
            done={item.done}
            label={label}
            dragging={sortable.draggingId === item.id}
            handle={
              <DragHandle
                {...sortable.handleProps(item)}
                dragging={sortable.draggingId === item.id}
                className="mt-1.5"
              />
            }
            onToggle={() => onToggle(item)}
            onCommit={(value) => onCommit(item, value)}
            onDelete={() => onDelete(item)}
            trailing={trailing?.(item)}
          />
        </div>
      ))}
    </div>
  );
}
