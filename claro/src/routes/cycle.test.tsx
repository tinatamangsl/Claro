import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Routing is not what these tests are about; a plain anchor keeps them on the
// screen's actual behaviour.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  createFileRoute: () => (options: unknown) => options,
}));

import { CycleNotes } from "./cycle";
import { ClaroProvider, useClaro } from "@/lib/claro-store";
import { ongoingPeriod, sortedEntries } from "@/lib/cycle";
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
      <CycleNotes />
    </ClaroProvider>,
  );

  return { api, ...view };
}

const ready = async (api: { store: ReturnType<typeof useClaro> | null }) =>
  waitFor(() => expect(api.store?.ready).toBe(true));

describe("consent gating", () => {
  it("shows the explanation and nothing private until it is turned on", async () => {
    const { api, container } = harness();
    await ready(api);

    expect(screen.getByRole("button", { name: "Turn on cycle notes" })).toBeTruthy();
    expect(screen.queryByText("Your cycle calendar")).toBeNull();
    expect(screen.queryByText("Your logged periods")).toBeNull();
    expect(screen.queryByText("How today felt")).toBeNull();
    expect(container.textContent).toContain("does not give medical, fertility or health advice");
  });

  it("records the opt-in only when the user asks for it", async () => {
    const { api } = harness();
    await ready(api);

    expect(api.store!.cycle.settings.enabled).toBe(false);
    expect(api.store!.cycle.settings.optedInAt).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Turn on cycle notes" }));

    expect(api.store!.cycle.settings.enabled).toBe(true);
    expect(api.store!.cycle.settings.optedInAt).not.toBeNull();
  });
});

describe("the screen once it is on", () => {
  const enabled = async () => {
    const h = harness();
    await ready(h.api);
    act(() => h.api.store!.setCycleEnabled(true, new Date()));
    return h;
  };

  it("opens with the glance, then the action, then the calendar", async () => {
    const { container } = await enabled();

    const headings = [...container.querySelectorAll("h1, h2")].map((h) => h.textContent);
    expect(headings.slice(0, 4)).toEqual([
      "Cycle at a glance",
      "Log a period start",
      "Your cycle calendar",
      "Your logged periods",
    ]);
  });

  it("puts the main action in the open, never behind a Learn more", async () => {
    const { container } = await enabled();

    expect(screen.getByRole("button", { name: "My period started today" })).toBeTruthy();
    expect(container.textContent).not.toContain("Learn more");
  });

  it("states that the estimate comes from the user's own dates", async () => {
    const { container } = await enabled();

    expect(container.textContent).toContain("Based on your own recorded dates");
    expect(container.textContent).toContain("This is an estimate, not medical advice");
  });

  it("keeps a quiet way through to the guidance", async () => {
    await enabled();

    expect(
      screen.getByRole("link", {
        name: /Understanding your menstrual cycle: guidance and sources/,
      }),
    ).toBeTruthy();
  });

  it("offers only questions about planning, and changes nothing itself", async () => {
    const { container } = await enabled();

    expect(container.textContent).toContain("How is your energy today?");
    expect(container.textContent).toContain("Would you like to reduce, keep, or expand your plan?");
    expect(container.textContent).toContain(
      "Claro does not change your day, week, quarter, habits, goals, focus sessions or sound",
    );
  });
});

describe("logging a period from the screen", () => {
  const enabled = async () => {
    const h = harness();
    await ready(h.api);
    act(() => h.api.store!.setCycleEnabled(true, new Date()));
    return h;
  };

  it("records today's start as ongoing, then closes it on request", async () => {
    const { api } = await enabled();
    const todayId = api.store!.today;

    fireEvent.click(screen.getByRole("button", { name: "My period started today" }));

    const open = ongoingPeriod(api.store!.cycle);
    expect(open?.startDate).toBe(todayId);
    expect(open?.endDate).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "My period ended today" }));

    expect(ongoingPeriod(api.store!.cycle)).toBeNull();
    expect(sortedEntries(api.store!.cycle)[0].endDate).toBe(todayId);
  });

  it("adds a whole past range from the manual form", async () => {
    const { api } = await enabled();
    const todayId = api.store!.today;
    const from = shiftDayId(todayId, -40);
    const to = shiftDayId(todayId, -37);

    fireEvent.change(screen.getByLabelText("Start date of a past period"), {
      target: { value: from },
    });
    fireEvent.change(screen.getByLabelText("End date of a past period"), {
      target: { value: to },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add this period" }));

    const entries = sortedEntries(api.store!.cycle);
    expect(entries).toHaveLength(1);
    expect(entries[0].startDate).toBe(from);
    expect(entries[0].endDate).toBe(to);
  });

  it("refuses a duplicate start rather than double counting it", async () => {
    const { api, container } = await enabled();
    const todayId = api.store!.today;

    fireEvent.click(screen.getByRole("button", { name: "My period started today" }));

    fireEvent.change(screen.getByLabelText("Start date of a past period"), {
      target: { value: todayId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add this period" }));

    expect(sortedEntries(api.store!.cycle)).toHaveLength(1);
    expect(container.textContent).toContain("That date is already logged");
  });

  it("refuses an overlapping past range and names the clash", async () => {
    const { api, container } = await enabled();
    const todayId = api.store!.today;

    act(() =>
      api.store!.setCycleEntries({
        e0: {
          id: "e0",
          startDate: shiftDayId(todayId, -20),
          endDate: shiftDayId(todayId, -17),
          loggedAt: "x",
        },
      }),
    );

    fireEvent.change(screen.getByLabelText("Start date of a past period"), {
      target: { value: shiftDayId(todayId, -18) },
    });
    fireEvent.change(screen.getByLabelText("End date of a past period"), {
      target: { value: shiftDayId(todayId, -15) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add this period" }));

    expect(sortedEntries(api.store!.cycle)).toHaveLength(1);
    expect(container.textContent).toContain("overlaps a period you have already logged");
  });
});
