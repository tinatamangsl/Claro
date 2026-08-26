import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { useSortable } from "./use-sortable";

type Item = { id: string; text: string; bucket: string };

/**
 * A list whose rows really do remount when an item changes lane, because each
 * bucket renders its own `<ul>`. That is what Today does, and it is the whole
 * reason these tests exist.
 */
function Lists({
  start,
  onDrop,
  zoneAt,
}: {
  start: Item[];
  onDrop?: (item: Item, zone: string) => void;
  zoneAt?: (x: number, y: number) => string | null;
}) {
  const [items, setItems] = useState(start);
  const sortable = useSortable<Item>({
    items,
    label: (i) => i.text,
    onReorder: setItems,
    getGroup: (i) => i.bucket,
    setGroup: (i, bucket) => ({ ...i, bucket }),
    externalDrop:
      onDrop && zoneAt ? { zoneAt, onDrop, onHover: () => {} } : undefined,
  });

  return (
    <div>
      {["task", "project"].map((bucket) => (
        <ul key={bucket} aria-label={bucket}>
          {sortable.ordered
            .filter((i) => i.bucket === bucket)
            .map((item) => (
              <li key={item.id} ref={sortable.itemRef(item.id)}>
                <button {...sortable.handleProps(item)} />
                <span>{item.text}</span>
              </li>
            ))}
        </ul>
      ))}
    </div>
  );
}

const items: Item[] = [
  { id: "a", text: "Email the accountant", bucket: "task" },
  { id: "b", text: "Draft the deck", bucket: "task" },
];

const grip = (text: string) =>
  screen.getByRole("button", { name: new RegExp(`^Reorder ${text}`) });

/** A window-level pointer event, which is where a live drag is now followed. */
const atWindow = (type: string, clientX: number, clientY: number) =>
  fireEvent(
    window,
    new PointerEvent(type, { pointerId: 1, clientX, clientY, bubbles: true }),
  );

describe("a drag survives the row being remounted under it", () => {
  it("keeps tracking after the grip's own node has gone", () => {
    const onDrop = vi.fn();
    // Anything past x=500 is the schedule, as far as this test is concerned.
    const zoneAt = (x: number) => (x > 500 ? "15:00" : null);
    render(<Lists start={items} onDrop={onDrop} zoneAt={zoneAt} />);

    const handle = grip("Email the accountant");
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 10, clientY: 400 });

    // The row is torn out of the document mid-gesture. A real lane change does
    // exactly this, and it is what silently killed every drag below 1024px:
    // the capture lived on this node, so every later move went elsewhere.
    handle.remove();

    atWindow("pointermove", 600, 300);
    atWindow("pointerup", 600, 300);

    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop.mock.calls[0][0].id).toBe("a");
    expect(onDrop.mock.calls[0][1]).toBe("15:00");
  });

  it("ignores a pointer that is not the one that started the drag", () => {
    const onDrop = vi.fn();
    render(<Lists start={items} onDrop={onDrop} zoneAt={(x) => (x > 500 ? "15:00" : null)} />);

    fireEvent.pointerDown(grip("Email the accountant"), {
      pointerId: 1,
      button: 0,
      clientX: 10,
      clientY: 400,
    });

    // A second finger elsewhere on the glass must not carry the first one's item.
    fireEvent(
      window,
      new PointerEvent("pointerup", { pointerId: 2, clientX: 600, clientY: 300, bubbles: true }),
    );

    expect(onDrop).not.toHaveBeenCalled();
  });

  it("stops listening once the drag is over, so a stray move moves nothing", () => {
    const onDrop = vi.fn();
    render(<Lists start={items} onDrop={onDrop} zoneAt={(x) => (x > 500 ? "15:00" : null)} />);

    fireEvent.pointerDown(grip("Email the accountant"), {
      pointerId: 1,
      button: 0,
      clientX: 10,
      clientY: 400,
    });
    atWindow("pointerup", 10, 400);
    onDrop.mockClear();

    atWindow("pointermove", 600, 300);
    atWindow("pointerup", 600, 300);

    expect(onDrop).not.toHaveBeenCalled();
  });
});
