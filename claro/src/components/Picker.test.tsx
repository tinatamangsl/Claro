import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Picker } from "./Picker";

const options = [
  { value: "a", label: "First" },
  { value: "b", label: "Second" },
];

/**
 * jsdom gives every element a zero rect, so the trigger's position has to be
 * dictated for the "which way does it open" decision to be testable at all.
 */
const triggerAt = (top: number) => {
  vi.spyOn(HTMLButtonElement.prototype, "getBoundingClientRect").mockReturnValue({
    top,
    bottom: top + 24,
    left: 0,
    right: 80,
    width: 80,
    height: 24,
    x: 0,
    y: top,
    toJSON: () => ({}),
  });
};

const open = () => fireEvent.click(screen.getByRole("button", { name: "Pick one" }));
/** The positioned panel, which is the listbox's parent now that it may also hold a footer. */
const panel = () => screen.getByRole("listbox").parentElement!;

describe("which way the list opens", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.innerHeight = 800;
  });

  it("hangs below the trigger when there is room", () => {
    triggerAt(100);
    render(<Picker value={null} options={options} onChange={vi.fn()} placeholder="Pick" label="Pick one" />);

    open();
    expect(panel().className).not.toContain("picker-panel-above");
  });

  it("opens upward when the trigger is too near the bottom to show the list", () => {
    // 60px of room below, against a 240px panel: downward is off screen.
    triggerAt(716);
    render(<Picker value={null} options={options} onChange={vi.fn()} placeholder="Pick" label="Pick one" />);

    open();
    expect(panel().className).toContain("picker-panel-above");
  });

  it("stays downward when neither side has room, rather than swapping one clipped edge for another", () => {
    // Squeezed: 40px above, 56px below. Below is still the better of the two.
    window.innerHeight = 120;
    triggerAt(40);
    render(<Picker value={null} options={options} onChange={vi.fn()} placeholder="Pick" label="Pick one" />);

    open();
    expect(panel().className).not.toContain("picker-panel-above");
  });

  it("measures again on each opening, so a scrolled page is not answered from memory", () => {
    triggerAt(100);
    render(<Picker value={null} options={options} onChange={vi.fn()} placeholder="Pick" label="Pick one" />);

    open();
    expect(panel().className).not.toContain("picker-panel-above");
    fireEvent.keyDown(screen.getByRole("button", { name: "Pick one" }), { key: "Escape" });

    triggerAt(716);
    open();
    expect(panel().className).toContain("picker-panel-above");
  });
});
