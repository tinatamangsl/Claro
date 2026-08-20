import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The card is being tested for what it writes, not for routing. A plain anchor
// keeps the assertions about behaviour rather than about router setup.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { CycleWeekCard } from "./CycleWeekCard";
import { ClaroProvider, useClaro } from "@/lib/claro-store";
import { ongoingPeriod, sortedEntries } from "@/lib/cycle";
import { shiftDayId, weekOfDay } from "@/lib/dates";
import type { CycleEntry } from "@/lib/types";

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
      <CycleWeekCard />
    </ClaroProvider>,
  );

  return { api, ...view };
}

/** Three starts 28 days apart ending recently, so an estimate exists. */
const regularStarts = (todayId: string): Record<string, CycleEntry> =>
  Object.fromEntries(
    [56 + 5, 28 + 5, 5].map((back, i) => {
      const startDate = shiftDayId(todayId, -back);
      return [`e${i}`, { id: `e${i}`, startDate, endDate: shiftDayId(startDate, 3), loggedAt: "x" }];
    }),
  );

describe("cycle context on the week", () => {
  it("shows nothing at all until cycle notes are turned on", async () => {
    const { api, container } = harness();
    await waitFor(() => expect(api.store?.ready).toBe(true));

    expect(container.textContent).toBe("");
    expect(screen.queryByText("Cycle notes")).toBeNull();
  });

  it("appears once the user has opted in", async () => {
    const { api } = harness();
    await waitFor(() => expect(api.store?.ready).toBe(true));

    act(() => api.store!.setCycleEnabled(true, new Date()));

    expect(screen.getByText("Cycle notes")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open the cycle calendar" })).toBeTruthy();
  });

  it("reports the estimate from the user's own dates, and labels it as one", async () => {
    const { api, container } = harness();
    await waitFor(() => expect(api.store?.ready).toBe(true));

    act(() => {
      api.store!.setCycleEnabled(true, new Date());
      api.store!.setCycleEntries(regularStarts(api.store!.today));
    });

    expect(container.textContent).toContain("Next period estimated");
    expect(container.textContent).toContain("not medical advice");
  });

  it("asks how the user would like to plan, and proposes nothing itself", async () => {
    const { api, container } = harness();
    await waitFor(() => expect(api.store?.ready).toBe(true));

    act(() => api.store!.setCycleEnabled(true, new Date()));

    expect(container.textContent).toContain("How would you like to plan this week?");
    expect(container.textContent).toContain("Claro changes nothing here on its own");
  });

  it("never predicts fertility, ovulation or pregnancy", async () => {
    const { api, container } = harness();
    await waitFor(() => expect(api.store?.ready).toBe(true));

    act(() => {
      api.store!.setCycleEnabled(true, new Date());
      api.store!.setCycleEntries(regularStarts(api.store!.today));
    });

    const text = container.textContent!.toLowerCase();
    for (const banned of ["fertile", "fertility", "ovulation", "pregnan"]) {
      expect(text).not.toContain(banned);
    }
  });
});

describe("logging from the week never touches the plan", () => {
  it("records an ongoing period and leaves the week, day and habits alone", async () => {
    const { api } = harness();
    await waitFor(() => expect(api.store?.ready).toBe(true));

    const todayId = api.store!.today;
    const weekId = weekOfDay(todayId);

    act(() => {
      api.store!.setCycleEnabled(true, new Date());
      api.store!.updateWeek(weekId, (w) => ({ ...w, work: { ...w.work, goal: "Launch the beta" } }));
      api.store!.updateDay(todayId, (d) => ({
        ...d,
        priority1: { ...d.priority1, id: "p1", text: "Ship the store", done: false },
        notes: "Do not touch this",
      }));
      api.store!.addHabit({
        id: "h1",
        name: "Walk",
        createdAt: "2026-01-01T09:00:00.000Z",
        archivedAt: null,
      });
    });

    const habitsBefore = JSON.stringify(api.store!.state.habits);

    fireEvent.click(screen.getByRole("button", { name: "Log start" }));

    // The period was recorded, with no end invented for it.
    const logged = sortedEntries(api.store!.cycle);
    expect(logged).toHaveLength(1);
    expect(logged[0].startDate).toBe(todayId);
    expect(logged[0].endDate).toBeNull();

    // And nothing else moved.
    expect(api.store!.week(weekId).work.goal).toBe("Launch the beta");
    expect(api.store!.day(todayId).priority1.text).toBe("Ship the store");
    expect(api.store!.day(todayId).priority1.done).toBe(false);
    expect(api.store!.day(todayId).notes).toBe("Do not touch this");
    expect(JSON.stringify(api.store!.state.habits)).toBe(habitsBefore);
    expect(api.store!.activeSession).toBeNull();
  });

  it("offers to close an ongoing period, and records the end date on today", async () => {
    const { api } = harness();
    await waitFor(() => expect(api.store?.ready).toBe(true));

    const todayId = api.store!.today;

    act(() => {
      api.store!.setCycleEnabled(true, new Date());
      api.store!.setCycleEntries({
        e0: { id: "e0", startDate: shiftDayId(todayId, -3), endDate: null, loggedAt: "x" },
      });
    });

    expect(ongoingPeriod(api.store!.cycle)?.id).toBe("e0");

    fireEvent.click(screen.getByRole("button", { name: "It ended today" }));

    expect(api.store!.cycle.entries.e0.endDate).toBe(todayId);
    expect(ongoingPeriod(api.store!.cycle)).toBeNull();
  });

  it("refuses a second start while one is still open, and says why", async () => {
    const { api, container } = harness();
    await waitFor(() => expect(api.store?.ready).toBe(true));

    const todayId = api.store!.today;

    act(() => {
      api.store!.setCycleEnabled(true, new Date());
      api.store!.setCycleEntries({
        e0: { id: "e0", startDate: shiftDayId(todayId, -3), endDate: null, loggedAt: "x" },
        e1: { id: "e1", startDate: shiftDayId(todayId, -40), endDate: shiftDayId(todayId, -37), loggedAt: "x" },
      });
    });

    // With one open, the card offers the close rather than another start.
    expect(screen.queryByRole("button", { name: "Log start" })).toBeNull();
    expect(container.textContent).toContain("ongoing since");
  });
});
