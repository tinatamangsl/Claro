import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ClaroProvider, useClaro } from "./claro-store";
import { STORAGE_KEY, blankDay, emptyState, loadState, saveNow } from "./storage";
import { formatDayId } from "./dates";
import { MAX_SIDE_QUESTS } from "./types";
import { addCapped } from "./mutations";

beforeEach(() => {
  localStorage.clear();
});

/** Grabs the live context value so tests can drive it directly. */
function harness() {
  const api: { current: ReturnType<typeof useClaro> | null } = { current: null };

  function Probe() {
    api.current = useClaro();
    return <div data-testid="ready">{String(api.current.ready)}</div>;
  }

  render(
    <ClaroProvider>
      <Probe />
    </ClaroProvider>,
  );

  return api;
}

const flush = async () => {
  // Let the debounced save (300ms) fire.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 400));
  });
};

describe("hydration contract", () => {
  it("becomes ready only after mount, never during the first render", async () => {
    const seen: boolean[] = [];

    function Probe() {
      const { ready } = useClaro();
      seen.push(ready);
      return null;
    }

    render(
      <ClaroProvider>
        <Probe />
      </ClaroProvider>,
    );

    // The first render must match what the server produced: not ready.
    expect(seen[0]).toBe(false);
    await waitFor(() => expect(seen.at(-1)).toBe(true));
  });

  it("exposes an empty store and no date before hydration", () => {
    const seenToday: string[] = [];

    function Probe() {
      const { today, state } = useClaro();
      seenToday.push(today);
      if (seenToday.length === 1) {
        // Computing a date during the first render would disagree with SSR.
        expect(today).toBe("");
        expect(state).toEqual(emptyState());
      }
      return null;
    }

    render(
      <ClaroProvider>
        <Probe />
      </ClaroProvider>,
    );
  });

  it("reads today's date once hydrated", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    expect(api.current?.today).toBe(formatDayId(new Date()));
  });

  it("loads previously saved data on mount", async () => {
    const saved = emptyState();
    saved.days["2026-08-15"] = { ...blankDay("2026-08-15"), notes: "from disk" };
    saveNow(saved);

    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    expect(api.current?.day("2026-08-15").notes).toBe("from disk");
  });

  it("still becomes ready when stored data is corrupt", async () => {
    localStorage.setItem(STORAGE_KEY, "{{{ not json");
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    expect(api.current?.state).toEqual(emptyState());
    expect(screen.getByTestId("ready").textContent).toBe("true");
  });
});

describe("lazy record creation", () => {
  it("returns blanks for periods that were never edited", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    expect(api.current?.quarter("2030-Q1").work.mainQuest).toBe("");
    expect(api.current?.week("2030-W05").life.goal).toBe("");
    expect(api.current?.day("2030-01-02").notes).toBe("");
  });

  it("does not persist a record merely because it was read", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => {
      api.current?.quarter("2030-Q1");
      api.current?.week("2030-W05");
      api.current?.day("2030-01-02");
    });
    await flush();

    // Browsing forward through empty periods must not fill storage.
    expect(Object.keys(api.current!.state.quarters)).toHaveLength(0);
    expect(Object.keys(api.current!.state.weeks)).toHaveLength(0);
    expect(Object.keys(api.current!.state.days)).toHaveLength(0);
  });

  it("materialises a record on first write", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => {
      api.current?.updateDay("2026-08-15", (d) => ({ ...d, notes: "now it exists" }));
    });

    expect(Object.keys(api.current!.state.days)).toEqual(["2026-08-15"]);
  });
});

describe("updates", () => {
  it("updates quarter, week and day independently", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => {
      api.current?.updateQuarter("2026-Q3", (q) => ({
        ...q,
        work: { ...q.work, mainQuest: "Ship Claro" },
      }));
      api.current?.updateWeek("2026-W33", (w) => ({
        ...w,
        life: { ...w.life, goal: "Three runs" },
      }));
      api.current?.updateDay("2026-08-15", (d) => ({ ...d, mood: 4 }));
    });

    expect(api.current?.quarter("2026-Q3").work.mainQuest).toBe("Ship Claro");
    expect(api.current?.week("2026-W33").life.goal).toBe("Three runs");
    expect(api.current?.day("2026-08-15").mood).toBe(4);
  });

  it("leaves sibling periods untouched", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => {
      api.current?.updateDay("2026-08-15", (d) => ({ ...d, notes: "monday" }));
    });
    act(() => {
      api.current?.updateDay("2026-08-16", (d) => ({ ...d, notes: "tuesday" }));
    });

    expect(api.current?.day("2026-08-15").notes).toBe("monday");
    expect(api.current?.day("2026-08-16").notes).toBe("tuesday");
  });

  it("enforces the side-quest cap through the store", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    for (let i = 0; i < 5; i++) {
      act(() => {
        api.current?.updateQuarter("2026-Q3", (q) => ({
          ...q,
          work: {
            ...q.work,
            sideQuests: addCapped(
              q.work.sideQuests,
              { id: `sq${i}`, text: `Side quest ${i}`, done: false },
              MAX_SIDE_QUESTS,
            ),
          },
        }));
      });
    }

    expect(api.current?.quarter("2026-Q3").work.sideQuests).toHaveLength(MAX_SIDE_QUESTS);
  });

  it("moves an action between buckets without duplicating it", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => {
      api.current?.updateDay("2026-08-15", (d) => ({
        ...d,
        actions: [
          { id: "a1", text: "Book dentist", bucket: "quickTick", done: false, createdAt: "" },
        ],
      }));
    });
    act(() => {
      api.current?.updateDay("2026-08-15", (d) => ({
        ...d,
        actions: d.actions.map((a) => (a.id === "a1" ? { ...a, bucket: "project" } : a)),
      }));
    });

    const actions = api.current!.day("2026-08-15").actions;
    expect(actions).toHaveLength(1);
    expect(actions[0].bucket).toBe("project");
  });
});

describe("persistence", () => {
  it("writes changes to localStorage after the debounce", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => {
      api.current?.updateDay("2026-08-15", (d) => ({ ...d, notes: "persist me" }));
    });
    await flush();

    expect(loadState().days["2026-08-15"].notes).toBe("persist me");
  });

  it("does not rewrite storage just for loading", async () => {
    const spy = vi.spyOn(Storage.prototype, "setItem");
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));
    await flush();

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("reports a save failure through saveStatus", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    act(() => {
      api.current?.updateDay("2026-08-15", (d) => ({ ...d, notes: "too big" }));
    });
    await flush();

    expect(api.current?.saveStatus).toBe("error");
    spy.mockRestore();
  });

  it("resetAll clears both memory and storage", async () => {
    const api = harness();
    await waitFor(() => expect(api.current?.ready).toBe(true));

    act(() => {
      api.current?.updateDay("2026-08-15", (d) => ({ ...d, notes: "goodbye" }));
    });
    await flush();

    act(() => api.current?.resetAll());

    expect(api.current?.state).toEqual(emptyState());
    expect(loadState()).toEqual(emptyState());
  });
});

describe("useClaro guard", () => {
  it("throws when used outside the provider", () => {
    function Orphan() {
      useClaro();
      return null;
    }
    // React logs the error boundary trace; silence it for a clean run.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow(/ClaroProvider/);
    spy.mockRestore();
  });
});
