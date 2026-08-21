import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CycleCalendar } from "./CycleCalendar";
import type { CycleState, ISODate } from "@/lib/types";

type Spec = ISODate | [ISODate, ISODate | null];

const cycleWith = (...specs: Spec[]): CycleState => ({
  settings: { enabled: true, optedInAt: "2026-01-01T09:00:00.000Z" },
  entries: Object.fromEntries(
    specs.map((spec, i) => {
      const [startDate, endDate] = Array.isArray(spec) ? spec : [spec, null];
      return [
        `e${i}`,
        { id: `e${i}`, startDate, endDate, loggedAt: `${startDate}T09:00:00.000Z` },
      ];
    }),
  ),
  checkIns: {},
  lastSeen: null,
});

const TODAY: ISODate = "2026-08-19";

const setup = (cycle: CycleState) => {
  const onReplace = vi.fn();
  const onDelete = vi.fn();
  const view = render(
    <CycleCalendar cycle={cycle} todayId={TODAY} onReplace={onReplace} onDelete={onDelete} />,
  );
  return { ...view, onReplace, onDelete };
};

describe("the cycle calendar", () => {
  it("opens on the month containing today", () => {
    setup(cycleWith());

    expect(screen.getByText("August 2026")).toBeTruthy();
  });

  it("draws a logged period as one band across every day it covers", () => {
    const { container } = setup(cycleWith(["2026-08-03", "2026-08-06"]));

    expect(container.querySelectorAll(".cycle-band")).toHaveLength(4);
    expect(container.querySelectorAll(".cycle-band-start")).toHaveLength(1);
    expect(container.querySelectorAll(".cycle-band-end")).toHaveLength(1);
  });

  it("leaves an ongoing period's edge open rather than closing it at today", () => {
    const { container } = setup(cycleWith("2026-08-17"));

    // 17th, 18th and today.
    expect(container.querySelectorAll(".cycle-band")).toHaveLength(3);
    expect(container.querySelectorAll(".cycle-band-open")).toHaveLength(1);
    expect(container.querySelectorAll(".cycle-band-end")).toHaveLength(0);
  });

  it("draws the estimate in a different treatment, never as a logged day", () => {
    const { container } = setup(
      cycleWith(
        ["2026-06-01", "2026-06-04"],
        ["2026-06-29", "2026-07-02"],
        ["2026-07-27", "2026-07-30"],
      ),
    );

    // 24th through 27th August, estimated from the user's own dates.
    expect(container.querySelectorAll(".cycle-estimate")).toHaveLength(4);
    expect(container.querySelectorAll(".cycle-band.cycle-estimate")).toHaveLength(0);
    expect(screen.getByText(/Estimated 24 Aug to 27 Aug/)).toBeTruthy();
  });

  it("names both treatments in a key beside the grid", () => {
    setup(cycleWith(["2026-08-03", "2026-08-06"]));

    expect(screen.getByText("Logged by you")).toBeTruthy();
    expect(screen.getByText("Estimated next period")).toBeTruthy();
  });

  it("says in the accessible name what a day is", () => {
    setup(cycleWith(["2026-08-03", "2026-08-06"]));

    expect(screen.getByRole("button", { name: /4 August, logged period day/ })).toBeTruthy();
  });
});

describe("logging from the calendar", () => {
  it("opens the day's actions rather than logging on the first tap", () => {
    const { onReplace } = setup(cycleWith());

    fireEvent.click(screen.getByRole("button", { name: /^\S+ 10 August/ }));

    expect(onReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "A period started on this day" })).toBeTruthy();
  });

  it("records a historic start as ongoing, with no end invented for it", () => {
    const { onReplace } = setup(cycleWith());

    fireEvent.click(screen.getByRole("button", { name: /^\S+ 10 August/ }));
    fireEvent.click(screen.getByRole("button", { name: "A period started on this day" }));

    expect(onReplace).toHaveBeenCalledTimes(1);
    const entries = onReplace.mock.calls[0][0] as Record<string, { startDate: string; endDate: string | null }>;
    const saved = Object.values(entries)[0];
    expect(saved.startDate).toBe("2026-08-10");
    expect(saved.endDate).toBeNull();
  });

  it("closes an ongoing period on the day the user picks", () => {
    const { onReplace } = setup(cycleWith("2026-08-14"));

    fireEvent.click(screen.getByRole("button", { name: /^\S+ 18 August/ }));
    fireEvent.click(screen.getByRole("button", { name: "My period ended on this day" }));

    const entries = onReplace.mock.calls[0][0] as Record<string, { endDate: string | null }>;
    expect(entries.e0.endDate).toBe("2026-08-18");
  });

  it("refuses to log a day that has not happened yet", () => {
    setup(cycleWith());

    fireEvent.click(screen.getByRole("button", { name: /^\S+ 25 August/ }));

    expect(screen.getByText(/has not happened yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "A period started on this day" })).toBeNull();
  });

  it("offers no second start on a day already inside a logged period", () => {
    // This is what makes a duplicate or an overlap unreachable from the grid:
    // the day is already spoken for, so only editing it is on offer.
    const { onReplace } = setup(cycleWith(["2026-08-03", "2026-08-06"], "2026-08-14"));

    fireEvent.click(screen.getByRole("button", { name: /^\S+ 16 August/ }));

    expect(onReplace).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "A period started on this day" })).toBeNull();
    expect(screen.getByRole("button", { name: /Delete this period/ })).toBeTruthy();
  });

  it("shows a logged period's dates and length when its day is chosen", () => {
    const { container } = setup(cycleWith(["2026-08-03", "2026-08-06"]));

    fireEvent.click(screen.getByRole("button", { name: /^\S+ 5 August/ }));

    const panel = container.querySelector(".paper-panel")!;
    expect(panel.textContent).toContain("Part of the period you logged from 3 Aug");
    expect(panel.textContent).toContain("to 6 Aug");
    expect(panel.textContent).toContain("4 days");
  });

  it("deletes a whole period from the day that was chosen", () => {
    const { onDelete } = setup(cycleWith(["2026-08-03", "2026-08-06"]));

    fireEvent.click(screen.getByRole("button", { name: /^\S+ 5 August/ }));
    fireEvent.click(screen.getByRole("button", { name: /Delete this period/ }));

    expect(onDelete).toHaveBeenCalledWith("e0");
  });

  it("never predicts fertility, ovulation or pregnancy anywhere on it", () => {
    const { container } = setup(
      cycleWith(
        ["2026-06-01", "2026-06-04"],
        ["2026-06-29", "2026-07-02"],
        ["2026-07-27", "2026-07-30"],
      ),
    );

    const text = container.textContent!.toLowerCase();
    for (const banned of ["fertile", "fertility", "ovulation", "pregnan", "conceive"]) {
      expect(text).not.toContain(banned);
    }
  });
});
