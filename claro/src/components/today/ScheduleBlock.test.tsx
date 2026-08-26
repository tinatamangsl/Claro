import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleBlock } from "./ScheduleBlock";
import { blankDay, blankPriority } from "@/lib/storage";
import type { Day, ScheduleItem } from "@/lib/types";

const dayWith = (scheduleItems: ScheduleItem[], patch: Partial<Day> = {}): Day => ({
  ...blankDay("2026-08-15"),
  ...patch,
  scheduleItems,
});

const block = (id: string, time: string, text: string, done = false): ScheduleItem => ({
  id,
  time,
  text,
  link: null,
  done,
});

const slot = (label: string) => screen.getByLabelText(`Schedule at ${label}`);

const renderSchedule = (
  day: Day,
  props: Partial<React.ComponentProps<typeof ScheduleBlock>> = {},
) => {
  const spies = { onChange: vi.fn(), onToggle: vi.fn() };
  const utils = render(
    <ScheduleBlock day={day} habits={{}} completions={{}} {...spies} {...props} />,
  );
  return { ...utils, spies };
};

describe("ScheduleBlock", () => {
  it("renders one slot per hour from 5 AM to 10 PM", () => {
    renderSchedule(dayWith([]));

    expect(slot("5 AM")).toBeDefined();
    expect(slot("12 PM")).toBeDefined();
    expect(slot("10 PM")).toBeDefined();
    expect(screen.queryByLabelText("Schedule at 11 PM")).toBeNull();
    expect(screen.queryByLabelText("Schedule at 4 AM")).toBeNull();
  });

  it("creates an item for an empty slot", () => {
    const { spies } = renderSchedule(dayWith([]));
    const onChange = spies.onChange;

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
    const day = dayWith([block("s1", "13:00", "Lunch")]);
    renderSchedule(day);

    expect((slot("1 PM") as HTMLInputElement).value).toBe("Lunch");
    expect((slot("2 PM") as HTMLInputElement).value).toBe("");
  });

  it("edits in place rather than adding a duplicate", () => {
    const day = dayWith([block("s1", "13:00", "Lunch")]);
    const { spies } = renderSchedule(day);
    const onChange = spies.onChange;

    const input = slot("1 PM");
    fireEvent.change(input, { target: { value: "Lunch + walk" } });
    fireEvent.blur(input);

    const [items] = onChange.mock.calls[0] as [ScheduleItem[]];
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("s1"); // same item, not a replacement
    expect(items[0].text).toBe("Lunch + walk");
  });

  it("removes the item when a slot is cleared", () => {
    const day = dayWith([
      block("s1", "13:00", "Lunch"),
      block("s2", "16:00", "Call"),
    ]);
    const { spies } = renderSchedule(day);
    const onChange = spies.onChange;

    const input = slot("1 PM");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    const [items] = onChange.mock.calls[0] as [ScheduleItem[]];
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("s2"); // the untouched slot survives
  });

  it("ignores whitespace-only input on an empty slot", () => {
    const { spies } = renderSchedule(dayWith([]));
    const onChange = spies.onChange;

    const input = slot("7 AM");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps other slots untouched when one is edited", () => {
    const day = dayWith([block("s1", "09:00", "Deep work")]);
    const { spies } = renderSchedule(day);
    const onChange = spies.onChange;

    const input = slot("4 PM");
    fireEvent.change(input, { target: { value: "Investor call" } });
    fireEvent.blur(input);

    const [items] = onChange.mock.calls[0] as [ScheduleItem[]];
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.time === "09:00")?.text).toBe("Deep work");
    expect(items.find((i) => i.time === "16:00")?.text).toBe("Investor call");
  });
});

