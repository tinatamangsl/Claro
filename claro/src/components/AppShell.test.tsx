import { act, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useRouterState: () => "/today",
}));

import { AppShell } from "./AppShell";
import { ClaroProvider, useClaro } from "@/lib/claro-store";

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
      <AppShell>
        <p>page body</p>
      </AppShell>
    </ClaroProvider>,
  );
  return { api, ...view };
}

const ready = async (api: { store: ReturnType<typeof useClaro> | null } ) =>
  waitFor(() => expect(api.store?.ready).toBe(true));

/*
 * By destination, not by text. The wordmark is a link too and reads "CClaro",
 * because the roundel's letter sits inside it, so filtering on the visible
 * string quietly kept it.
 */
const navLabels = (container: HTMLElement) =>
  [...container.querySelectorAll("header a")]
    .filter((a) => a.getAttribute("href") !== "/today" || a.textContent?.trim() === "Daily")
    .map((a) => a.textContent?.trim() ?? "")
    .filter(Boolean);

describe("the nav", () => {
  it("offers Cycle before it has been turned on", async () => {
    const { api, container } = harness();
    await ready(api);

    /*
     * It used to appear only once cycle notes were enabled, so that a fresh
     * install would not advertise an optional, private feature. The hole in
     * that: turning it on happens *on the cycle page*, so while it was off the
     * only ways there were typing the URL or a link buried in Calendar. The
     * feature was hidden from the person it belonged to.
     */
    expect(api.store!.cycle.settings.enabled).toBe(false);
    expect(navLabels(container)).toEqual(["Daily", "Week", "Quarter", "Calendar", "Cycle"]);
  });

  it("says nothing about a cycle beyond the word", async () => {
    const { api, container } = harness();
    await ready(api);

    act(() => {
      api.store!.setCycleEnabled(true, new Date());
      api.store!.logCycleStart({
        id: "e0",
        startDate: "2026-08-01",
        endDate: "2026-08-05",
        loggedAt: "x",
      });
    });

    /*
     * The reason showing the item is safe. Everything private stays behind the
     * opt-in on the page itself: the nav carries a destination, never a
     * reading. A cycle day or a phase leaking into the shell would put it on
     * every screen in the app, including whatever is on somebody's monitor in
     * a room with other people in it.
     */
    const header = container.querySelector("header")!;
    for (const leak of ["day 1", "Day 1", "phase", "Menstrual", "Follicular", "2026-08-01", "period"]) {
      expect(header.textContent).not.toContain(leak);
    }
    expect(navLabels(container)).toContain("Cycle");
  });

  it("still shows the same five once it is on", async () => {
    const { api, container } = harness();
    await ready(api);
    act(() => api.store!.setCycleEnabled(true, new Date()));

    // Turning it on adds nothing and removes nothing: the item was always there.
    expect(navLabels(container)).toEqual(["Daily", "Week", "Quarter", "Calendar", "Cycle"]);
  });
});
