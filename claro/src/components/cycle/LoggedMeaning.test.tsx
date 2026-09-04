import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { LoggedMeaning } from "./LoggedMeaning";
import { blankCycle } from "@/lib/storage";
import type { CycleState, ISODate } from "@/lib/types";

const TODAY: ISODate = "2026-08-22";

type Spec = [ISODate, ISODate | null];

const cycleWith = (...specs: Spec[]): CycleState => ({
  ...blankCycle(),
  settings: { enabled: true, optedInAt: "2026-01-01T09:00:00.000Z", cycleLength: null, syncConsentAt: null },
  entries: Object.fromEntries(
    specs.map(([startDate, endDate], i) => [
      `e${i}`,
      { id: `e${i}`, startDate, endDate, loggedAt: "x" },
    ]),
  ),
});

const setup = (cycle: CycleState, startDate: ISODate) => {
  const onReplace = vi.fn();
  const onUndo = vi.fn();
  const onMoved = vi.fn();
  const onDismiss = vi.fn();
  const view = render(
    <LoggedMeaning
      cycle={cycle}
      todayId={TODAY}
      startDate={startDate}
      onReplace={onReplace}
      onUndo={onUndo}
      onMoved={onMoved}
      onDismiss={onDismiss}
    />,
  );
  return { ...view, onReplace, onUndo, onMoved, onDismiss };
};

describe("taking back a period that landed on the wrong days", () => {
  it("puts undo in the same place as the action, not in a list somewhere", () => {
    setup(cycleWith(["2026-08-14", "2026-08-17"]), "2026-08-14");

    expect(screen.getByRole("button", { name: /Undo this/ })).toBeTruthy();
    expect(screen.getByText("Wrong days? Fix it here.")).toBeTruthy();
  });

  it("undoes in one tap, with no confirmation to sit through", () => {
    // Undo is not a destructive decision; it is the correction of one.
    const { onUndo } = setup(cycleWith(["2026-08-14", "2026-08-17"]), "2026-08-14");

    fireEvent.click(screen.getByRole("button", { name: /Undo this/ }));

    expect(onUndo).toHaveBeenCalledWith("e0");
  });

  it("says what was recorded, so the user can see it is the wrong range", () => {
    const { container } = setup(cycleWith(["2026-08-14", "2026-08-17"]), "2026-08-14");

    expect(container.textContent).toContain("14 Aug to 17 Aug, 4 days");
  });

  it("corrects by nudging a day at a time, not by typing a date", () => {
    // The correction people actually make is "that was a day earlier".
    const { onReplace } = setup(cycleWith(["2026-08-14", "2026-08-17"]), "2026-08-14");

    fireEvent.click(screen.getByRole("button", { name: /Change the dates/ }));
    fireEvent.click(screen.getByRole("button", { name: "One day later for the started date" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const entries = onReplace.mock.calls[0][0] as Record<string, { startDate: string }>;
    expect(entries.e0.startDate).toBe("2026-08-15");
  });

  it("shows the range in words and days, so it can be checked at a glance", () => {
    const { container } = setup(cycleWith(["2026-08-14", "2026-08-17"]), "2026-08-14");

    fireEvent.click(screen.getByRole("button", { name: /Change the dates/ }));

    expect(container.textContent).toContain("14 Aug");
    expect(container.textContent).toContain("8 days ago");
    expect(container.textContent).toContain("4 days");
  });

  it("will not let the arrows build a range that could not exist", () => {
    // An invalid range is better made unreachable than refused afterwards.
    setup(cycleWith(["2026-08-22", "2026-08-22"]), "2026-08-22");

    fireEvent.click(screen.getByRole("button", { name: /Change the dates/ }));

    // Today is the 22nd, so neither end can move forward and the end cannot
    // move back past the start.
    expect(
      screen.getByRole("button", { name: "One day later for the started date" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "One day earlier for the ended date" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("follows the period when its start moves, so the card does not vanish", () => {
    const { onMoved } = setup(cycleWith(["2026-08-14", "2026-08-17"]), "2026-08-14");

    fireEvent.click(screen.getByRole("button", { name: /Change the dates/ }));
    fireEvent.click(screen.getByRole("button", { name: "One day later for the started date" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onMoved).toHaveBeenCalledWith("2026-08-15");
  });

  it("refuses a correction that would overlap another period, and says why", () => {
    // The earlier period runs up to the 13th, so nudging this one's start onto
    // it is an overlap rather than a duplicate start.
    const cycle = cycleWith(["2026-08-11", "2026-08-13"], ["2026-08-14", "2026-08-17"]);
    const { onReplace, container } = setup(cycle, "2026-08-14");

    fireEvent.click(screen.getByRole("button", { name: /Change the dates/ }));
    fireEvent.click(screen.getByRole("button", { name: "One day earlier for the started date" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onReplace).not.toHaveBeenCalled();
    expect(container.textContent).toContain("overlaps a period you have already logged");
  });

  it("keeps the correction closed until it is wanted", () => {
    setup(cycleWith(["2026-08-14", "2026-08-17"]), "2026-08-14");

    expect(
      screen.queryByRole("button", { name: "One day earlier for the started date" }),
    ).toBeNull();
  });
});

describe("what the card explains", () => {
  it("keeps cycle length and period duration apart", () => {
    const { container } = setup(cycleWith(["2026-08-14", "2026-08-17"]), "2026-08-14");

    expect(container.textContent).toContain(
      "first day of one period to the first day of the next",
    );
  });

  it("says plainly when there is not enough history to estimate from", () => {
    const { container } = setup(cycleWith(["2026-08-14", "2026-08-17"]), "2026-08-14");

    expect(container.textContent).toContain("cannot estimate a next date yet");
  });

  it("names where an estimate came from once there is one", () => {
    const cycle = cycleWith(
      ["2026-06-01", "2026-06-04"],
      ["2026-06-29", "2026-07-02"],
      ["2026-07-27", "2026-07-30"],
    );
    const { container } = setup(cycle, "2026-07-27");

    expect(container.textContent).toContain("the median of 2 recorded gaps");
    expect(container.textContent).toContain("an estimate, not a certainty");
  });

  it("predicts nothing about the body it just recorded a period for", () => {
    const { container } = setup(cycleWith(["2026-08-14", "2026-08-17"]), "2026-08-14");
    const text = container.textContent!.toLowerCase();

    for (const banned of [
      "luteal",
      "follicular",
      "ovulat",
      "fertile",
      "you will feel",
      "expect to",
      "your body is",
      "rest is productive",
    ]) {
      expect(text).not.toContain(banned);
    }
  });

  it("shows nothing at all once the period is gone", () => {
    const { container } = setup(blankCycle(), "2026-08-14");

    expect(container.innerHTML).toBe("");
  });
});
