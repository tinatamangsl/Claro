import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSortable } from "./use-sortable";

type Row = { id: string; text: string };

/**
 * A row that is mostly its own text field, which is the shape the schedule has
 * and the reason row dragging needed a threshold at all.
 */
function List({ onReorder }: { onReorder: (next: Row[]) => void }) {
  const items: Row[] = [
    { id: "a", text: "standup" },
    { id: "b", text: "review" },
  ];
  const sortable = useSortable<Row>({ items, label: (i) => i.text, onReorder });

  return (
    <div>
      {sortable.ordered.map((item) => (
        <div key={item.id} data-testid={`row-${item.id}`} {...sortable.rowProps(item)}>
          <button {...sortable.handleProps(item)}>grip</button>
          <textarea aria-label={`Text ${item.id}`} defaultValue={item.text} />
          <button aria-label={`Remove ${item.id}`}>x</button>
        </div>
      ))}
      <span data-testid="dragging">{sortable.draggingId ?? "none"}</span>
    </div>
  );
}

const press = (el: Element, x: number, y: number) =>
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: x, clientY: y });

const moveTo = (x: number, y: number) =>
  act(() => {
    window.dispatchEvent(
      new PointerEvent("pointermove", { pointerId: 1, clientX: x, clientY: y, bubbles: true }),
    );
  });

const release = () =>
  act(() => {
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, bubbles: true }));
  });

const dragging = () => screen.getByTestId("dragging").textContent;

describe("picking a row up without stealing its clicks", () => {
  it("does not start a drag on a press alone", () => {
    render(<List onReorder={vi.fn()} />);

    press(screen.getByTestId("row-a"), 100, 100);
    expect(dragging()).toBe("none");

    // A press that goes nowhere is a click, and the row must stay put.
    release();
    expect(dragging()).toBe("none");
  });

  it("ignores a twitch, so a click with an unsteady hand still lands", () => {
    render(<List onReorder={vi.fn()} />);

    press(screen.getByTestId("row-a"), 100, 100);
    moveTo(102, 101);
    expect(dragging()).toBe("none");
  });

  it("starts the drag once the pointer has actually travelled", () => {
    render(<List onReorder={vi.fn()} />);

    press(screen.getByTestId("row-a"), 100, 100);
    moveTo(100, 120);
    expect(dragging()).toBe("a");
  });

  it("lets a press on text somebody is not editing pick the row up", () => {
    render(<List onReorder={vi.fn()} />);

    /*
     * A schedule row is almost entirely its own textarea, so excluding text
     * fields outright would exclude the row. A press on text nobody is editing
     * means "I am pointing at this", not "select from here".
     */
    press(screen.getByLabelText("Text a"), 100, 100);
    moveTo(100, 120);
    expect(dragging()).toBe("a");
  });

  it("leaves a field alone once it is being edited, so selecting a word still works", () => {
    render(<List onReorder={vi.fn()} />);

    const field = screen.getByLabelText("Text a");
    act(() => (field as HTMLTextAreaElement).focus());

    press(field, 100, 100);
    moveTo(100, 140);
    expect(dragging()).toBe("none");
  });

  it("never starts from a button, which owns its own press", () => {
    render(<List onReorder={vi.fn()} />);

    press(screen.getByLabelText("Remove a"), 100, 100);
    moveTo(100, 140);
    expect(dragging()).toBe("none");
  });

  it("ignores anything but the primary button", () => {
    render(<List onReorder={vi.fn()} />);

    fireEvent.pointerDown(screen.getByTestId("row-a"), {
      button: 2,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    moveTo(100, 140);
    expect(dragging()).toBe("none");
  });

  it("forgets a held press that was released, so a later move cannot resurrect it", () => {
    render(<List onReorder={vi.fn()} />);

    press(screen.getByTestId("row-a"), 100, 100);
    release();
    moveTo(100, 200);
    expect(dragging()).toBe("none");
  });
});
