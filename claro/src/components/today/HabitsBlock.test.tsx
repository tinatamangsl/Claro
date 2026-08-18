import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HabitsBlock } from "./HabitsBlock";
import { habitCompletionId, type Habit, type HabitCompletion } from "@/lib/types";

const WEEK = [
  "2026-08-17",
  "2026-08-18",
  "2026-08-19",
  "2026-08-20",
  "2026-08-21",
  "2026-08-22",
  "2026-08-23",
];

const habit = (id: string, name: string): Habit => ({
  id,
  name,
  createdAt: `2026-08-0${id.length}T09:00:00.000Z`,
  archivedAt: null,
});

const completions = (...pairs: [string, string][]): Record<string, HabitCompletion> =>
  Object.fromEntries(
    pairs.map(([habitId, dayId]) => [
      habitCompletionId(habitId, dayId),
      { id: habitCompletionId(habitId, dayId), habitId, dayId, completedAt: "x" },
    ]),
  );

const handlers = () => ({
  onAdd: vi.fn(),
  onToggle: vi.fn(),
  onArchive: vi.fn(),
  onRestore: vi.fn(),
  onDelete: vi.fn(),
});

const renderHabits = (props: Partial<Parameters<typeof HabitsBlock>[0]> = {}) => {
  const spies = handlers();
  const utils = render(
    <HabitsBlock
      habits={{ h1: habit("h1", "Meditate") }}
      completions={{}}
      dayId="2026-08-18"
      weekDayIds={WEEK}
      todayId="2026-08-18"
      {...spies}
      {...props}
    />,
  );
  return { ...utils, spies };
};

describe("HabitsBlock — the weekly view", () => {
  it("shows every day of the week, Monday to Sunday", () => {
    renderHabits();

    for (const day of ["Monday 17", "Tuesday 18", "Sunday 23"]) {
      expect(screen.getByRole("checkbox", { name: new RegExp(`Meditate on ${day}`) })).toBeTruthy();
    }
  });

  it("ticks off any day of the week that has already happened", () => {
    const { spies } = renderHabits();

    fireEvent.click(screen.getByRole("checkbox", { name: /Meditate on Monday 17/ }));

    expect(spies.onToggle).toHaveBeenCalledWith("h1", "2026-08-17");
  });

  it("will not let a day that has not happened yet be ticked", () => {
    const { spies } = renderHabits({ todayId: "2026-08-18" });

    const future = screen.getByRole("checkbox", { name: /Meditate on Thursday 20/ });
    expect((future as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(future);
    expect(spies.onToggle).not.toHaveBeenCalled();
  });

  it("reports consistency as a plain count, never a streak", () => {
    renderHabits({ completions: completions(["h1", "2026-08-17"], ["h1", "2026-08-18"]) });

    expect(screen.getByText("2 days this week")).toBeTruthy();
    expect(screen.queryByText(/streak/i)).toBeNull();
  });

  it("says what a habit is for when there are none yet", () => {
    renderHabits({ habits: {} });

    expect(screen.getByText(/something you do for yourself/i)).toBeTruthy();
  });
});

describe("HabitsBlock — the celebration", () => {
  const two = { h1: habit("h1", "Meditate"), h2: habit("h22", "Walk") };
  const isConfetti = (container: HTMLElement) => container.querySelector(".confetti") !== null;

  it("stays quiet on a day that is already complete when you arrive", () => {
    const { container } = renderHabits({
      habits: two,
      completions: completions(["h1", "2026-08-18"], ["h22", "2026-08-18"]),
    });

    expect(isConfetti(container)).toBe(false);
  });

  it("celebrates once, when the last habit of the day is ticked", () => {
    const { container, rerender } = renderHabits({
      habits: two,
      completions: completions(["h1", "2026-08-18"]),
    });
    expect(isConfetti(container)).toBe(false);

    rerender(
      <HabitsBlock
        habits={two}
        completions={completions(["h1", "2026-08-18"], ["h22", "2026-08-18"])}
        dayId="2026-08-18"
        weekDayIds={WEEK}
        todayId="2026-08-18"
        {...handlers()}
      />,
    );

    expect(isConfetti(container)).toBe(true);
  });

  it("never celebrates a day with no habits on it", () => {
    const { container } = renderHabits({ habits: {}, completions: {} });

    expect(isConfetti(container)).toBe(false);
  });

  it("does not celebrate again just because the page moved to another day", () => {
    const done = completions(["h1", "2026-08-18"], ["h22", "2026-08-18"]);
    const { container, rerender } = renderHabits({ habits: two, completions: done });

    rerender(
      <HabitsBlock
        habits={two}
        completions={done}
        dayId="2026-08-17"
        weekDayIds={WEEK}
        todayId="2026-08-18"
        {...handlers()}
      />,
    );

    expect(isConfetti(container)).toBe(false);
  });
});
