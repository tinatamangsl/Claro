import { act, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { HabitWeekCard } from "./HabitWeekCard";
import { ClaroProvider, useClaro } from "@/lib/claro-store";
import { createHabit } from "@/lib/habits";
import { weekDayIds, weekOfDay } from "@/lib/dates";
import type { Habit } from "@/lib/types";

beforeEach(() => localStorage.clear());

function harness() {
  const api: { store: ReturnType<typeof useClaro> | null } = { store: null };
  function Probe() {
    api.store = useClaro();
    return null;
  }
  const view = render(
    <ClaroProvider>
      <Probe />
      <Card api={api} />
    </ClaroProvider>,
  );
  return { api, ...view };
}

function Card({ api }: { api: { store: ReturnType<typeof useClaro> | null } }) {
  const { today } = useClaro();
  void api;
  return <HabitWeekCard weekId={weekOfDay(today)} />;
}

const ready = async (api: { store: ReturnType<typeof useClaro> | null }) =>
  waitFor(() => expect(api.store?.ready).toBe(true));

/**
 * Add a habit, give it a target, and tick `kept` days from Monday.
 *
 * `api.store` is re-read after every act: it is the value captured at the last
 * render, so holding one reference across a write reads a stale store.
 */
const seed = (
  api: { store: ReturnType<typeof useClaro> | null },
  name: string,
  patch: Partial<Habit>,
  kept: number,
) => {
  const habit = createHabit(name, new Date())!;
  act(() => api.store!.addHabit(habit));
  act(() => api.store!.patchHabit(habit.id, patch));

  const days = weekDayIds(weekOfDay(api.store!.today));
  for (let i = 0; i < kept; i++) {
    act(() => api.store!.toggleHabitDone(habit.id, days[i], new Date()));
  }
  return habit;
};

describe("practices this week", () => {
  it("shows nothing at all when there are no habits", async () => {
    const { api, container } = harness();
    await ready(api);
    expect(container.textContent).toBe("");
  });

  it("states each practice against its own number", async () => {
    const { api, container } = harness();
    await ready(api);
    seed(api, "run", { targetPerWeek: 4 }, 3);

    await waitFor(() => expect(container.textContent).toContain("3 of 4"));
  });

  it("names the pinned days rather than saying 'set days'", async () => {
    const { api, container } = harness();
    await ready(api);
    seed(api, "meditate", { targetDays: [1, 3, 5] }, 1);

    await waitFor(() => expect(container.textContent).toContain("Mon Wed Fri"));
  });

  it("counts days, not practices that have already finished", async () => {
    const { api, container } = harness();
    await ready(api);
    seed(api, "run", { targetPerWeek: 4 }, 3);
    seed(api, "iron pills", { targetPerWeek: 7 }, 5);

    /*
     * The regression this exists for. Counting practices that had *reached*
     * their number reported "0 of 2" on a week going well, because mid-week
     * almost nothing has reached its target yet. Summing days is true at any
     * point in the week.
     */
    await waitFor(() => expect(container.textContent).toContain("8 of the 11 days you meant to"));
    expect(container.textContent).not.toContain("0 of 2");
  });

  it("does not count a bonus day toward a different habit's target", async () => {
    const { api, container } = harness();
    await ready(api);
    // Five kept against a target of four: the extra must not inflate the total.
    seed(api, "run", { targetPerWeek: 4 }, 5);

    await waitFor(() => expect(container.textContent).toContain("4 of the 4 days you meant to"));
  });

  it("leaves a habit with no target as a plain count, and never scolds", async () => {
    const { api, container } = harness();
    await ready(api);
    seed(api, "morning pages", {}, 0);

    await waitFor(() => expect(container.textContent).toContain("None yet"));
    for (const banned of ["missed", "only", "failed", "streak", "behind", "0%"]) {
      expect(container.textContent!.toLowerCase()).not.toContain(banned);
    }
  });
});
