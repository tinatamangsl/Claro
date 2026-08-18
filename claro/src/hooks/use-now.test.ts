import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNow } from "./use-now";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useNow", () => {
  it("is null on the first render, so nothing time-dependent reaches the server", () => {
    const seen: (Date | null)[] = [];
    renderHook(() => {
      const now = useNow(1000);
      seen.push(now);
      return now;
    });

    expect(seen[0]).toBeNull();
  });

  it("reads the clock once mounted", () => {
    const { result } = renderHook(() => useNow(1000));

    expect(result.current).toBeInstanceOf(Date);
  });

  it("re-reads the clock on each tick", () => {
    // setSystemTime pins the clock; advancing the timers advances it with them.
    vi.setSystemTime(new Date("2026-08-18T09:00:00.000Z"));
    const { result } = renderHook(() => useNow(1000));
    expect(result.current!.toISOString()).toBe("2026-08-18T09:00:00.000Z");

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current!.toISOString()).toBe("2026-08-18T09:00:03.000Z");
  });

  it("does not tick at all when the interval is null", () => {
    const { result } = renderHook(() => useNow(null));

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current).toBeNull();
  });

  it("starts ticking when an interval arrives, and stops when it is taken away", () => {
    const { result, rerender } = renderHook(({ ms }: { ms: number | null }) => useNow(ms), {
      initialProps: { ms: null as number | null },
    });
    expect(result.current).toBeNull();

    rerender({ ms: 1000 });
    expect(result.current).toBeInstanceOf(Date);

    rerender({ ms: null });
    expect(result.current).toBeNull();
  });

  it("clears its interval on unmount", () => {
    const clear = vi.spyOn(globalThis, "clearInterval");
    const { unmount } = renderHook(() => useNow(1000));

    unmount();

    expect(clear).toHaveBeenCalled();
  });
});
