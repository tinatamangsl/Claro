import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ActionLists } from "./ActionLists";
import type { ActionItem } from "@/lib/types";

const actions: ActionItem[] = [
  { id: "a1", text: "Email the accountant", bucket: "task", done: false, createdAt: "x" },
];

const setup = (props: Partial<React.ComponentProps<typeof ActionLists>> = {}) => {
  const onSchedule = vi.fn();
  render(
    <ActionLists
      actions={actions}
      onChange={vi.fn()}
      onSchedule={onSchedule}
      scheduleHours={["09:00", "15:00", "15:15"]}
      {...props}
    />,
  );
  return { onSchedule };
};

const timeControl = () =>
  screen.queryByRole("button", { name: 'Put "Email the accountant" on the schedule' });

describe("scheduling a task without dragging", () => {
  it("offers a time on the row itself", () => {
    setup();
    expect(timeControl()).toBeTruthy();
  });

  it("reports the slot that was chosen", () => {
    const { onSchedule } = setup();

    fireEvent.click(timeControl()!);
    fireEvent.click(screen.getByRole("option", { name: "3 PM" }));

    expect(onSchedule).toHaveBeenCalledTimes(1);
    expect(onSchedule.mock.calls[0][0].id).toBe("a1");
    expect(onSchedule.mock.calls[0][1]).toBe("15:00");
  });

  it("names every slot distinctly, so no two options in one list read alike", () => {
    setup();
    fireEvent.click(timeControl()!);

    const names = screen.getAllByRole("option").map((o) => o.textContent);
    expect(names).toEqual(["9 AM", "3 PM", "3:15 PM"]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("is reachable from the keyboard, which a drag never was", () => {
    const { onSchedule } = setup();

    const control = timeControl()!;
    control.focus();
    fireEvent.keyDown(control, { key: "Enter" });
    fireEvent.keyDown(control, { key: "ArrowDown" });
    fireEvent.keyDown(control, { key: "Enter" });

    expect(onSchedule).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }), "15:00");
  });

  it("says nothing at all when the day has no room left", () => {
    setup({ scheduleHours: [] });
    expect(timeControl()).toBeNull();
  });

  it("says nothing when the surface cannot schedule, rather than a dead control", () => {
    setup({ onSchedule: undefined });
    expect(timeControl()).toBeNull();
  });
});
