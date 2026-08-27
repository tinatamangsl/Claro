import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CycleCalendar } from "./CycleCalendar";
import { blankCheckIn } from "@/lib/storage";
import type { CycleState, ISODate } from "@/lib/types";

type Spec = ISODate | [ISODate, ISODate | null];

const cycleWith = (...specs: Spec[]): CycleState => ({
  settings: { enabled: true, optedInAt: "2026-01-01T09:00:00.000Z", cycleLength: null },
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
  guidanceMatches: {},
});

const TODAY: ISODate = "2026-08-19";

const setup = (cycle: CycleState) => {
  const onReplace = vi.fn();
  const onDelete = vi.fn();
  const onWriteNote = vi.fn();
  const onLogged = vi.fn();
  const view = render(
    <CycleCalendar
      cycle={cycle}
      todayId={TODAY}
      onReplace={onReplace}
      onDelete={onDelete}
      onLogged={onLogged}
      noteOn={(dayId) => blankCheckIn(dayId, new Date())}
      onWriteNote={onWriteNote}
    />,
  );
  return { ...view, onReplace, onDelete, onWriteNote, onLogged };
};

/**
 * A press, a move across, and a release: the drag that paints a range.
 *
 * `pointerover` rather than `pointerenter`, because React implements
 * `onPointerEnter` on top of the bubbling `pointerover` event and never sees a
 * dispatched `pointerenter` at all.
 */
const paint = (from: HTMLElement, through: HTMLElement[]) => {
  fireEvent.pointerDown(from, { pointerId: 1 });
  for (const cell of through) fireEvent.pointerOver(cell, { pointerId: 1 });
  fireEvent.pointerUp(through[through.length - 1] ?? from, { pointerId: 1 });
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

    // 24th through 27th August is the next one, and the projection carries on
    // past it: a calendar somebody plans a year on needs every future period,
    // not only the one after this.
    expect(container.querySelectorAll(".cycle-estimate").length).toBeGreaterThanOrEqual(4);
    expect(container.querySelectorAll(".cycle-band.cycle-estimate")).toHaveLength(0);
    // The next window in words is on the today card beside this grid, not
    // repeated under it: see cycle.test.tsx.
  });

  it("draws later projections fainter than the next one", () => {
    const { container } = setup(
      cycleWith(
        ["2026-06-01", "2026-06-04"],
        ["2026-06-29", "2026-07-02"],
        ["2026-07-27", "2026-07-30"],
      ),
    );

    // September's period is a cycle further out than August's.
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(container.querySelectorAll(".cycle-estimate-far").length).toBeGreaterThan(0);
  });

  it("marks today so it survives a phase colour behind it", () => {
    // Bold type alone disappeared once every cell carried a wash.
    const { container } = setup(cycleWith());

    const today = container.querySelector('[aria-current="date"]')!;
    expect(today.className).toContain("ring-2");
    expect(today.getAttribute("aria-label")).toContain("today");
  });

  it("keys the phase washes, and only those", () => {
    const { container } = setup(cycleWith(["2026-08-03", "2026-08-06"]));

    /*
     * The colours are the one thing on this grid a reader cannot work out by
     * looking, so they keep a key. A second key naming "logged by you",
     * "estimated periods" and "today" went: today is the ringed cell, and
     * tapping any day says in words what that day is, which the test below
     * covers. Five lines of legend under a colour-coded calendar was most of
     * why this page kept reading as cluttered.
     */
    for (const phase of ["Menstrual", "Follicular", "Ovulation", "Luteal"]) {
      expect(screen.getByText(phase)).toBeTruthy();
    }
    expect(screen.getByText("Estimated. Fainter means further ahead.")).toBeTruthy();
    expect(container.textContent).not.toContain("Logged by you");
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

  it("names the estimated phases, including ovulation, as phases", () => {
    const { container } = setup(
      cycleWith(
        ["2026-06-01", "2026-06-04"],
        ["2026-06-29", "2026-07-02"],
        ["2026-07-27", "2026-07-30"],
      ),
    );

    const text = container.textContent!;
    for (const phase of ["Menstrual", "Follicular", "Ovulation", "Luteal"]) {
      expect(text).toContain(phase);
    }
  });

  it("says the phases are estimated wherever it draws them", () => {
    const { container } = setup(
      cycleWith(
        ["2026-06-01", "2026-06-04"],
        ["2026-06-29", "2026-07-02"],
        ["2026-07-27", "2026-07-30"],
      ),
    );

    // The word is on the calendar itself; the full statement is said once at
    // page level, where the route test checks it.
    expect(container.textContent).toContain("Estimated");
    expect(container.textContent).toContain("Fainter means further ahead");
  });

  it("never turns the ovulation band into a fertility prediction", () => {
    // This is the line the phase colours must not cross. Naming a phase is a
    // label on an estimate; a fertile window is a claim about a body.
    const { container } = setup(
      cycleWith(
        ["2026-06-01", "2026-06-04"],
        ["2026-06-29", "2026-07-02"],
        ["2026-07-27", "2026-07-30"],
      ),
    );

    const sentences = container.textContent!.toLowerCase().split(/(?<=[.?!])\s+/);
    for (const sentence of sentences) {
      for (const phrase of [
        "fertile window",
        "most fertile",
        "chance of pregnancy",
        "chance of conceiving",
        "best time to",
      ]) {
        if (!sentence.includes(phrase)) continue;
        expect(sentence).toMatch(/\bnot\b|\bcannot\b|\bnever\b|does not/);
      }
    }
  });
});

