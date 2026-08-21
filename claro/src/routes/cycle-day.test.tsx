import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const search: { view?: string } = {};

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  createFileRoute: () => (options: { validateSearch?: unknown }) => ({
    ...options,
    useSearch: () => search,
  }),
  useNavigate: () => (opts: { search?: { view?: string } }) => {
    search.view = opts.search?.view;
  },
}));

import { CycleDay, Route } from "./cycle-day";
import { ClaroProvider, useClaro } from "@/lib/claro-store";
import { snapshotNow } from "@/lib/cycle-recalibration";
import { shiftDayId, weekOfDay } from "@/lib/dates";
import type { CycleEntry } from "@/lib/types";

// The route object is built by the mocked factory, so `useSearch` reads the
// module-level search the mocked navigate writes.
(Route as unknown as { useSearch: () => typeof search }).useSearch = () => search;

beforeEach(() => {
  localStorage.clear();
  delete search.view;
});

function harness() {
  const api: { store: ReturnType<typeof useClaro> | null } = { store: null };

  function Probe() {
    api.store = useClaro();
    return null;
  }

  const view = render(
    <ClaroProvider>
      <Probe />
      <CycleDay />
    </ClaroProvider>,
  );

  return { api, ...view };
}

const ready = async (api: { store: ReturnType<typeof useClaro> | null }) =>
  waitFor(() => expect(api.store?.ready).toBe(true));

/** Three starts 28 days apart, so an estimate and a day count exist. */
const history = (todayId: string): Record<string, CycleEntry> =>
  Object.fromEntries(
    [61, 33, 5].map((back, i) => [
      `e${i}`,
      {
        id: `e${i}`,
        startDate: shiftDayId(todayId, -back),
        endDate: shiftDayId(todayId, -back + 4),
        loggedAt: "x",
      },
    ]),
  );

describe("consent", () => {
  it("shows nothing of the flow until cycle notes are on", async () => {
    const { api, container } = harness();
    await ready(api);

    expect(screen.getByRole("button", { name: "Turn on cycle notes" })).toBeTruthy();
    expect(container.textContent).not.toContain("Energy today");
    expect(container.textContent).toContain("changes none of your plans");
  });
});

