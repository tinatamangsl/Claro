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
    // Glance, the action, then one record surface at a time. The other three
    // are a tap away rather than stacked below.
    expect(headings).toEqual([
      "Cycle at a glance",
      "Log a period start",
      "Your cycle calendar",
      "How today felt",
      "Your data",
    ]);
  });

  it("keeps the records behind one control instead of five screens of stack", async () => {
    const { container } = await enabled();

    const tabs = [...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent);
    expect(tabs).toEqual(["Calendar", "Numbers", "Phases", "History"]);
    // Only the chosen one is mounted, which is what makes the page short.
    expect(container.textContent).not.toContain("Your usual cycle length");
  });

  it("puts the three ways in side by side, none of them buried", async () => {
    await enabled();

    for (const label of ["Log today", "This week", "Learn"]) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toBeTruthy();
    }
  });

  it("offers the calendar at both scales", async () => {
    const { container } = await enabled();

    expect(screen.getByRole("button", { name: "month" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "year" }));

    expect(container.textContent).toContain("Logged by you");
    expect(screen.getByRole("button", { name: "Previous year" })).toBeTruthy();
  });

  it("offers only calculators a calendar can actually support", async () => {
    const { container } = await enabled();
    fireEvent.click(screen.getByRole("tab", { name: "Numbers" }));
    const text = container.textContent!.toLowerCase();

    expect(text).toContain("your usual cycle length");
    expect(text).toContain("which cycle day is a date?");
    // Every calculator the reference apps offer here is a fertility or
    // pregnancy prediction, and none of them can come from a calendar.
    for (const banned of ["ovulation calculator", "fertile", "implantation", "hcg", "due date"]) {
      expect(text).not.toContain(banned);
    }
  });

  it("answers the per-phase slot with questions, never with food or exercise", async () => {
    const { container } = await enabled();
    fireEvent.click(screen.getByRole("tab", { name: "Phases" }));
    const text = container.textContent!.toLowerCase();

    expect(text).toContain("what feels supportive for you?");
    expect(text).toContain("does not tell you what to eat");
    for (const banned of [
      "protein-rich",
      "fermented",
      "gentle movement",
      "avoid caffeine",
      "supplement",
      "workout",
    ]) {
      expect(text).not.toContain(banned);
    }
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
    fireEvent.click(screen.getByRole("tab", { name: "Phases" }));

    expect(container.textContent).toContain("How is your energy today?");
    expect(container.textContent).toContain("Would you like to reduce, keep, or expand your plan?");
    expect(container.textContent).toContain("does not tell you what to eat");
  });

  it("folds the long sections away, so the page opens short", async () => {
    const { container } = await enabled();

    const folded = [...container.querySelectorAll("details")].map(
      (d) => d.querySelector("h2")?.textContent,
    );
    expect(folded).toEqual(["How today felt"]);
    // Closed by default, and still findable by the browser's own search.
    expect([...container.querySelectorAll("details")].every((d) => !d.open)).toBe(true);
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

  it("adds a past period by nudging the days, with no date typing", async () => {
    const { api } = await enabled();
    const todayId = api.store!.today;

    // The form opens on today. Three taps back is three days ago.
    const back = screen.getAllByRole("button", {
      name: "One day earlier for the started date",
    })[0];
    fireEvent.click(back);
    fireEvent.click(back);
    fireEvent.click(back);
    fireEvent.click(screen.getByRole("button", { name: "Add this period" }));

    const entries = sortedEntries(api.store!.cycle);
    expect(entries).toHaveLength(1);
    expect(entries[0].startDate).toBe(shiftDayId(todayId, -3));
    // No end was added, so it is recorded as ongoing rather than guessed at.
    expect(entries[0].endDate).toBeNull();
  });

  it("adds an end to a past period without opening a date picker", async () => {
    const { api } = await enabled();
    const todayId = api.store!.today;

    const back = screen.getAllByRole("button", {
      name: "One day earlier for the started date",
    })[0];
    fireEvent.click(back);
    fireEvent.click(back);
    fireEvent.click(screen.getAllByRole("button", { name: "Add an end date" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Add this period" }));

    const entries = sortedEntries(api.store!.cycle);
    expect(entries[0].startDate).toBe(shiftDayId(todayId, -2));
    expect(entries[0].endDate).toBe(todayId);
  });

  it("refuses a duplicate start rather than double counting it", async () => {
    const { api, container } = await enabled();

    fireEvent.click(screen.getByRole("button", { name: "My period started today" }));
    // The past-period form still opens on today, so adding it again duplicates.
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
          startDate: shiftDayId(todayId, -4),
          endDate: shiftDayId(todayId, -1),
          loggedAt: "x",
        },
      }),
    );

    // Two taps back lands inside the period already logged.
    const back = screen.getAllByRole("button", {
      name: "One day earlier for the started date",
    })[0];
    fireEvent.click(back);
    fireEvent.click(back);
    fireEvent.click(screen.getByRole("button", { name: "Add this period" }));

    expect(sortedEntries(api.store!.cycle)).toHaveLength(1);
    expect(container.textContent).toContain("overlaps a period you have already logged");
  });
});
