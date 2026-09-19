import { useCallback, useEffect, useRef, useState } from "react";

import { stopAutoScroll, trackPointer } from "@/lib/auto-scroll";
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

/**
 * All a drag ever reads off an event, which is what lets the same two handlers
 * serve React's synthetic events and the window's native ones.
 */
type DragPoint = { pointerId: number; clientX: number; clientY: number };

type Options<T extends { id: string }> = {
  /** Every item, across every group. */
  items: T[];
  /** Accessible description of one item, used in the drag announcements. */
  label: (item: T) => string;
  onReorder: (next: T[]) => void;
  getGroup?: (item: T) => string;
  setGroup?: (item: T, group: string) => T;
  /**
   * Somewhere outside this list that a drag may land.
   *
   * The list still owns reordering; this is the case where the pointer leaves
   * it entirely and finishes over another component's territory. When that
   * happens the reorder is abandoned rather than committed, because the item
   * did not move within the list, it left it.
   */
  externalDrop?: {
    zoneAt: (x: number, y: number) => string | null;
    onDrop: (item: T, zone: string) => void;
    onHover?: (zone: string | null) => void;
  };
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
  externalDrop,
  groupNoun = "list",
  verticalGroups = false,
}: Options<T>) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [liveIds, setLiveIds] = useState<string[] | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const itemRefs = useRef(new Map<string, HTMLElement>());
  const groupRefs = useRef(new Map<string, HTMLElement>());
  // Pointer handlers close over the first render otherwise.
  const latest = useRef({ items, getGroup, setGroup, onReorder, label, externalDrop });
  latest.current = { items, getGroup, setGroup, onReorder, label, externalDrop };

  /** The outside zone the pointer is currently over, if any. */
  const overZone = useRef<string | null>(null);

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

  /**
   * A press that has not yet become a drag.
   *
   * The grip can start one on contact, because pressing a grip means only one
   * thing. A row cannot: pressing a row usually means "put the cursor here" or
   * "select this word", and hijacking that would make the schedule impossible
   * to edit. So a row press is held here until the pointer has actually
   * travelled, and released as an ordinary click if it never does.
   */
  const pending = useRef<{ id: string; pointerId: number; x: number; y: number } | null>(null);

  /** Far enough to mean "I am moving this", short enough to feel immediate. */
  const DRAG_THRESHOLD = 5;

  /**
   * Somewhere a press means something other than "pick this up".
   *
   * Buttons, links and the pickers always own their own press: a drag starting
   * inside one would steal the interaction the element exists for.
   *
   * **A text field is different, and this is the whole reason row dragging
   * works at all.** A schedule row is almost entirely its own textarea, so
   * excluding text fields excludes the row. But a press on text you are not
   * editing does not mean "select from here" — it means "I am pointing at
   * this". So an *unfocused* field can start a drag, while a focused one is
   * left alone and selecting a word still works exactly as it should. The
   * press-then-travel threshold is what keeps a plain click landing the cursor
   * where it always did.
   */
  const ownsItsPress = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    if (target.closest("button, a, select, [role='button'], [role='listbox']")) return true;

    const field = target.closest("input, textarea, [contenteditable='true']");
    return field !== null && field === document.activeElement;
  };

  /**
   * The whole row as a grab point, without taking its clicks.
   *
   * The grip is 18px square, which is under half the 44px a finger is usually
   * given, and it sits at 45% opacity until hovered. It works, but it has to be
   * found first, and on a phone there is no hover to find it with. Letting the
   * row itself be dragged is what people try before they look for a handle.
   */
  const rowProps = (item: T) => ({
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || ownsItsPress(event.target)) return;
      // Nothing is prevented and no drag begins: this is still a plain press
      // until the pointer proves otherwise.
      pending.current = {
        id: item.id,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
    },
  });

  // Promote a held press into a drag once it has travelled far enough.
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const held = pending.current;
      if (!held || event.pointerId !== held.pointerId) return;
      if (Math.hypot(event.clientX - held.x, event.clientY - held.y) < DRAG_THRESHOLD) return;

      pending.current = null;
      /*
       * The press began on text, so the browser has been extending a selection
       * the whole way here. Clear it, or the row is dragged with half its words
       * highlighted behind it.
       */
      window.getSelection?.()?.removeAllRanges();
      setDrag({ id: held.id, pointerId: held.pointerId });
      setLiveIds(latest.current.items.map((i) => i.id));
    };
    const drop = () => {
      pending.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", drop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", drop);
    };
  }, []);

  const onPointerDown = (item: T) => (event: React.PointerEvent<HTMLElement>) => {
    // Left button or touch only — a right-click must not start a drag.
    if (event.button !== 0) return;
    event.preventDefault();
    /*
     * Nice to have, not load-bearing. It keeps touch from scrolling the page
     * out from under the gesture, but the window listeners are what actually
     * follow the drag, so a browser that refuses it still drags correctly —
     * and jsdom, which has no such method, can test this hook at all. It used
     * to be called bare, which meant one throw here stopped the drag starting.
     */
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ id: item.id, pointerId: event.pointerId });
    setLiveIds(items.map((i) => i.id));
  };

  /*
   * The live handlers, re-read on every event rather than captured when the
   * drag began: `liveIds` changes throughout a gesture, and a listener bound
   * once would keep answering with the order the drag started from.
   */
  const handlers = useRef({ move: (_: DragPoint) => {}, end: (_: DragPoint) => {} });

  /*
   * A drag is followed on the window, not on the grip.
   *
   * `setPointerCapture` looks like it makes this unnecessary, and on a wide
   * screen it does. But capture belongs to a DOM node, and this hook's whole
   * purpose is moving an item between lanes — which commits to the store
   * immediately, remounts the row under its new bucket, and destroys the very
   * node holding the capture. The browser then fires `lostpointercapture` and
   * every later move goes to whatever is under the pointer instead.
   *
   * Below `lg` the buckets stack, so dragging an action up towards the
   * schedule crosses the other buckets on the way and triggers exactly that:
   * the drag died silently mid-gesture at every width under 1024px while
   * working perfectly above it. The window is the only node in this picture
   * that cannot be unmounted.
   */
  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => handlers.current.move(event);
    const end = (event: PointerEvent) => handlers.current.end(event);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [drag]);

  const onPointerMove = (event: DragPoint) => {
    if (!drag || event.pointerId !== drag.pointerId) return;

    const { items: all, getGroup: group, setGroup: assign } = latest.current;
    const current = liveIds ? applyOrder(all, liveIds) : all;
    const dragged = current.find((i) => i.id === drag.id);
    if (!dragged) return;

    const { clientX: x, clientY: y } = event;

    // The target is usually off screen when the grip is picked up, so the page
    // has to come to meet it. The loop keeps running while the pointer rests at
    // an edge, which is exactly when no move events arrive.
    trackPointer(x, y);

    /*
     * Outside the list entirely. The preview stops following the pointer while
     * this is true, because the item is no longer being placed among its
     * siblings; it is being offered somewhere else.
     */
    const outside = latest.current.externalDrop;
    if (outside) {
      const zone = outside.zoneAt(x, y);
      if (zone !== overZone.current) {
        overZone.current = zone;
        outside.onHover?.(zone);
      }
      if (zone) return;
    }

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

  const endDrag = (event: DragPoint) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    stopAutoScroll();

    const outside = latest.current.externalDrop;
    const zone = overZone.current;
    overZone.current = null;
    outside?.onHover?.(null);

    if (outside && zone) {
      // It left the list rather than moving inside it, so the reorder that was
      // being previewed is abandoned rather than committed.
      const item = latest.current.items.find((i) => i.id === drag.id);
      if (item) outside.onDrop(item, zone);
      setDrag(null);
      setLiveIds(null);
      return;
    }

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

  // Refreshed every render, so the window listeners always run today's logic.
  handlers.current = { move: onPointerMove, end: endDrag };

  return {
    ordered,
    draggingId: drag?.id ?? null,
    announcement,
    groupRef: registerGroup,
    itemRef: registerItem,
    /** Spread onto the grip button — never onto a text field. */
    rowProps,
    handleProps: (item: T) => ({
      type: "button" as const,
      "aria-label": `Reorder ${label(item)}. ${hint}`,
      onPointerDown: onPointerDown(item),
      // No move or up handler here on purpose: the window carries the rest of
      // the gesture, and a second path would run the same logic twice.
      onKeyDown: onKeyDown(item),
      // Without this the browser scrolls the page instead of tracking the drag.
      style: { touchAction: "none" as const },
    }),
  };
}