describe("the daily flow", () => {
  const enabled = async () => {
    const h = harness();
    await ready(h.api);
    act(() => {
      h.api.store!.setCycleEnabled(true, new Date());
      h.api.store!.setCycleEntries(history(h.api.store!.today));
    });
    // Acknowledged from the real numbers, so the change screen is not in the
    // way. A hand-written snapshot drifts from the seed and silently reopens it.
    act(() => h.api.store!.acknowledgeCycleEstimate(snapshotNow(h.api.store!.cycle, new Date())));
    return h;
  };

  it("opens on the log when today has nothing on it", async () => {
    await enabled();

    expect(screen.getByRole("heading", { name: "Has your period started?" })).toBeTruthy();
  });

  it("opens on what the notes show when today was already logged", async () => {
    const h = harness();
    await ready(h.api);
    act(() => {
      h.api.store!.setCycleEnabled(true, new Date());
      h.api.store!.setCycleEntries(history(h.api.store!.today));
      h.api.store!.writeCycleCheckIn(h.api.store!.today, { energy: 3 }, new Date());
      // The landing screen is chosen on arrival, so arrive again.
      search.view = "guide";
    });
    act(() => h.api.store!.acknowledgeCycleEstimate(snapshotNow(h.api.store!.cycle, new Date())));
    h.rerender(
      <ClaroProvider>
        <CycleDay />
      </ClaroProvider>,
    );

    expect(screen.queryByRole("button", { name: "log it" })).toBeNull();
  });

  it("stays inside the log while the steps are being answered", async () => {
    await enabled();

    fireEvent.click(screen.getByRole("button", { name: "No, not yet" }));
    fireEvent.click(screen.getByRole("button", { name: /Motivated/ }));

    // Writing a field must not throw the user onto the next screen: the last
    // step is what finishes the log.
    expect(screen.getByRole("heading", { name: "What's your energy like today?" })).toBeTruthy();
  });

  it("records a period start from the first step, through the same rules as the calendar", async () => {
    const { api } = await enabled();
    const todayId = api.store!.today;

    fireEvent.click(screen.getByRole("button", { name: "Yes, today" }));

    const starts = Object.values(api.store!.cycle.entries).map((e) => e.startDate);
    expect(starts).toContain(todayId);
  });

  it("records the log without touching the plan", async () => {
    const { api } = await enabled();
    const todayId = api.store!.today;
    const weekId = weekOfDay(todayId);

    act(() => {
      api.store!.updateWeek(weekId, (w) => ({ ...w, work: { ...w.work, goal: "Launch" } }));
      api.store!.updateDay(todayId, (d) => ({
        ...d,
        priority1: { ...d.priority1, id: "p1", text: "Finish the pricing page", done: false },
      }));
      api.store!.addHabit({ id: "h1", name: "Walk", createdAt: "x", archivedAt: null });
    });

    const habits = JSON.stringify(api.store!.state.habits);

    fireEvent.click(screen.getByRole("button", { name: "No, not yet" }));
    fireEvent.click(screen.getByRole("button", { name: /Motivated/ }));
    fireEvent.click(screen.getByRole("button", { name: /High/ }));

    expect(api.store!.cycle.checkIns[todayId].energy).toBe(4);
    expect(api.store!.cycle.checkIns[todayId].feeling).toBe("motivated");

    expect(api.store!.week(weekId).work.goal).toBe("Launch");
    expect(api.store!.day(todayId).priority1.text).toBe("Finish the pricing page");
    expect(api.store!.day(todayId).priority1.done).toBe(false);
    expect(JSON.stringify(api.store!.state.habits)).toBe(habits);
    expect(api.store!.activeSession).toBeNull();
  });

  it("shows the user's own priority as the one thing, and does not choose it", async () => {
    const { api, container } = await enabled();
    const todayId = api.store!.today;

    act(() => {
      api.store!.updateDay(todayId, (d) => ({
        ...d,
        priority1: { ...d.priority1, id: "p1", text: "Finish the pricing page", done: false },
      }));
      search.view = "guide";
    });

    expect(container.textContent).toContain("Finish the pricing page");
    expect(container.textContent).toContain("your priority");
  });

  it("never claims what a phase does to anyone, on any screen of the flow", async () => {
    const { api, container } = await enabled();
    const todayId = api.store!.today;

    for (const view of [undefined, "guide", "forecast", "evening"]) {
      act(() => {
        api.store!.writeCycleCheckIn(todayId, { energy: 3, feeling: "calm" }, new Date());
        search.view = view;
      });
      // Force a re-render against the new view.
      act(() => api.store!.writeCycleCheckIn(todayId, { note: "x" }, new Date()));

      const text = container.textContent!.toLowerCase();
      for (const banned of [
        "luteal",
        "follicular",
        "ovulat",
        "fertil",
        "your brain",
        "will cost more",
        "protect your energy",
        "high-stakes",
        "apply to my calendar",
      ]) {
        expect(text).not.toContain(banned);
      }
    }
  });
});

describe("a changed estimate", () => {
  it("is reported before anything else, and only once", async () => {
    const h = harness();
    await ready(h.api);
    act(() => {
      h.api.store!.setCycleEnabled(true, new Date());
      h.api.store!.setCycleEntries(history(h.api.store!.today));
    });

    expect(h.container.textContent).toContain("Your estimate has changed");
    expect(h.container.textContent).toContain("Nothing in your plans has moved");

    fireEvent.click(screen.getByRole("button", { name: "got it" }));

    expect(h.container.textContent).not.toContain("Your estimate has changed");
    expect(h.api.store!.cycle.lastSeen).not.toBeNull();
  });

  it("offers no way to apply anything to a plan", async () => {
    const h = harness();
    await ready(h.api);
    act(() => {
      h.api.store!.setCycleEnabled(true, new Date());
      h.api.store!.setCycleEntries(history(h.api.store!.today));
    });

    const labels = screen.getAllByRole("button").map((b) => b.textContent!.toLowerCase());
    expect(labels.some((l) => l.includes("apply"))).toBe(false);
    expect(labels.some((l) => l.includes("calendar"))).toBe(false);
  });
});
