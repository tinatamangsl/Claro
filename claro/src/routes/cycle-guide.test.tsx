import { act, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  createFileRoute: () => (options: unknown) => options,
}));

import { CycleGuide } from "./cycle-guide";
import { ClaroProvider, useClaro } from "@/lib/claro-store";
import { GUIDE_SOURCES, PHASE_CARDS } from "@/lib/cycle-guide";
import { shiftDayId, weekOfDay } from "@/lib/dates";
import type { CycleCheckIn, CycleEntry } from "@/lib/types";

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
      <CycleGuide />
    </ClaroProvider>,
  );

  return { api, ...view };
}

const ready = async (api: { store: ReturnType<typeof useClaro> | null }) =>
  waitFor(() => expect(api.store?.ready).toBe(true));

/** Regular starts ending recently, so an estimated position exists. */
const regularStarts = (todayId: string): Record<string, CycleEntry> =>
  Object.fromEntries(
    [56 + 3, 28 + 3, 3].map((back, i) => {
      const startDate = shiftDayId(todayId, -back);
      return [`e${i}`, { id: `e${i}`, startDate, endDate: shiftDayId(startDate, 3), loggedAt: "x" }];
    }),
  );

const note = (dayId: string): CycleCheckIn => ({
  dayId,
  energy: 2,
  mood: null,
  stress: null,
  feeling: null,
  note: "Slept badly",
  evening: null,
  updatedAt: "x",
});

describe("the learning page", () => {
  it("carries its title, subtitle and the notice", async () => {
    const { api, container } = harness();
    await ready(api);

    expect(screen.getByRole("heading", { name: "Understanding your menstrual cycle" })).toBeTruthy();
    expect(container.textContent).toContain(
      "A guide to estimated cycle phases, your own notes, and questions you may want to explore.",
    );
    expect(container.textContent).toContain(
      "This guide is for general education and personal reflection. It does not replace medical advice.",
    );
  });

  it("shows all four phase cards, each with its estimate disclaimer", async () => {
    const { api, container } = harness();
    await ready(api);

    for (const card of PHASE_CARDS) {
      expect(screen.getByRole("heading", { name: card.title })).toBeTruthy();
      expect(container.textContent).toContain(card.estimateNote);
    }
  });

  it("does not treat 28 days as the standard", async () => {
    const { api, container } = harness();
    await ready(api);

    expect(container.textContent).toContain("There is no single correct length");
    expect(container.textContent!.toLowerCase()).not.toContain("28-day");
  });

  it("lists every source with the metadata a reader needs to weigh it", async () => {
    const { api, container } = harness();
    await ready(api);

    // Scoped to the source list: the phase cards link to the same pages, so an
    // unscoped query would match twice.
    const list = within(container.querySelector("ul.paper-panel") as HTMLElement);
    for (const source of GUIDE_SOURCES) {
      expect(list.getByRole("link", { name: source.title }).getAttribute("href")).toBe(source.url);
    }

    expect(container.textContent).toContain("Organisation:");
    expect(container.textContent).toContain("Published or reviewed:");
    expect(container.textContent).toContain("Claro review date:");
    expect(container.textContent).toContain("None named on the source");
  });

  it("offers healthcare support without diagnosing", async () => {
    const { api, container } = harness();
    await ready(api);

    expect(container.textContent).toContain("a doctor, nurse or pharmacist can talk it through");
  });
});

describe("personal notes on the guide", () => {
  it("shows nothing of the user's own until cycle notes are turned on", async () => {
    const { api, container } = harness();
    await ready(api);

    act(() => {
      // Data exists, but consent does not.
      api.store!.setCycleEntries(regularStarts(api.store!.today));
      api.store!.writeCycleCheckIn(shiftDayId(api.store!.today, -31), { energy: 2 }, new Date());
    });

    expect(container.textContent).toContain("Cycle notes are turned off");
    expect(container.textContent).not.toContain(
      "Here are notes you recorded around this estimated point",
    );
  });

  it("shows the user's own past notes from this point once they have opted in", async () => {
    const { api, container } = harness();
    await ready(api);

    const todayId = api.store!.today;

    act(() => {
      api.store!.setCycleEnabled(true, new Date());
      api.store!.setCycleEntries(regularStarts(todayId));
    });

    // Written through the store's own writer, so the test exercises the real path.
    act(() => {
      const earlier = shiftDayId(todayId, -28);
      api.store!.writeCycleCheckIn(
        earlier,
        { energy: note(earlier).energy, note: note(earlier).note },
        new Date(),
      );
    });

    expect(container.textContent).toContain(
      "Here are notes you recorded around this estimated point in past cycles",
    );
    expect(container.textContent).toContain("Slept badly");
    expect(container.textContent).toContain("You may choose to consider these notes while planning");
  });

  it("changes no plan, habit, goal or focus record by being opened", async () => {
    const { api } = harness();
    await ready(api);

    const todayId = api.store!.today;
    const weekId = weekOfDay(todayId);

    act(() => {
      api.store!.setCycleEnabled(true, new Date());
      api.store!.setCycleEntries(regularStarts(todayId));
      api.store!.updateWeek(weekId, (w) => ({ ...w, work: { ...w.work, goal: "Launch the beta" } }));
      api.store!.updateDay(todayId, (d) => ({
        ...d,
        priority1: { ...d.priority1, id: "p1", text: "Ship the store", done: false },
      }));
      api.store!.addHabit({
        id: "h1",
        name: "Walk",
        createdAt: "2026-01-01T09:00:00.000Z",
        archivedAt: null,
      });
    });

    const before = JSON.stringify({
      day: api.store!.day(todayId),
      week: api.store!.week(weekId),
      habits: api.store!.state.habits,
      cycle: api.store!.cycle,
    });

    // Re-render the page against the seeded store.
    render(
      <ClaroProvider>
        <CycleGuide />
      </ClaroProvider>,
    );

    const after = JSON.stringify({
      day: api.store!.day(todayId),
      week: api.store!.week(weekId),
      habits: api.store!.state.habits,
      cycle: api.store!.cycle,
    });

    expect(after).toBe(before);
    expect(api.store!.activeSession).toBeNull();
  });
});