describe("ScheduleBlock completion", () => {
  const priority = (id: string, text: string, done = false) => ({
    ...blankPriority(),
    id,
    text,
    done,
  });

  it("gives a standalone block an accessible checkbox naming the hour", () => {
    renderSchedule(dayWith([block("s1", "09:00", "Deep work")]));

    expect(
      screen.getByRole("checkbox", { name: "Complete Deep work at 9 AM" }),
    ).toBeTruthy();
  });

  it("reports the row that was ticked, and nothing else", () => {
    const { spies } = renderSchedule(
      dayWith([block("s1", "09:00", "Deep work"), block("s2", "13:00", "Lunch")]),
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Complete Deep work at 9 AM" }));

    expect(spies.onToggle).toHaveBeenCalledTimes(1);
    expect(spies.onToggle).toHaveBeenCalledWith("s1");
    expect(spies.onChange).not.toHaveBeenCalled();
  });

  it("shows a standalone block as complete when it is", () => {
    renderSchedule(dayWith([block("s1", "09:00", "Deep work", true)]));

    expect(
      (screen.getByRole("checkbox", { name: "Complete Deep work at 9 AM" }) as HTMLButtonElement)
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("reads a linked row's title and completion from the priority", () => {
    renderSchedule(
      dayWith(
        [
          {
            id: "s1",
            time: "09:00",
            text: "an old snapshot",
            link: { kind: "priority", priorityId: "p1" },
            done: false,
          },
        ],
        { priority1: priority("p1", "Ship the store", true) },
      ),
    );

    expect(screen.getByText("Ship the store")).toBeTruthy();
    expect(screen.queryByText("an old snapshot")).toBeNull();
    expect(
      screen
        .getByRole("checkbox", { name: /Complete Ship the store, the priority at 9 AM/ })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("does not offer a linked row as editable text", () => {
    renderSchedule(
      dayWith(
        [
          {
            id: "s1",
            time: "09:00",
            text: "Ship the store",
            link: { kind: "priority", priorityId: "p1" },
            done: false,
          },
        ],
        { priority1: priority("p1", "Ship the store") },
      ),
    );

    // The hour's field is gone: its words belong to the priority.
    expect(screen.queryByLabelText("Schedule at 9 AM")).toBeNull();
  });

  it("marks a row whose linked record has gone, without offering to edit it", () => {
    renderSchedule(
      dayWith([
        {
          id: "s1",
          time: "09:00",
          text: "Ship the store",
          link: { kind: "priority", priorityId: "gone" },
          done: false,
        },
      ]),
    );

    expect(screen.getByText("Ship the store")).toBeTruthy();
    expect(screen.getByText(/no longer here/)).toBeTruthy();
    expect(screen.queryByLabelText("Schedule at 9 AM")).toBeNull();
    // Nothing to tick: there is no record to complete.
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("lets an unresolved row be removed, taking nothing else with it", () => {
    const { spies } = renderSchedule(
      dayWith([
        {
          id: "s1",
          time: "09:00",
          text: "Ship the store",
          link: { kind: "priority", priorityId: "gone" },
          done: false,
        },
        block("s2", "13:00", "Lunch"),
      ]),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove the 9 AM row" }));

    const [items] = spies.onChange.mock.calls[0] as [ScheduleItem[]];
    expect(items.map((i) => i.id)).toEqual(["s2"]);
  });

  it("shows a habit row against that day's completion", () => {
    const habits = {
      h1: { id: "h1", name: "Ten pages", createdAt: "x", archivedAt: null },
    };
    const completions = {
      "h1:2026-08-15": {
        id: "h1:2026-08-15",
        habitId: "h1",
        dayId: "2026-08-15",
        completedAt: "x",
      },
    };

    renderSchedule(
      dayWith([
        { id: "s1", time: "07:00", text: "Ten pages", link: { kind: "habit", habitId: "h1" }, done: false },
      ]),
      { habits, completions },
    );

    expect(
      screen
        .getByRole("checkbox", { name: /Complete Ten pages, the habit at 7 AM/ })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });
});

describe("ScheduleBlock — quarter hours", () => {
  it("keeps a block at half past in its own hour's row", () => {
    renderSchedule(dayWith([block("a", "13:00", "Call"), block("b", "13:30", "Follow up")]));

    // Both sit under 1 PM rather than one of them vanishing.
    const values = [...document.querySelectorAll("textarea")].map(
      (t) => (t as HTMLTextAreaElement).value,
    );
    expect(values).toContain("Call");
    expect(values).toContain("Follow up");
    // And the one off the hour says which minute it is on, as a control that
    // can move it within the hour.
    expect(screen.getByRole("button", { name: "Time of the block at 1:30 PM" })).toBeTruthy();
  });

  it("offers the next free quarter on an hour that already has something", () => {
    renderSchedule(dayWith([block("a", "13:00", "Call")]));

    expect(screen.getByRole("button", { name: "Add another at 1 PM" })).toBeTruthy();
    // An empty hour needs no such affordance: its line is already there.
    expect(screen.queryByRole("button", { name: "Add another at 2 PM" })).toBeNull();
  });

  it("writes the new block at the next free quarter, not over the one there", () => {
    const { spies } = renderSchedule(dayWith([block("a", "13:00", "Call")]));

    fireEvent.click(screen.getByRole("button", { name: "Add another at 1 PM" }));
    const field = screen.getByLabelText("What happens at 1:15 PM");
    fireEvent.change(field, { target: { value: "Follow up" } });
    fireEvent.blur(field);

    const written = spies.onChange.mock.calls[0][0] as ScheduleItem[];
    expect(written.map((i) => `${i.time} ${i.text}`)).toEqual([
      "13:00 Call",
      "13:15 Follow up",
    ]);
  });

  it("adds one extra line at a time, so the page stays calm", () => {
    renderSchedule(dayWith([block("a", "13:00", "Call"), block("b", "14:00", "Review")]));

    fireEvent.click(screen.getByRole("button", { name: "Add another at 1 PM" }));
    expect(screen.getByLabelText("What happens at 1:15 PM")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add another at 2 PM" }));
    expect(screen.queryByLabelText("What happens at 1:15 PM")).toBeNull();
    expect(screen.getByLabelText("What happens at 2:15 PM")).toBeTruthy();
  });
});
