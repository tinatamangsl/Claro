import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Picker } from "./Picker";

const options = [
  { value: "a" as const, label: "First" },
  { value: "b" as const, label: "Second" },
];

const setup = () =>
  render(
    <div style={{ overflow: "hidden" }} data-testid="clipper">
      <Picker value={null} options={options} onChange={vi.fn()} placeholder="Pick" label="Pick one" />
    </div>,
  );

const open = () => fireEvent.click(screen.getByRole("button", { name: "Pick one" }));

describe("the list escapes whatever is clipping it", () => {
  it("renders outside the container the trigger sits in", () => {
    const { getByTestId } = setup();
    open();

    /*
     * The whole bug. `position: absolute` is clipped by any ancestor with
     * `overflow: hidden` whatever its z-index, and both `.spread` and the
     * schedule's own panel are such ancestors. On the first and last rows the
     * list was drawn almost entirely outside them and the time could not be
     * changed. A portal to the body has nothing above it to clip against.
     */
    const list = screen.getByRole("listbox");
    expect(getByTestId("clipper").contains(list)).toBe(false);
    expect(document.body.contains(list)).toBe(true);
  });

  it("closes when something outside it is pressed", () => {
    setup();
    open();
    expect(screen.queryByRole("listbox")).toBeTruthy();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("stays open when an option inside the floating panel is pressed", () => {
    setup();
    open();

    /*
     * The panel is no longer a descendant of the picker's root, so the
     * outside-press check has to ask it separately. Without that, pressing any
     * option reads as a press outside and the list shuts before the click that
     * would have chosen anything.
     */
    fireEvent.pointerDown(screen.getByRole("option", { name: "Second" }));
    expect(screen.queryByRole("listbox")).toBeTruthy();
  });

  it("chooses the option that was pressed", () => {
    const onChange = vi.fn();
    render(
      <Picker value={null} options={options} onChange={onChange} placeholder="Pick" label="Pick one" />,
    );
    open();

    fireEvent.click(screen.getByRole("option", { name: "Second" }));
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("leaves nothing behind in the body once closed", () => {
    setup();
    open();
    fireEvent.keyDown(screen.getByRole("button", { name: "Pick one" }), { key: "Escape" });

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.querySelector(".picker-panel")).toBeNull();
  });
});
