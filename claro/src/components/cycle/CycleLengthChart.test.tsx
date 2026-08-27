import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CycleLengthChart, MAX_GAPS_PLOTTED, MIN_GAPS_TO_PLOT } from "./CycleLengthChart";
import { blankCycle } from "@/lib/storage";
import { shiftDayId } from "@/lib/dates";
import type { CycleState, ISODate } from "@/lib/types";

/** A cycle whose logged starts sit the given number of days apart, in order. */
const withGaps = (...gaps: number[]): CycleState => {
  const starts: ISODate[] = ["2026-01-05"];
  for (const gap of gaps) starts.push(shiftDayId(starts[starts.length - 1], gap));

  return {
    ...blankCycle(),
    settings: { enabled: true, optedInAt: "2026-01-01T09:00:00.000Z", cycleLength: null },
    entries: Object.fromEntries(
      starts.map((startDate, i) => [`e${i}`, { id: `e${i}`, startDate, endDate: null, loggedAt: "x" }]),
    ),
  };
};

const chart = () => screen.queryByRole("img");

describe("the cycle length chart", () => {
  it("says what is missing instead of drawing a line through one point", () => {
    const { container } = render(<CycleLengthChart cycle={withGaps(28)} />);

    expect(chart()).toBeNull();
    expect(container.textContent).toContain("Once you have logged three period starts");
    expect(container.textContent).toContain("There is 1 gap so far");
  });

  it("draws nothing at all from an empty cycle, and still explains why", () => {
    const { container } = render(<CycleLengthChart cycle={blankCycle()} />);

    expect(chart()).toBeNull();
    expect(container.textContent).toContain("There are 0 gaps so far");
  });

  it("draws a point for every gap once there are two", () => {
    const { container } = render(<CycleLengthChart cycle={withGaps(27, 30)} />);

    expect(container.querySelectorAll("[data-point]")).toHaveLength(MIN_GAPS_TO_PLOT);
    expect(container.querySelector("polyline")?.getAttribute("points")?.split(" ")).toHaveLength(2);
  });

  it("puts the numbers in the accessible name, so the line is not the only way in", () => {
    render(<CycleLengthChart cycle={withGaps(27, 30, 26)} />);

    expect(chart()?.getAttribute("aria-label")).toBe(
      "Your last 3 recorded cycle lengths, in days: 27, 30, 26.",
    );
  });

  it("shows the most recent gaps and says how many it left out", () => {
    const many = Array.from({ length: 11 }, (_, i) => 26 + i);
    const { container } = render(<CycleLengthChart cycle={withGaps(...many)} />);

    expect(container.querySelectorAll("[data-point]")).toHaveLength(MAX_GAPS_PLOTTED);
    // The oldest gaps are off the left edge, and the caption is honest that
    // the count it rests on is larger than the count it drew.
    expect(container.textContent).toContain("Drawn from 11 recorded gaps, the last 8 shown");
    expect(chart()?.getAttribute("aria-label")).toContain("29, 30, 31, 32, 33, 34, 35, 36");
  });

  it("reports the range it drew, and passes no verdict on the shape", () => {
    const { container } = render(<CycleLengthChart cycle={withGaps(24, 35, 29)} />);

    expect(container.textContent).toContain("Between 24 and 35 days");
    /*
     * The supplied design captioned its chart "steady enough that Claro can
     * plan around it", which grades the line and reads a cause into a wobble.
     * A variable cycle is not a warning and this must never imply it is.
     */
    for (const verdict of ["steady", "irregular", "normal", "regular", "healthy", "concern"]) {
      expect(container.textContent?.toLowerCase()).not.toContain(verdict);
    }
  });

  it("keeps a flat run readable rather than collapsing it onto one line", () => {
    const { container } = render(<CycleLengthChart cycle={withGaps(28, 28, 28)} />);

    const tops = [...container.querySelectorAll<HTMLElement>("[data-point]")].map(
      (dot) => dot.style.top,
    );
    // Identical values share a height, and that height is inside the box
    // rather than pinned to an edge by a divide-by-zero.
    expect(new Set(tops).size).toBe(1);
    const pct = Number.parseFloat(tops[0]);
    expect(pct).toBeGreaterThan(10);
    expect(pct).toBeLessThan(90);
  });

  it("draws a mis-logged gap rather than hiding it", () => {
    // estimateNext filters an implausible gap out before taking a median. The
    // chart must not, or there is no way to see the bad entry and fix it.
    render(<CycleLengthChart cycle={withGaps(28, 3, 29)} />);

    expect(chart()?.getAttribute("aria-label")).toContain("28, 3, 29");
  });
});
