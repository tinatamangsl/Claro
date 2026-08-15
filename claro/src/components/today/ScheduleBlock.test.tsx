import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleBlock } from "./ScheduleBlock";
import { blankDay } from "@/lib/storage";
import type { Day, ScheduleItem } from "@/lib/types";

const dayWith = (scheduleItems: ScheduleItem[]): Day => ({
  ...blankDay("2026-08-15"),
  scheduleItems,
});

const slot = (label: string) => screen.getByLabelText(`Schedule at ${label}`);

describe("ScheduleBlock", () => {
  it("renders one slot per hour from 5 AM to 10 PM", () => {
    render(<ScheduleBlock day={dayWith([])} onChange={vi.fn()} />);

    expect(slot("5 AM")).toBeDefined();
    expect(slot("12 PM")).toBeDefined();
    expect(slot("10 PM")).toBeDefined();
    expect(screen.queryByLabelText("Schedule at 11 PM")).toBeNull();
    expect(screen.queryByLabelText("Schedule at 4 AM")).toBeNull();
  });

  it("creates an item for an empty slot", () => {
    const onChange = vi.fn();
    render(<ScheduleBlock day={dayWith([])} onChange={onChange} />);

    const input = slot("9 AM");
    fireEvent.change(input, { target: { value: "Deep work" } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledTimes(1);
    const [items] = onChange.mock.calls[0] as [ScheduleItem[]];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ time: "09:00", text: "Deep work" });
    expect(items[0].id).toBeTruthy();
  });

  it("shows an existing item in its slot", () => {
    const day = dayWith([{ id: "s1", time: "13:00", text: "Lunch" }]);
    render(<ScheduleBlock day={day} onChange={vi.fn()} />);

    expect((slot("1 PM") as HTMLInputElement).value).toBe("Lunch");
    expect((slot("2 PM") as HTMLInputElement).value).toBe("");
  });

  it("edits in place rather than adding a duplicate", () => {
    const onChange = vi.fn();
    const day = dayWith([{ id: "s1", time: "13:00", text: "Lunch" }]);
    render(<ScheduleBlock day={day} onChange={onChange} />);

    const input = slot("1 PM");
    fireEvent.change(input, { target: { value: "Lunch + walk" } });
    fireEvent.blur(input);

    const [items] = onChange.mock.calls[0] as [ScheduleItem[]];
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("s1"); // same item, not a replacement
    expect(items[0].text).toBe("Lunch + walk");
  });

  it("removes the item when a slot is cleared", () => {
    const onChange = vi.fn();
    const day = dayWith([
      { id: "s1", time: "13:00", text: "Lunch" },
      { id: "s2", time: "16:00", text: "Call" },
    ]);
    render(<ScheduleBlock day={day} onChange={onChange} />);

    const input = slot("1 PM");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    const [items] = onChange.mock.calls[0] as [ScheduleItem[]];
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("s2"); // the untouched slot survives
  });

  it("ignores whitespace-only input on an empty slot", () => {
    const onChange = vi.fn();
    render(<ScheduleBlock day={dayWith([])} onChange={onChange} />);

    const input = slot("7 AM");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps other slots untouched when one is edited", () => {
    const onChange = vi.fn();
    const day = dayWith([{ id: "s1", time: "09:00", text: "Deep work" }]);
    render(<ScheduleBlock day={day} onChange={onChange} />);

    const input = slot("4 PM");
    fireEvent.change(input, { target: { value: "Investor call" } });
    fireEvent.blur(input);

    const [items] = onChange.mock.calls[0] as [ScheduleItem[]];
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.time === "09:00")?.text).toBe("Deep work");
    expect(items.find((i) => i.time === "16:00")?.text).toBe("Investor call");
  });
});
