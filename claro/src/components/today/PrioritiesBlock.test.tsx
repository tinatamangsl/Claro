import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PrioritiesBlock } from "./PrioritiesBlock";
import { blankDay, blankPriority, blankQuarter } from "@/lib/storage";
import type { Day, Priority, Quarter } from "@/lib/types";

const p = (text: string, patch: Partial<Priority> = {}): Priority => ({
  ...blankPriority(),
  id: text,
  text,
  originDayId: "2026-08-19",
  ...patch,
});

const quarter = (): Quarter => ({
  ...blankQuarter("2026-Q3"),
  work: {
    mainQuest: "Take Claro to real users",
    sideQuests: [{ id: "s1", text: "Write the launch note", done: false }],
  },
});

const dayWith = (patch: Partial<Day>): Day => ({ ...blankDay("2026-08-19"), ...patch });

const renderBlock = (day: Day) => {
  const spies = { onPatch: vi.fn(), onReorder: vi.fn() };
  const utils = render(
    <PrioritiesBlock day={day} quarter={quarter()} {...spies} />,
  );
  return { ...utils, spies };
};

describe("PrioritiesBlock — three clear priorities", () => {
  it("offers exactly three slots, no more and no fewer", () => {
    renderBlock(dayWith({}));

    expect(screen.getByLabelText("Priority 1")).toBeTruthy();
    expect(screen.getByLabelText("Priority 2")).toBeTruthy();
    expect(screen.getByLabelText("Priority 3")).toBeTruthy();
    expect(screen.queryByLabelText("Priority 4")).toBeNull();
  });

  it("writes into the slot that was edited", () => {
    const { spies } = renderBlock(dayWith({}));

    const field = screen.getByLabelText("Priority 2");
    fireEvent.change(field, { target: { value: "Call the accountant" } });
    fireEvent.blur(field);

    expect(spies.onPatch).toHaveBeenCalledWith("priority2", { text: "Call the accountant" });
  });
});

describe("PrioritiesBlock — readability", () => {
  const long =
    "Ship the store — get the whole checkout flow working end to end, including the refund path nobody has tested yet";

  it("uses a field that wraps, so a long priority is never clipped", () => {
    renderBlock(dayWith({ priority1: p(long) }));

    const field = screen.getByLabelText("Priority 1");
    // An <input> cannot wrap at any width; a textarea can.
    expect(field.tagName).toBe("TEXTAREA");
    expect((field as HTMLTextAreaElement).value).toBe(long);
  });

  it("does not clip the text with a truncation class", () => {
    renderBlock(dayWith({ priority1: p(long) }));

    expect(screen.getByLabelText("Priority 1").className).not.toMatch(/truncate/);
  });
});

describe("PrioritiesBlock — goal context", () => {
  it("names the linked goal once, not twice", () => {
    renderBlock(dayWith({ priority1: p("Ship it", { goal: { category: "workMain" } }) }));

    // The tag carries the words; the select sits invisibly over it. Two visible
    // copies of the Main Quest on one line is the bug this guards.
    expect(screen.getAllByText("Take Claro to real users")).toHaveLength(1);
  });

  it("offers a link on every slot that has no goal", () => {
    renderBlock(dayWith({ priority1: p("Ship it") }));

    expect(screen.getAllByText("Link a goal")).toHaveLength(3);
  });

  it("says so plainly when the linked goal has since gone", () => {
    renderBlock(
      dayWith({ priority1: p("Ship it", { goal: { category: "lifeMain" } }) }),
    );

    expect(screen.getByText("That goal is no longer set")).toBeTruthy();
  });

  it("keeps the picker operable as a real select", () => {
    const { spies } = renderBlock(dayWith({ priority1: p("Ship it") }));

    fireEvent.change(screen.getByLabelText("Link priority 1 to a goal"), {
      target: { value: "workSide:s1" },
    });

    expect(spies.onPatch).toHaveBeenCalledWith("priority1", {
      goal: { category: "workSide", sideQuestId: "s1" },
    });
  });
});

describe("PrioritiesBlock — reordering", () => {
  const day = () =>
    dayWith({ priority1: p("First"), priority2: p("Second"), priority3: p("Third") });

  it("moves a priority down with the keyboard", () => {
    const { spies } = renderBlock(day());

    fireEvent.keyDown(screen.getByRole("button", { name: /Reorder First/ }), {
      key: "ArrowDown",
    });

    const [next] = spies.onReorder.mock.calls[0] as [Priority[]];
    expect(next.map((x) => x.text)).toEqual(["Second", "First", "Third"]);
  });

  it("moves a priority up with the keyboard", () => {
    const { spies } = renderBlock(day());

    fireEvent.keyDown(screen.getByRole("button", { name: /Reorder Third/ }), {
      key: "ArrowUp",
    });

    const [next] = spies.onReorder.mock.calls[0] as [Priority[]];
    expect(next.map((x) => x.text)).toEqual(["First", "Third", "Second"]);
  });

  it("will not move the top priority off the top", () => {
    const { spies } = renderBlock(day());

    fireEvent.keyDown(screen.getByRole("button", { name: /Reorder First/ }), { key: "ArrowUp" });

    expect(spies.onReorder).not.toHaveBeenCalled();
  });

  it("hands back all three slots, so a blank slot is never dropped", () => {
    const { spies } = renderBlock(dayWith({ priority1: p("Only one") }));

    fireEvent.keyDown(screen.getByRole("button", { name: /Reorder Only one/ }), {
      key: "ArrowDown",
    });

    const [next] = spies.onReorder.mock.calls[0] as [Priority[]];
    expect(next).toHaveLength(3);
  });

  it("does not make the text field itself draggable", () => {
    const { container } = renderBlock(day());

    expect(container.querySelector('textarea[draggable="true"]')).toBeNull();
  });
});
