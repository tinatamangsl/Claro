import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FocusView } from "./FocusView";
import {
  beginReturnBlock,
  markDistracted,
  pauseSession,
  settleSession,
  startFocusSession,
} from "@/lib/focus-session";
import { blankDay, blankPriority, blankQuarter, blankWeek } from "@/lib/storage";
import {
  FOCUS_BLOCK_MS,
  JUST_BEGIN_BLOCK_MS,
  type Day,
  type FocusSession,
  type Interruption,
  type Priority,
  type Quarter,
  type Week,
} from "@/lib/types";

const T0 = new Date("2026-08-18T09:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const MINUTE = 60_000;

const dayWith = (patch: Partial<Day>): Day => ({ ...blankDay("2026-08-18"), ...patch });

const p = (patch: Partial<Priority>): Priority => ({ ...blankPriority(), ...patch });

const withPriority = dayWith({
  priority1: p({ text: "Ship the store", done: false, goal: null }),
});

const runningSession = (plannedMs = FOCUS_BLOCK_MS): FocusSession =>
  startFocusSession({
    dayId: "2026-08-18",
    target: { kind: "priority", dayId: "2026-08-18", rank: 1, title: "Ship the store" },
    intention: "Ship the store",
    plannedMs,
    now: T0,
    timeZone: "UTC",
  });

const handlers = () => ({
  onPatchPriority: vi.fn(),
  onStart: vi.fn(),
  onDistracted: vi.fn(),
  onPause: vi.fn(),
  onResumeBlock: vi.fn(),
  onEnd: vi.fn(),
  onChooseReason: vi.fn(),
  onReturnBlock: vi.fn(),
  onResume: vi.fn(),
  onComplete: vi.fn(),
  onContinue: vi.fn(),
  onLeave: vi.fn(),
  onPark: vi.fn(),
  onExit: vi.fn(),
});

const renderFocus = (
  options: {
    day?: Day;
    week?: Week;
    quarter?: Quarter;
    session?: FocusSession | null;
    openInterruption?: Interruption | null;
    now?: Date | null;
  } = {},
) => {
  const spies = handlers();
  render(
    <FocusView
      day={options.day ?? withPriority}
      week={options.week ?? blankWeek("2026-W34")}
      quarter={options.quarter ?? blankQuarter("2026-Q3")}
      session={options.session ?? null}
      openInterruption={options.openInterruption ?? null}
      now={options.now ?? T0}
      {...spies}
    />,
  );
  return spies;
};

describe("starting a block", () => {
  it("offers twenty-five minutes and a just-begin block", () => {
    const spies = renderFocus();

    fireEvent.click(screen.getByRole("button", { name: "Start 25 minutes" }));
    expect(spies.onStart).toHaveBeenCalledWith(FOCUS_BLOCK_MS);

    fireEvent.click(screen.getByRole("button", { name: "Just begin — 5 minutes" }));
    expect(spies.onStart).toHaveBeenCalledWith(JUST_BEGIN_BLOCK_MS);
  });

  it("names the priority it is about to work on", () => {
    renderFocus();

    expect(screen.getByText("Ship the store")).toBeDefined();
  });

  it("asks for a priority first when the day is empty", () => {
    const spies = renderFocus({ day: blankDay("2026-08-18") });

    expect(screen.queryByRole("button", { name: "Start 25 minutes" })).toBeNull();
    const field = screen.getByLabelText("Priority 1");
    fireEvent.change(field, { target: { value: "Write the brief" } });
    fireEvent.keyDown(field, { key: "Enter" });

    expect(spies.onPatchPriority).toHaveBeenCalledWith("priority1", { text: "Write the brief" });
  });

  it("offers a block against the next project once the priorities are done", () => {
    renderFocus({
      day: dayWith({
        priority1: p({ text: "One", done: true, goal: null }),
        actions: [
          { id: "p1", text: "Rewrite the pricing page", bucket: "project", done: false, createdAt: "" },
        ],
      }),
    });

    expect(screen.getByText("Rewrite the pricing page")).toBeDefined();
    expect(screen.getByRole("button", { name: "Start 25 minutes" })).toBeDefined();
  });
});

describe("while the block is running", () => {
  it("shows the time left and what it is for", () => {
    renderFocus({ session: runningSession(), now: at(4 * MINUTE) });

    expect(screen.getByLabelText("Time left in this block").textContent).toBe("21:00");
    expect(screen.getByText("Ship the store")).toBeDefined();
  });

  it("shows nothing else from Today", () => {
    renderFocus({ session: runningSession(), now: T0 });

    expect(screen.queryByText("Quick Ticks")).toBeNull();
    expect(screen.queryByText("Check-in")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start 25 minutes" })).toBeNull();
  });

  it("hands a parked thought upward without stopping the block", () => {
    const spies = renderFocus({ session: runningSession(), now: T0 });

    fireEvent.click(screen.getByRole("button", { name: "Park a thought for later" }));
    const input = screen.getByLabelText("Park a thought for later");
    fireEvent.change(input, { target: { value: "Reply to Dan" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(spies.onPark).toHaveBeenCalledWith("Reply to Dan");
    expect(spies.onDistracted).not.toHaveBeenCalled();
  });

  it("reports a distraction when the user says so", () => {
    const spies = renderFocus({ session: runningSession(), now: at(MINUTE) });

    fireEvent.click(screen.getByRole("button", { name: "I got distracted" }));

    expect(spies.onDistracted).toHaveBeenCalledTimes(1);
  });
});

describe("after a distraction", () => {
  const paused = () => markDistracted(runningSession(), at(10 * MINUTE));

  it("says nothing is lost, and how much is still waiting", () => {
    renderFocus({ session: paused(), now: at(30 * MINUTE) });

    expect(screen.getByText("Nothing is lost.")).toBeDefined();
    expect(screen.getByText(/15:00 of it is still waiting/)).toBeDefined();
  });

  it("logs an optional reason", () => {
    const spies = renderFocus({ session: paused(), now: at(11 * MINUTE) });

    fireEvent.click(screen.getByRole("button", { name: "Phone" }));

    expect(spies.onChooseReason).toHaveBeenCalledWith("phone");
  });

  it("marks the reason already chosen for this interruption", () => {
    const interruption: Interruption = {
      id: "i1",
      focusSessionId: "s1",
      dayId: "2026-08-18",
      occurredAt: T0.toISOString(),
      timeZone: "UTC",
      reason: "fatigue",
      returnBlockStarted: false,
      returnedAt: null,
    };
    renderFocus({ session: paused(), openInterruption: interruption, now: at(11 * MINUTE) });

    expect(screen.getByRole("button", { name: "Running out of steam" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Phone" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("offers the five-minute way back in, and an immediate resume", () => {
    const spies = renderFocus({ session: paused(), now: at(11 * MINUTE) });

    fireEvent.click(screen.getByRole("button", { name: "Back in — 5 minutes" }));
    expect(spies.onReturnBlock).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Resume the block now" }));
    expect(spies.onResume).toHaveBeenCalled();
  });

  it("leaves the session open when the user steps away to Today", () => {
    const spies = renderFocus({ session: paused(), now: at(11 * MINUTE) });

    fireEvent.click(screen.getAllByRole("button", { name: "Back to Today" })[1]);

    expect(spies.onExit).toHaveBeenCalled();
    expect(spies.onLeave).not.toHaveBeenCalled();
  });
});

describe("during the five-minute return block", () => {
  const returning = () =>
    beginReturnBlock(markDistracted(runningSession(), at(10 * MINUTE)), at(12 * MINUTE));

  it("counts the return block down, and says what comes after", () => {
    renderFocus({ session: returning(), now: at(14 * MINUTE) });

    expect(screen.getByLabelText("Time left in the return block").textContent).toBe("03:00");
    expect(screen.getByText(/15:00 of the original block/)).toBeDefined();
  });

  it("does not offer another distraction while easing back in", () => {
    renderFocus({ session: returning(), now: at(13 * MINUTE) });

    expect(screen.queryByRole("button", { name: "I got distracted" })).toBeNull();
  });
});

describe("when the block ends", () => {
  const ended = () => settleSession(runningSession(), at(30 * MINUTE));

  it("never completes the priority on its own", () => {
    const spies = renderFocus({ session: ended(), now: at(30 * MINUTE) });

    expect(spies.onComplete).not.toHaveBeenCalled();
    expect(spies.onPatchPriority).not.toHaveBeenCalled();
  });

  it("offers completing, continuing, or leaving it there", () => {
    const spies = renderFocus({ session: ended(), now: at(30 * MINUTE) });

    fireEvent.click(screen.getByRole("button", { name: "Complete priority" }));
    expect(spies.onComplete).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(spies.onContinue).toHaveBeenCalledTimes(1);
  });

  it("resolves the session when the user leaves a finished block", () => {
    const spies = renderFocus({ session: ended(), now: at(30 * MINUTE) });

    fireEvent.click(screen.getAllByRole("button", { name: "Back to Today" })[1]);

    expect(spies.onLeave).toHaveBeenCalled();
  });

  it("has nothing to complete when the block was not tied to a priority", () => {
    const loose = settleSession(
      startFocusSession({
        dayId: "2026-08-18",
        target: null,
        intention: "Rewrite the pricing page",
        plannedMs: FOCUS_BLOCK_MS,
        now: T0,
        timeZone: "UTC",
      }),
      at(30 * MINUTE),
    );
    renderFocus({ session: loose, now: at(30 * MINUTE) });

    expect(screen.queryByRole("button", { name: "Complete priority" })).toBeNull();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDefined();
  });
});

describe("leaving focus mode", () => {
  it("exits on Escape", () => {
    const spies = renderFocus({ session: runningSession(), now: T0 });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(spies.onExit).toHaveBeenCalled();
  });

  it("Escape inside the parking field abandons the capture, not the session", () => {
    const spies = renderFocus({ session: runningSession(), now: T0 });

    fireEvent.click(screen.getByRole("button", { name: "Park a thought for later" }));
    fireEvent.keyDown(screen.getByLabelText("Park a thought for later"), { key: "Escape" });

    expect(spies.onExit).not.toHaveBeenCalled();
  });
});

describe("pausing, resuming and ending inside the timer", () => {
  const running = () => runningSession();
  const paused = () => pauseSession(runningSession(), at(10 * MINUTE));

  it("offers Pause and End while the block runs", () => {
    const spies = renderFocus({ session: running(), now: at(MINUTE) });

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(spies.onPause).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "End block" }));
    expect(spies.onEnd).toHaveBeenCalledTimes(1);
  });

  it("swaps Pause for Resume once paused", () => {
    const spies = renderFocus({ session: paused(), now: null });

    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));

    expect(spies.onResumeBlock).toHaveBeenCalledTimes(1);
  });

  it("holds the remaining time steady while paused, with no clock running", () => {
    renderFocus({ session: paused(), now: null });

    expect(screen.getByLabelText("Time left in this block").textContent).toBe("15:00");
    expect(screen.getByText("Paused")).toBeDefined();
  });

  it("does not offer a distraction while paused — pausing is not an interruption", () => {
    const spies = renderFocus({ session: paused(), now: null });

    expect(screen.queryByRole("button", { name: "I got distracted" })).toBeNull();
    expect(spies.onDistracted).not.toHaveBeenCalled();
  });

  it("gives the return block a way out too", () => {
    const returning = beginReturnBlock(markDistracted(runningSession(), at(10 * MINUTE)), at(12 * MINUTE));
    const spies = renderFocus({ session: returning, now: at(13 * MINUTE) });

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(spies.onPause).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "End block" }));
    expect(spies.onEnd).toHaveBeenCalled();
  });

  it("keeps parking available while paused", () => {
    const spies = renderFocus({ session: paused(), now: null });

    fireEvent.click(screen.getByRole("button", { name: "Park a thought for later" }));
    const input = screen.getByLabelText("Park a thought for later");
    fireEvent.change(input, { target: { value: "Book the dentist" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(spies.onPark).toHaveBeenCalledWith("Book the dentist");
  });
});