describe("painting a period by dragging", () => {
  const dayCell = (name: RegExp) => screen.getByRole("button", { name });

  it("logs the whole range in one gesture", () => {
    const { onReplace } = setup(cycleWith());

    paint(dayCell(/^\S+ 10 August/), [
      dayCell(/^\S+ 11 August/),
      dayCell(/^\S+ 12 August/),
      dayCell(/^\S+ 13 August/),
    ]);

    expect(onReplace).toHaveBeenCalledTimes(1);
    const saved = Object.values(
      onReplace.mock.calls[0][0] as Record<string, { startDate: string; endDate: string | null }>,
    )[0];
    expect(saved.startDate).toBe("2026-08-10");
    expect(saved.endDate).toBe("2026-08-13");
  });

  it("writes once on release, not once per day dragged across", () => {
    const { onReplace } = setup(cycleWith());

    paint(dayCell(/^\S+ 10 August/), [
      dayCell(/^\S+ 11 August/),
      dayCell(/^\S+ 12 August/),
    ]);

    expect(onReplace).toHaveBeenCalledTimes(1);
  });

  it("reads a backwards drag as the same range", () => {
    const { onReplace } = setup(cycleWith());

    paint(dayCell(/^\S+ 13 August/), [
      dayCell(/^\S+ 12 August/),
      dayCell(/^\S+ 11 August/),
      dayCell(/^\S+ 10 August/),
    ]);

    const saved = Object.values(
      onReplace.mock.calls[0][0] as Record<string, { startDate: string; endDate: string | null }>,
    )[0];
    expect(saved.startDate).toBe("2026-08-10");
    expect(saved.endDate).toBe("2026-08-13");
  });

  it("treats a press without a drag as a tap, not a one day period", () => {
    const { onReplace } = setup(cycleWith());
    const cell = dayCell(/^\S+ 10 August/);

    fireEvent.pointerDown(cell, { pointerId: 1 });
    fireEvent.pointerUp(cell, { pointerId: 1 });
    fireEvent.click(cell);

    expect(onReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "A period started on this day" })).toBeTruthy();
  });

  it("refuses to start a drag on a day already inside a logged period", () => {
    // Otherwise a drag could quietly paint over a period that is already there.
    const { onReplace } = setup(cycleWith(["2026-08-03", "2026-08-06"]));

    paint(dayCell(/^\S+ 4 August/), [dayCell(/^\S+ 5 August/)]);

    expect(onReplace).not.toHaveBeenCalled();
  });

  it("will not drag into days that have not happened", () => {
    const { onReplace } = setup(cycleWith());

    // The 25th is next week: the drag simply does not extend to it, so this
    // ends up a press on the 18th rather than a range running into the future.
    paint(dayCell(/^\S+ 18 August/), [dayCell(/^\S+ 25 August/)]);

    expect(onReplace).not.toHaveBeenCalled();
  });

  it("stops the range at today when the drag runs past it", () => {
    const { onReplace } = setup(cycleWith());

    paint(dayCell(/^\S+ 17 August/), [
      dayCell(/^\S+ 18 August/),
      dayCell(/^\S+ 19 August/),
      dayCell(/^\S+ 25 August/),
    ]);

    const saved = Object.values(
      onReplace.mock.calls[0][0] as Record<string, { startDate: string; endDate: string | null }>,
    )[0];
    expect(saved.startDate).toBe("2026-08-17");
    expect(saved.endDate).toBe(TODAY);
  });

  it("refuses a painted range that overlaps one already logged, and says why", () => {
    const { onReplace, container } = setup(cycleWith(["2026-08-10", "2026-08-13"]));

    paint(dayCell(/^\S+ 7 August/), [
      dayCell(/^\S+ 8 August/),
      dayCell(/^\S+ 9 August/),
      dayCell(/^\S+ 10 August/),
    ]);

    expect(onReplace).not.toHaveBeenCalled();
    expect(container.textContent).toContain("overlaps a period you have already logged");
  });
});

describe("how heavy a day was", () => {
  it("records the user's own observation on a logged day", () => {
    const { onWriteNote } = setup(cycleWith(["2026-08-03", "2026-08-06"]));

    fireEvent.click(screen.getByRole("button", { name: /^\S+ 4 August/ }));
    fireEvent.click(screen.getByRole("button", { name: /Heavy/ }));

    expect(onWriteNote).toHaveBeenCalledWith("2026-08-04", { flow: "heavy" });
  });

  it("passes no judgement on what was chosen", () => {
    const { container } = setup(cycleWith(["2026-08-03", "2026-08-06"]));

    fireEvent.click(screen.getByRole("button", { name: /^\S+ 4 August/ }));

    expect(container.textContent).toContain("says nothing about what it means");
    const text = container.textContent!.toLowerCase();
    for (const banned of ["normal", "abnormal", "too heavy", "concerning", "see a doctor"]) {
      expect(text).not.toContain(banned);
    }
  });

  it("offers it only on a day inside a logged period", () => {
    setup(cycleWith(["2026-08-03", "2026-08-06"]));

    fireEvent.click(screen.getByRole("button", { name: /^\S+ 12 August/ }));

    expect(screen.queryByRole("button", { name: /Heavy/ })).toBeNull();
  });
});
