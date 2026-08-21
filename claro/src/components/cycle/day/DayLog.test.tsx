import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DayLog } from "./DayLog";
import { blankCheckIn, blankCycle } from "@/lib/storage";
import type { CycleCheckIn, CycleState, ISODate } from "@/lib/types";

const TODAY: ISODate = "2026-08-21";

/** Three completed periods 28 days apart, the last one closed. */
const withHistory = (openLast = false): CycleState => ({
  ...blankCycle(),
  settings: { enabled: true, optedInAt: "2026-01-01T09:00:00.000Z", cycleLength: null },
  entries: Object.fromEntries(
    [
      ["2026-06-21", "2026-06-25"],
      ["2026-07-19", "2026-07-23"],
      ["2026-08-16", openLast ? null : "2026-08-20"],
    ].map(([startDate, endDate], i) => [
      `e${i}`,
      { id: `e${i}`, startDate: startDate as ISODate, endDate: endDate as ISODate | null, loggedAt: "x" },
    ]),
  ),
});

const setup = (options: { cycle?: CycleState; note?: Partial<CycleCheckIn> } = {}) => {
  const onWrite = vi.fn();
  const onPeriod = vi.fn();
  const onDone = vi.fn();
  const view = render(
    <DayLog
      cycle={options.cycle ?? withHistory()}
      todayId={TODAY}
      note={{ ...blankCheckIn(TODAY, new Date()), ...options.note }}
      onWrite={onWrite}
      onPeriod={onPeriod}
      onDone={onDone}
    />,
  );
  return { ...view, onWrite, onPeriod, onDone };
};

afterEach(() => vi.useRealTimers());

describe("one question at a time", () => {
  it("shows the period question first, and nothing else with it", () => {
    const { container } = setup();

    expect(screen.getByRole("heading", { name: "Has your period started?" })).toBeTruthy();
    expect(container.textContent).not.toContain("How are you feeling right now?");
    expect(container.textContent).not.toContain("What's your energy like today?");
  });

  it("moves on when an answer is chosen, with no submit button in between", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: "No, not yet" }));

    expect(screen.getByRole("heading", { name: "How are you feeling right now?" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Next/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Continue/ })).toBeNull();
  });

  it("completes in three taps", () => {
    vi.useFakeTimers();
    const { onWrite, onDone } = setup();

    fireEvent.click(screen.getByRole("button", { name: "No, not yet" }));
    fireEvent.click(screen.getByRole("button", { name: /Motivated/ }));
    fireEvent.click(screen.getByRole("button", { name: /High/ }));

    expect(onWrite).toHaveBeenCalledWith({ feeling: "motivated" });
    expect(onWrite).toHaveBeenCalledWith({ energy: 4 });
    expect(screen.getByRole("status")).toBeTruthy();

    act(() => void vi.advanceTimersByTime(1500));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("the period question", () => {
  it("logs a start today", () => {
    const { onPeriod } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Yes, today" }));

    expect(onPeriod).toHaveBeenCalledWith({ kind: "started", daysAgo: 0 });
  });

  it("asks how many days ago, and logs the day that was picked", () => {
    const { onPeriod } = setup();

    fireEvent.click(screen.getByRole("button", { name: "It started a few days ago" }));
    expect(screen.getByRole("heading", { name: "How many days ago?" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(onPeriod).toHaveBeenCalledWith({ kind: "started", daysAgo: 3 });
  });

  it("offers a way through without logging one at all", () => {
    // A flow whose only answers are yes is not asking a question.
    const { onPeriod } = setup();

    fireEvent.click(screen.getByRole("button", { name: "No, not yet" }));

    expect(onPeriod).toHaveBeenCalledWith({ kind: "none" });
    expect(screen.getByRole("heading", { name: "How are you feeling right now?" })).toBeTruthy();
  });

  it("asks whether an open period has ended, rather than asking if it started", () => {
    const { onPeriod } = setup({ cycle: withHistory(true) });

    expect(screen.getByRole("heading", { name: "Is your period still going?" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Yes, today" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "It ended today" }));
    expect(onPeriod).toHaveBeenCalledWith({ kind: "ended" });
  });

  it("leaves an open period alone when it is still going", () => {
    const { onPeriod } = setup({ cycle: withHistory(true) });

    fireEvent.click(screen.getByRole("button", { name: "Yes, still going" }));

    expect(onPeriod).toHaveBeenCalledWith({ kind: "none" });
  });
});

describe("the energy question", () => {
  it("writes the level for the band that was tapped", () => {
    const { onWrite } = setup();

    fireEvent.click(screen.getByRole("button", { name: "No, not yet" }));
    fireEvent.click(screen.getByRole("button", { name: /Calm/ }));
    fireEvent.click(screen.getByRole("button", { name: /Low/ }));

    expect(onWrite).toHaveBeenCalledWith({ energy: 2 });
  });

  it("keeps a level already inside the band, rather than flattening it", () => {
    const { onWrite } = setup({ note: { energy: 5 } });

    fireEvent.click(screen.getByRole("button", { name: "No, not yet" }));
    fireEvent.click(screen.getByRole("button", { name: /Calm/ }));
    fireEvent.click(screen.getByRole("button", { name: /High/ }));

    expect(onWrite).toHaveBeenCalledWith({ energy: 5 });
  });
});

describe("the completion line", () => {
  it("reflects what was entered, and prescribes nothing", () => {
    vi.useFakeTimers();
    setup();

    fireEvent.click(screen.getByRole("button", { name: "No, not yet" }));
    fireEvent.click(screen.getByRole("button", { name: /Calm/ }));
    fireEvent.click(screen.getByRole("button", { name: /Medium/ }));

    const line = screen.getByRole("status").textContent!.toLowerCase();
    expect(line).toContain("logged");
    expect(line).toContain("your own words");

    for (const banned of [
      "rest is productive",
      "finish, don't start",
      "your peak window",
      "energy is building",
      "should",
      "protect",
    ]) {
      expect(line).not.toContain(banned);
    }
  });

  it("names where the day sits positionally, never physiologically", () => {
    vi.useFakeTimers();
    setup();

    fireEvent.click(screen.getByRole("button", { name: "No, not yet" }));
    fireEvent.click(screen.getByRole("button", { name: /Calm/ }));
    fireEvent.click(screen.getByRole("button", { name: /Medium/ }));

    const line = screen.getByRole("status").textContent!.toLowerCase();
    expect(line).toContain("in your estimated cycle");
    for (const banned of ["luteal", "follicular", "ovulat", "menstrual phase"]) {
      expect(line).not.toContain(banned);
    }
  });

  it("does not fire the transition after the screen has gone", () => {
    vi.useFakeTimers();
    const { onDone, unmount } = setup();

    fireEvent.click(screen.getByRole("button", { name: "No, not yet" }));
    fireEvent.click(screen.getByRole("button", { name: /Calm/ }));
    fireEvent.click(screen.getByRole("button", { name: /Medium/ }));
    unmount();
    act(() => void vi.advanceTimersByTime(3000));

    expect(onDone).not.toHaveBeenCalled();
  });
});
