import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PeriodHistory } from "./PeriodHistory";
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
    <PeriodHistory cycle={cycle} todayId={TODAY} onReplace={onReplace} onDelete={onDelete} />,
  );
  return { ...view, onReplace, onDelete };
};

describe("the logged period list", () => {
  it("says so plainly when nothing has been logged", () => {
    setup(cycleWith());

    expect(screen.getByText(/Nothing logged yet/)).toBeTruthy();
  });

  it("shows a completed period's dates and how many days it lasted", () => {
    const { container } = setup(cycleWith(["2026-08-03", "2026-08-06"]));

    expect(container.textContent).toContain("Monday 3 August");
    expect(container.textContent).toContain("to 6 Aug");
    expect(container.textContent).toContain("4 days");
  });

  it("shows an ongoing period as ongoing, counting only the days so far", () => {
    const { container } = setup(cycleWith("2026-08-17"));

    expect(container.textContent).toContain("Ongoing, 3 days so far");
  });

  it("distinguishes an older period whose end was never recorded", () => {
    const { container } = setup(cycleWith("2026-06-01", "2026-08-17"));

    expect(container.textContent).toContain("End not recorded");
    expect(container.textContent).toContain("Ongoing, 3 days so far");
  });

  it("reports the gap between starts as the cycle length, kept separate from duration", () => {
    const { container } = setup(cycleWith(["2026-06-01", "2026-06-04"], ["2026-06-29", "2026-07-02"]));

    expect(container.textContent).toContain("28 days after the previous start");
    expect(container.textContent).toContain("first logged");
  });
});

describe("editing a logged period", () => {
  it("changes the start and the end together", () => {
    const { onReplace } = setup(cycleWith(["2026-08-03", "2026-08-06"]));

    fireEvent.click(screen.getByRole("button", { name: /Edit the period logged on 3 Aug/ }));

    fireEvent.change(screen.getByLabelText(/Start date of the period/), {
      target: { value: "2026-08-02" },
    });
    fireEvent.change(screen.getByLabelText(/End date of the period/), {
      target: { value: "2026-08-07" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onReplace).toHaveBeenCalledTimes(1);
    const entries = onReplace.mock.calls[0][0] as Record<string, { startDate: string; endDate: string | null }>;
    expect(entries.e0.startDate).toBe("2026-08-02");
    expect(entries.e0.endDate).toBe("2026-08-07");
  });

  it("lets an end date be cleared, which puts the period back to ongoing", () => {
    const { onReplace } = setup(cycleWith(["2026-08-17", "2026-08-18"]));

    fireEvent.click(screen.getByRole("button", { name: /Edit the period logged on 17 Aug/ }));
    fireEvent.change(screen.getByLabelText(/End date of the period/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const entries = onReplace.mock.calls[0][0] as Record<string, { endDate: string | null }>;
    expect(entries.e0.endDate).toBeNull();
  });

  it("refuses an overlap and names the period it clashed with", () => {
    const { onReplace, container } = setup(
      cycleWith(["2026-08-01", "2026-08-04"], ["2026-08-10", "2026-08-13"]),
    );

    fireEvent.click(screen.getByRole("button", { name: /Edit the period logged on 10 Aug/ }));
    fireEvent.change(screen.getByLabelText(/Start date of the period/), {
      target: { value: "2026-08-03" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onReplace).not.toHaveBeenCalled();
    expect(container.textContent).toContain("overlaps a period you have already logged");
    expect(container.textContent).toContain("1 Aug to 4 Aug");
  });

  it("refuses an end date before the start, and says why", () => {
    const { onReplace, container } = setup(cycleWith(["2026-08-10", "2026-08-13"]));

    fireEvent.click(screen.getByRole("button", { name: /Edit the period logged on 10 Aug/ }));
    fireEvent.change(screen.getByLabelText(/End date of the period/), {
      target: { value: "2026-08-08" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onReplace).not.toHaveBeenCalled();
    expect(container.textContent).toContain("An end date cannot come before the start date");
  });

  it("abandons an edit on cancel, leaving the record alone", () => {
    const { onReplace } = setup(cycleWith(["2026-08-03", "2026-08-06"]));

    fireEvent.click(screen.getByRole("button", { name: /Edit the period logged on 3 Aug/ }));
    fireEvent.change(screen.getByLabelText(/Start date of the period/), {
      target: { value: "2026-08-02" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onReplace).not.toHaveBeenCalled();
    expect(screen.getByText(/Monday 3 August/)).toBeTruthy();
  });

  it("deletes a whole period record", () => {
    const { onDelete } = setup(cycleWith(["2026-08-03", "2026-08-06"]));

    fireEvent.click(screen.getByRole("button", { name: /Delete the period logged on 3 Aug/ }));

    expect(onDelete).toHaveBeenCalledWith("e0");
  });

  it("passes no verdict on any of the numbers it shows", () => {
    const { container } = setup(
      cycleWith(["2026-06-01", "2026-06-02"], ["2026-06-29", "2026-07-06"]),
    );

    const text = container.textContent!.toLowerCase();
    for (const banned of ["normal", "abnormal", "short", "long", "heavy", "light", "should"]) {
      expect(text).not.toContain(banned);
    }
  });
});
