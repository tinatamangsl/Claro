import { useCallback, useRef, useState } from "react";

import { applyOrder, moveAcrossGroups, moveById, nudgeById } from "@/lib/reorder";

/**
 * Reordering for meaningful list items.
 *
 * One pointer-events path covers mouse, touch and pen — HTML5 drag-and-drop is
 * deliberately not used, because it does not fire on touch at all. The same
 * hook also exposes a keyboard path on the grip, so every reorder is reachable
 * without a pointer, and announces each move through an `aria-live` region.
 *
 * When `getGroup` is supplied the whole set is treated as one array split into
 * lanes, which is what lets an action move *between* effort buckets without
 * either list owning the data.
 */

type Options<T extends { id: string }> = {
  /** Every item, across every group. */
  items: T[];
  /** Accessible description of one item, used in the drag announcements. */
  label: (item: T) => string;
  onReorder: (next: T[]) => void;
  getGroup?: (item: T) => string;
  setGroup?: (item: T, group: string) => T;
  /** Human name for a lane, used in the keyboard hint. */
  groupNoun?: string;
  /**
   * Lanes stacked vertically rather than side by side (the schedule's hours).
   * Up and down then move *between* lanes, which is what the layout implies.
   */
  verticalGroups?: boolean;
};

type Drag = { id: string; pointerId: number };

