import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CarriedForwardBlock } from "./CarriedForwardBlock";
import { blankDay, blankPriority } from "@/lib/storage";
import type { CarriedItem, Day } from "@/lib/types";

const item = (patch: Partial<CarriedItem> = {}): CarriedItem => ({
  id: "c1",
  text: "Email the accountant",
  goal: null,
  origin: "priority",
  bucket: null,
  originDayId: "2026-08-17",
  createdAt: "2026-08-17T09:00:00.000Z",
  ...patch,
});

const dayWith = (patch: Partial<Day>): Day => ({ ...blankDay("2026-08-18"), ...patch });

const handlers = () => ({
  onPromote: vi.fn(),
  onKeepAsAction: vi.fn(),
  onSchedule: vi.fn(),
  onLetGo: vi.fn(),
});

describe("CarriedForwardBlock", () => {
  it("says nothing at all when nothing was carried", () => {
    const { container } = render(<CarriedForwardBlock day={dayWith({})} {...handlers()} />);

    expect(container.innerHTML).toBe("");
  });

  it("shows what came with you and where it came from", () => {
    render(<CarriedForwardBlock day={dayWith({ carriedForward: [item()] })} {...handlers()} />);

    expect(screen.getByText("Email the accountant")).toBeTruthy();
    expect(screen.getByText(/from 17 Aug/)).toBeTruthy();
  });

  it("offers all four decisions, one of which is letting it go", () => {
    render(<CarriedForwardBlock day={dayWith({ carriedForward: [item()] })} {...handlers()} />);

    expect(screen.getByRole("button", { name: /Make it a priority/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Keep as an action/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Schedule later/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Let go/ })).toBeTruthy();
  });

  it("cannot promote into a day whose three slots are taken", () => {
    const full = dayWith({
      carriedForward: [item()],
      priority1: { ...blankPriority(), text: "One" },
      priority2: { ...blankPriority(), text: "Two" },
      priority3: { ...blankPriority(), text: "Three" },
    });

    render(<CarriedForwardBlock day={full} {...handlers()} />);

    const promote = screen.getByRole("button", { name: /Make it a priority/ });
    expect((promote as HTMLButtonElement).disabled).toBe(true);
  });

  it("reports the decision the user actually made", () => {
    const spies = handlers();
    render(<CarriedForwardBlock day={dayWith({ carriedForward: [item()] })} {...spies} />);

    fireEvent.click(screen.getByRole("button", { name: /Keep as an action/ }));
    expect(spies.onKeepAsAction).toHaveBeenCalledWith("c1");

    fireEvent.click(screen.getByRole("button", { name: /Let go/ }));
    expect(spies.onLetGo).toHaveBeenCalledWith("c1");
    expect(spies.onPromote).not.toHaveBeenCalled();
  });

  it("schedules onto the day the user picked", () => {
    const spies = handlers();
    render(<CarriedForwardBlock day={dayWith({ carriedForward: [item()] })} {...spies} />);

    fireEvent.click(screen.getByRole("button", { name: /Schedule later/ }));
    fireEvent.change(screen.getByLabelText(/Schedule "Email the accountant" for/), {
      target: { value: "2026-08-25" },
    });

    expect(spies.onSchedule).toHaveBeenCalledWith("c1", "2026-08-25");
  });
});
