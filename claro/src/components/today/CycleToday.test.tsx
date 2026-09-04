import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { CycleToday } from "./CycleToday";
import { ClaroProvider, useClaro } from "@/lib/claro-store";
import { shiftDayId } from "@/lib/dates";

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
      <CycleToday />
    </ClaroProvider>,
  );
  return { api, ...view };
}

const ready = async (api: { store: ReturnType<typeof useClaro> | null }) =>
  waitFor(() => expect(api.store?.ready).toBe(true));

/** Cycle notes on, with a period logged so there is a phase to show. */
const withCycle = async () => {
  const h = harness();
  await ready(h.api);
  const todayId = h.api.store!.today;
  act(() => {
    h.api.store!.setCycleEnabled(true, new Date());
    h.api.store!.setCycleEntries(
      Object.fromEntries(
        // Three starts, 28 days apart, so an estimate exists and a phase can
        // be named. One start is not enough to count a cycle day from.
        [61, 33, 5].map((back, i) => [
          `e${i}`,
          {
            id: `e${i}`,
            startDate: shiftDayId(todayId, -back),
            endDate: shiftDayId(todayId, -back + 4),
            loggedAt: "x",
          },
        ]),
      ),
    );
  });
  return h;
};

describe("cycle on Daily", () => {
  it("still takes energy before there is any history to count from", async () => {
    const h = harness();
    await ready(h.api);
    act(() => h.api.store!.setCycleEnabled(true, new Date()));

    /*
     * No logged period yet, so there is no phase and no cycle day. Recording
     * how the day felt needs neither, and it is how the history that resolves
     * that gets written in the first place, so the row is here regardless.
     */
    expect(screen.getByText(/nothing to count from/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Energy low" }));

    await waitFor(() => expect(h.api.store!.cycle.checkIns[h.api.store!.today]?.energy).toBe(2));
  });

  it("shows nothing at all to somebody who has not opted in", async () => {
    const { api, container } = harness();
    await ready(api);

    expect(api.store!.cycle.settings.enabled).toBe(false);
    expect(container.textContent).toBe("");
  });

  it("shows where you are once the feature is on", async () => {
    const { container } = await withCycle();

    expect(container.textContent).toContain("Your cycle");
    expect(container.textContent).toMatch(/Day \d+ of about \d+/);
  });

  it("takes today's energy without leaving the page", async () => {
    const h = await withCycle();

    fireEvent.click(screen.getByRole("button", { name: "Energy good" }));

    /*
     * The point of putting this here. It writes the same field the full form
     * writes, so Daily and the cycle page can never hold two different answers
     * about today.
     */
    await waitFor(() =>
      expect(h.api.store!.cycle.checkIns[h.api.store!.today]?.energy).toBe(4),
    );
  });

  it("offers no control that goes nowhere", async () => {
    const { container } = await withCycle();

    // The full form is a page away, so the row's link to it is not rendered
    // here rather than rendered as a button that does nothing.
    expect(container.textContent).not.toContain("Full log");
    expect(container.textContent).not.toContain("Log today");
    expect(screen.getByRole("link", { name: "Open" }).getAttribute("href")).toBe("/cycle");
  });

  it("changes nothing about the day it sits beside", async () => {
    const h = await withCycle();
    const before = JSON.stringify(h.api.store!.day(h.api.store!.today));

    fireEvent.click(screen.getByRole("button", { name: "Energy very low" }));
    await waitFor(() => expect(h.api.store!.cycle.checkIns[h.api.store!.today]?.energy).toBe(1));

    /*
     * The standing rule, and the reason this may sit next to a plan at all: no
     * priority, action, habit, schedule entry, goal, focus length or sound
     * moves because of what is logged here.
     */
    expect(JSON.stringify(h.api.store!.day(h.api.store!.today))).toBe(before);
  });
});
