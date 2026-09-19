import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HabitIntentEditor } from "./HabitIntentEditor";
import type { Habit } from "@/lib/types";

const habit = (patch: Partial<Habit> = {}): Habit => ({
  id: "h1",
  name: "Run",
  createdAt: "2026-09-01T09:00:00.000Z",
  archivedAt: null,
  ...patch,
});

const setup = (h: Habit = habit()) => {
  const onPatch = vi.fn();
  render(<HabitIntentEditor habit={h} onPatch={onPatch} onDone={vi.fn()} />);
  return { onPatch };
};

describe("saying how often a habit is meant to happen", () => {
  it("treats no target as a real answer, not an empty state", () => {
    setup();

    // "Any" is selected, and the copy does not ask to be configured.
    expect(screen.getByRole("button", { name: "Any" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/No target/)).toBeTruthy();
  });

  it("sets a plain count, and drops any pinned days with it", () => {
    const { onPatch } = setup(habit({ targetDays: [1, 3] }));

    fireEvent.click(screen.getByRole("button", { name: "4 days a week" }));

    /*
     * Choosing a number means the days stopped being the point. Leaving them
     * behind would produce a row reading "1 of 4" with two days marked, which
     * is the contradiction `weeklyIntent` exists to prevent.
     */
    expect(onPatch).toHaveBeenCalledWith({ targetPerWeek: 4, targetDays: [] });
  });

  it("lets pinned days set the number, so the two cannot disagree", () => {
    const { onPatch } = setup(habit({ targetDays: [1] }));

    fireEvent.click(screen.getByRole("button", { name: "Thursday" }));

    expect(onPatch).toHaveBeenCalledWith({ targetDays: [1, 4], targetPerWeek: 2 });
  });

  it("unpins a day that was already chosen", () => {
    const { onPatch } = setup(habit({ targetDays: [1, 4] }));

    fireEvent.click(screen.getByRole("button", { name: /^Monday/ }));

    expect(onPatch).toHaveBeenCalledWith({ targetDays: [4], targetPerWeek: 1 });
  });

  it("clears the target back to any day", () => {
    const { onPatch } = setup(habit({ targetPerWeek: 3 }));

    fireEvent.click(screen.getByRole("button", { name: "Any" }));

    expect(onPatch).toHaveBeenCalledWith({ targetPerWeek: null, targetDays: [] });
  });

  it("renames without emptying the habit", () => {
    const { onPatch } = setup();

    const field = screen.getByLabelText("Rename Run");
    fireEvent.change(field, { target: { value: "  Morning run  " } });
    fireEvent.blur(field);
    expect(onPatch).toHaveBeenCalledWith({ name: "Morning run" });

    // Blank is refused rather than wiping the name.
    onPatch.mockClear();
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.blur(field);
    expect(onPatch).not.toHaveBeenCalled();
  });

  it("explains what each choice means without scolding", () => {
    render(
      <HabitIntentEditor habit={habit({ targetDays: [1, 3] })} onPatch={vi.fn()} onDone={vi.fn()} />,
    );

    // Doing it on an unplanned day still counts, and the copy says so.
    expect(screen.getByText(/Doing it on another day still counts/)).toBeTruthy();
    for (const banned of ["must", "should", "failed", "missed", "streak"]) {
      expect(document.body.textContent!.toLowerCase()).not.toContain(banned);
    }
  });
});
