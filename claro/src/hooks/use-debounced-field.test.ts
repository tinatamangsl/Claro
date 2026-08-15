import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebouncedField } from "./use-debounced-field";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useDebouncedField", () => {
  it("updates its local value immediately so typing never lags", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useDebouncedField("", commit));

    act(() => result.current.onChange("h"));
    expect(result.current.value).toBe("h");
    expect(commit).not.toHaveBeenCalled(); // store untouched so far
  });

  it("commits once after the delay, not once per keystroke", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useDebouncedField("", commit));

    act(() => result.current.onChange("h"));
    act(() => result.current.onChange("he"));
    act(() => result.current.onChange("hello"));
    act(() => vi.advanceTimersByTime(400));

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("hello");
  });

  it("commits immediately on blur without waiting", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useDebouncedField("", commit));

    act(() => result.current.onChange("typed"));
    act(() => result.current.onBlur());

    expect(commit).toHaveBeenCalledWith("typed");
  });

  it("does not commit again on blur when nothing changed", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useDebouncedField("start", commit));

    act(() => result.current.onBlur());
    expect(commit).not.toHaveBeenCalled();
  });

  it("does not double-commit when blur follows a fired debounce", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useDebouncedField("", commit));

    act(() => result.current.onChange("done"));
    act(() => vi.advanceTimersByTime(400));
    act(() => result.current.onBlur());

    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("resyncs when the underlying record changes, e.g. switching day", () => {
    const commit = vi.fn();
    const { result, rerender } = renderHook(
      ({ external }) => useDebouncedField(external, commit),
      { initialProps: { external: "monday note" } },
    );

    expect(result.current.value).toBe("monday note");
    rerender({ external: "tuesday note" });
    expect(result.current.value).toBe("tuesday note");
  });

  it("does not clobber in-flight typing with the value it just committed", () => {
    // The parent re-renders with the committed value; the field must not reset.
    const commit = vi.fn();
    const { result, rerender } = renderHook(
      ({ external }) => useDebouncedField(external, commit),
      { initialProps: { external: "" } },
    );

    act(() => result.current.onChange("hello"));
    act(() => vi.advanceTimersByTime(400));
    rerender({ external: "hello" });

    expect(result.current.value).toBe("hello");
  });

  it("flushes a pending edit when unmounted mid-typing", () => {
    const commit = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedField("", commit));

    act(() => result.current.onChange("half typed"));
    unmount(); // e.g. navigating to another route

    expect(commit).toHaveBeenCalledWith("half typed");
  });
});
