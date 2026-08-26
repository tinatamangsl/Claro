import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stopAutoScroll, trackPointer } from "./auto-scroll";

/** Runs the frame loop a fixed number of times, synchronously. */
const frames = (n: number) => {
  for (let i = 0; i < n; i += 1) vi.advanceTimersByTime(16);
};

let scrolled = 0;

beforeEach(() => {
  vi.useFakeTimers();
  scrolled = 0;
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 16) as unknown as number,
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  window.scrollBy = ((_x: number, y: number) => {
    scrolled += y;
    // A real window reports the new position, which is how the loop knows the
    // page still had somewhere to go.
    Object.defineProperty(window, "scrollY", { value: scrolled, configurable: true });
  }) as typeof window.scrollBy;
});

afterEach(() => {
  stopAutoScroll();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("scrolling while a drag is in progress", () => {
  it("keeps scrolling while the pointer rests at an edge", () => {
    // The whole gesture is holding still near the edge, and a stationary
    // pointer fires no move events at all. The loop has to carry it.
    trackPointer(400, 780);
    frames(10);

    expect(scrolled).toBeGreaterThan(0);
    const afterTen = scrolled;

    frames(10);
    expect(scrolled).toBeGreaterThan(afterTen);
  });

  it("scrolls up near the top and down near the bottom", () => {
    trackPointer(400, 20);
    frames(5);
    expect(scrolled).toBeLessThan(0);

    scrolled = 0;
    trackPointer(400, 790);
    frames(5);
    expect(scrolled).toBeGreaterThan(0);
  });

  it("does nothing in the middle of the screen", () => {
    trackPointer(400, 400);
    frames(20);

    expect(scrolled).toBe(0);
  });

  it("moves faster the closer to the edge it gets", () => {
    trackPointer(400, 720);
    frames(5);
    const gentle = scrolled;

    stopAutoScroll();
    scrolled = 0;
    trackPointer(400, 799);
    frames(5);

    expect(scrolled).toBeGreaterThan(gentle);
  });

  it("stops when the drag ends, rather than running on", () => {
    trackPointer(400, 780);
    frames(5);
    const atEnd = scrolled;

    stopAutoScroll();
    frames(20);

    expect(scrolled).toBe(atEnd);
  });

  it("survives being stopped without ever having started", () => {
    expect(() => stopAutoScroll()).not.toThrow();
  });
});
