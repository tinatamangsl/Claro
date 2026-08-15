import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AddItem } from "./AddItem";

const open = (label = "Add a thing") => {
  fireEvent.click(screen.getByRole("button", { name: label }));
  return screen.getByLabelText(label);
};

describe("AddItem", () => {
  it("shows a quiet button until clicked", () => {
    render(<AddItem label="Add a thing" onAdd={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Add a thing" })).toBeDefined();
    expect(screen.queryByLabelText("Add a thing")).toBeNull();
  });

  it("adds on Enter", () => {
    const onAdd = vi.fn();
    render(<AddItem label="Add a thing" onAdd={onAdd} />);

    const input = open();
    fireEvent.change(input, { target: { value: "書 something" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onAdd).toHaveBeenCalledWith("書 something");
  });

  it("stays open after Enter so several can be added in a row", () => {
    const onAdd = vi.fn();
    render(<AddItem label="Add a thing" onAdd={onAdd} />);

    const input = open();
    fireEvent.change(input, { target: { value: "first" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "second" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onAdd).toHaveBeenNthCalledWith(1, "first");
    expect(onAdd).toHaveBeenNthCalledWith(2, "second");
    expect(screen.getByLabelText("Add a thing")).toBeDefined();
  });

  it("clears the input between entries", () => {
    render(<AddItem label="Add a thing" onAdd={vi.fn()} />);

    const input = open() as HTMLInputElement;
    fireEvent.change(input, { target: { value: "first" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input.value).toBe("");
  });

  it("trims whitespace and ignores blank submissions", () => {
    const onAdd = vi.fn();
    render(<AddItem label="Add a thing" onAdd={onAdd} />);

    const input = open();
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "  padded  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith("padded");
  });

  it("commits pending text on blur", () => {
    const onAdd = vi.fn();
    render(<AddItem label="Add a thing" onAdd={onAdd} />);

    const input = open();
    fireEvent.change(input, { target: { value: "clicked away" } });
    fireEvent.blur(input);

    expect(onAdd).toHaveBeenCalledWith("clicked away");
  });

  it("Escape abandons the entry without adding", () => {
    const onAdd = vi.fn();
    render(<AddItem label="Add a thing" onAdd={onAdd} />);

    const input = open();
    fireEvent.change(input, { target: { value: "never mind" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onAdd).not.toHaveBeenCalled();
  });

  it("replaces itself with an explanation at a cap", () => {
    // The cap is a product decision, so it explains itself rather than erroring.
    render(
      <AddItem
        label="Add a thing"
        onAdd={vi.fn()}
        disabled
        disabledHint="Three is the limit — that's the point."
      />,
    );

    expect(screen.queryByRole("button", { name: "Add a thing" })).toBeNull();
    expect(screen.getByText("Three is the limit — that's the point.")).toBeDefined();
  });
});