export function useSortable<T extends { id: string }>({
  items,
  label,
  onReorder,
  getGroup,
  setGroup,
  groupNoun = "list",
  verticalGroups = false,
}: Options<T>) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [liveIds, setLiveIds] = useState<string[] | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const itemRefs = useRef(new Map<string, HTMLElement>());
  const groupRefs = useRef(new Map<string, HTMLElement>());
  // Pointer handlers close over the first render otherwise.
  const latest = useRef({ items, getGroup, setGroup, onReorder, label });
  latest.current = { items, getGroup, setGroup, onReorder, label };

  /** During a drag the preview order wins; otherwise the store's order does. */
  const ordered = liveIds ? applyOrder(items, liveIds) : items;

  const groupOf = useCallback(
    (item: T) => (getGroup ? getGroup(item) : ""),
    [getGroup],
  );

  const describe = useCallback(
    (list: T[], id: string) => {
      const item = list.find((i) => i.id === id);
      if (!item) return "";
      const lane = list.filter((i) => groupOf(i) === groupOf(item));
      const position = lane.findIndex((i) => i.id === id) + 1;
      const where = getGroup ? ` in ${groupOf(item)}` : "";
      return `${latest.current.label(item)} is now ${position} of ${lane.length}${where}.`;
    },
    [getGroup, groupOf],
  );

  // --------------------------------------------------------------- pointer

  const onPointerDown = (item: T) => (event: React.PointerEvent<HTMLElement>) => {
    // Left button or touch only — a right-click must not start a drag.
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ id: item.id, pointerId: event.pointerId });
    setLiveIds(items.map((i) => i.id));
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return;

    const { items: all, getGroup: group, setGroup: assign } = latest.current;
    const current = liveIds ? applyOrder(all, liveIds) : all;
    const dragged = current.find((i) => i.id === drag.id);
    if (!dragged) return;

    const { clientX: x, clientY: y } = event;

    // Which lane is the pointer over? With no grouping there is only one.
    let targetGroup = group ? group(dragged) : "";
    if (group) {
      for (const [name, element] of groupRefs.current) {
        const r = element.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          targetGroup = name;
          break;
        }
      }
    }

    const lane = current.filter((i) => (group ? group(i) === targetGroup : true));
    let index = lane.length;
    for (let i = 0; i < lane.length; i += 1) {
      const element = itemRefs.current.get(lane[i].id);
      if (!element) continue;
      const r = element.getBoundingClientRect();
      // Above a row's midpoint means the dragged row belongs before it.
      if (y < r.top + r.height / 2) {
        index = i;
        break;
      }
    }

    const next =
      group && assign
        ? moveAcrossGroups(current, drag.id, targetGroup, index, group, assign)
        : moveById(current, drag.id, index);

    const changedOrder = next.map((i) => i.id).join("|") !== current.map((i) => i.id).join("|");
    const changedGroup = group ? group(next.find((i) => i.id === drag.id) as T) !== group(dragged) : false;

    if (changedOrder || changedGroup) {
      setLiveIds(next.map((i) => i.id));
      // A lane change has to be committed as it happens: an id order alone
      // cannot carry "this item now belongs to another bucket".
      if (changedGroup) latest.current.onReorder(next);
    }
  };

  const endDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return;

    if (liveIds) {
      const next = applyOrder(latest.current.items, liveIds);
      latest.current.onReorder(next);
      setAnnouncement(describe(next, drag.id));
    }
    setDrag(null);
    setLiveIds(null);
  };

  // -------------------------------------------------------------- keyboard

  const onKeyDown = (item: T) => (event: React.KeyboardEvent<HTMLElement>) => {
    const { items: all, getGroup: group, setGroup: assign } = latest.current;
    const vertical = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    const lateral = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;

    if (vertical !== 0 && verticalGroups && group && assign) {
      event.preventDefault();
      const lanes = [...new Set(all.map(group))].sort();
      const destination = lanes[lanes.indexOf(group(item)) + vertical];
      if (destination === undefined) return;

      const next = moveAcrossGroups(all, item.id, destination, 0, group, assign);
      latest.current.onReorder(next);
      setAnnouncement(describe(next, item.id));
      return;
    }

    if (vertical !== 0) {
      event.preventDefault();

      if (group && assign) {
        // Nudge within the item's own lane, then splice that lane back in.
        const lane = all.filter((i) => group(i) === group(item));
        const moved = nudgeById(lane, item.id, vertical);
        if (moved === lane) return;

        const to = moved.findIndex((i) => i.id === item.id);
        const next = moveAcrossGroups(all, item.id, group(item), to, group, assign);
        latest.current.onReorder(next);
        setAnnouncement(describe(next, item.id));
        return;
      }

      const next = nudgeById(all, item.id, vertical);
      if (next === all) return;
      latest.current.onReorder(next);
      setAnnouncement(describe(next, item.id));
      return;
    }

    if (lateral !== 0 && group && assign) {
      event.preventDefault();
      const lanes = [...new Set(all.map(group))];
      const destination = lanes[lanes.indexOf(group(item)) + lateral];
      if (destination === undefined) return;

      const next = moveAcrossGroups(all, item.id, destination, 0, group, assign);
      latest.current.onReorder(next);
      setAnnouncement(describe(next, item.id));
    }
  };

  // ----------------------------------------------------------------- props

  const registerGroup = (name: string) => (element: HTMLElement | null) => {
    if (element) groupRefs.current.set(name, element);
    else groupRefs.current.delete(name);
  };

  const registerItem = (id: string) => (element: HTMLElement | null) => {
    if (element) itemRefs.current.set(id, element);
    else itemRefs.current.delete(id);
  };

  const hint =
    getGroup && verticalGroups
      ? `Use the up and down arrow keys to change ${groupNoun}.`
      : getGroup
        ? `Use the arrow keys to move it, left and right to change ${groupNoun}.`
        : "Use the up and down arrow keys to move it.";

  return {
    ordered,
    draggingId: drag?.id ?? null,
    announcement,
    groupRef: registerGroup,
    itemRef: registerItem,
    /** Spread onto the grip button — never onto a text field. */
    handleProps: (item: T) => ({
      type: "button" as const,
      "aria-label": `Reorder ${label(item)}. ${hint}`,
      onPointerDown: onPointerDown(item),
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onKeyDown: onKeyDown(item),
      // Without this the browser scrolls the page instead of tracking the drag.
      style: { touchAction: "none" as const },
    }),
  };
}
