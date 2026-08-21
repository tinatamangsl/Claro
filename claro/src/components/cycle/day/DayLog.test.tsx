import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DayLog } from "./DayLog";
import { blankCheckIn, blankCycle } from "@/lib/storage";
import type { CycleCheckIn, CycleState, ISODate } from "@/lib/types";

const TODAY: ISODate = "2026-08-21";

/** Three starts 28 days apart, the last five days ago, so Day 6 is knowable. */
const withHistory = (): CycleState => ({
  ...blankCycle(),
  settings: { enabled: true, optedInAt: "2026-01-01T09:00:00.000Z" },
  entries: Object.fromEntries(
    ["2026-06-21", "2026-07-19", "2026-08-16"].map((startDate, i) => [
      `e${i}`,
      { id: `e${i}`, startDate, endDate: null, loggedAt: "x" },
    ]),
  ),
});

const setup = (options: { cycle?: CycleState; note?: Partial<CycleCheckIn> } = {}) => {
  const onWrite = vi.fn();
  const onDone = vi.fn();
  const view = render(
    <DayLog
      cycle={options.cycle ?? blankCycle()}
      todayId={TODAY}
      note={{ ...blankCheckIn(TODAY, new Date()), ...options.note }}
      onWrite={onWrite}
      onDone={onDone}
    />,
  );
  return { ...view, onWrite, onDone };
};

afterEach(() => vi.useRealTimers());

describe("the cycle day context line", () => {
  it("counts the day from the user's own logged dates", () => {
    const { container } = setup({ cycle: withHistory() });

    expect(container.textContent).toContain("Day 6 of your cycle");
  });

  it("names where the day sits positionally, never physiologically", () => {
    const { container } = setup({ cycle: withHistory() });

    expect(container.textContent).toContain("Early in your estimated cycle");
    const text = container.textContent!.toLowerCase();
    for (const banned of ["luteal", "follicular", "ovulat", "fertil", "hormone"]) {
      expect(text).not.toContain(banned);
    }
  });

  it("says plainly that it is an estimate", () => {
    const { container } = setup({ cycle: withHistory() });

    expect(container.textContent).toContain("not medical information");
  });

  it("says nothing rather than guessing without enough history", () => {
    const { container } = setup();

    expect(container.textContent).toContain("Not enough logged dates for a day count");
    expect(container.textContent).not.toContain("Day 1 of your cycle");
  });
});

describe("three taps", () => {
  it("writes one energy reading, and one only", () => {
    const { onWrite } = setup();

    fireEvent.click(screen.getByRole("button", { name: "High" }));

    expect(onWrite).toHaveBeenCalledTimes(1);
    expect(onWrite).toHaveBeenCalledWith({ energy: 4 });
  });

  it("shows the stored level in the right band, however it was entered", () => {
    // A 5 recorded on the fuller page reads as HIGH here.
    setup({ note: { energy: 5 } });

    expect(screen.getByRole("button", { name: "High" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Low" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps a level that is already inside the band, rather than flattening it", () => {
    const { onWrite } = setup({ note: { energy: 5 } });

    // Tapping the band it is already in clears it; tapping across writes.
    fireEvent.click(screen.getByRole("button", { name: "Low" }));
    expect(onWrite).toHaveBeenCalledWith({ energy: 2 });
  });

  it("clears the reading when the selected band is tapped again", () => {
    const { onWrite } = setup({ note: { energy: 3 } });

    fireEvent.click(screen.getByRole("button", { name: "Medium" }));
    expect(onWrite).toHaveBeenCalledWith({ energy: null });
  });

  it("records a word for the day without touching anything else", () => {
    const { onWrite } = setup();

    fireEvent.click(screen.getByRole("button", { name: /Scattered/ }));

    expect(onWrite).toHaveBeenCalledWith({ feeling: "scattered" });
  });

  it("offers all six words, and only one can be chosen", () => {
    setup({ note: { feeling: "calm" } });

    for (const label of ["Focused", "Scattered", "Calm", "Anxious", "Motivated", "Exhausted"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeTruthy();
    }
    const pressed = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
  });

  it("keeps the note optional and understated", () => {
    const { onWrite } = setup();
    const field = screen.getByLabelText("Anything notable about today");

    expect(screen.getByText("(optional)")).toBeTruthy();
    fireEvent.change(field, { target: { value: "slept badly" } });
    expect(onWrite).toHaveBeenCalledWith({ note: "slept badly" });
  });
});

describe("confirming", () => {
  it("replaces the form with one line, then moves on", () => {
    vi.useFakeTimers();
    const { onDone } = setup({ cycle: withHistory(), note: { energy: 3 } });

    fireEvent.click(screen.getByRole("button", { name: "log it" }));

    // Nothing happens silently: the confirmation is a real state.
    expect(screen.getByRole("status").textContent).toContain("logged");
    expect(screen.queryByRole("button", { name: "log it" })).toBeNull();
    expect(onDone).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(1500));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("promises to read notes back, never to predict the day", () => {
    vi.useFakeTimers();
    setup();

    fireEvent.click(screen.getByRole("button", { name: "log it" }));

    const line = screen.getByRole("status").textContent!.toLowerCase();
    expect(line).toContain("your own notes");
    for (const banned of ["today holds", "predict", "you will"]) {
      expect(line).not.toContain(banned);
    }
  });

  it("does not fire the transition after the screen has gone", () => {
    vi.useFakeTimers();
    const { onDone, unmount } = setup();

    fireEvent.click(screen.getByRole("button", { name: "log it" }));
    unmount();
    act(() => void vi.advanceTimersByTime(3000));

    expect(onDone).not.toHaveBeenCalled();
  });
});
