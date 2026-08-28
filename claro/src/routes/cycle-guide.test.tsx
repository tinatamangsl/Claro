import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import { ESTIMATE_BAND, GUIDE_PROMPTS, GUIDE_SOURCES, MYTHS, PHASE_CARDS } from "@/lib/cycle-guide";
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
  flow: null,
  note: "Slept badly",
  evening: null,
    noticed: "",
    journal: "",
  updatedAt: "x",
});

describe("the learning page", () => {
  it("carries its title, subtitle and the notice", async () => {
    const { api, container } = harness();
    await ready(api);

    expect(screen.getByRole("heading", { name: "Four phases. Tap one." })).toBeTruthy();
    expect(container.textContent).toContain(
      "No two cycles match, not even your own. Here is what each stretch is, in plain words.",
    );
    expect(container.textContent).toContain(
      "This guide is for general education and personal reflection. It does not replace medical advice.",
    );
  });

  it("reaches every phase, and every phase states the limit of a calendar", async () => {
    const { api, container } = harness();
    await ready(api);

    /*
     * One phase at a time now, chosen from a tab strip, rather than four
     * articles down a column. The estimate note moved behind "go deeper" with
     * the paragraphs it belongs to, and the statement that covers the whole
     * explorer sits under the card at every phase: see the test below.
     */
    for (const card of PHASE_CARDS) {
      fireEvent.click(screen.getByRole("tab", { name: card.short }));
      expect(screen.getByRole("heading", { name: card.short })).toBeTruthy();
      expect(container.textContent).toContain(card.lead);

      fireEvent.click(screen.getByRole("button", { name: "Go deeper" }));
      expect(container.textContent).toContain(card.estimateNote);
      for (const paragraph of card.body) {
        expect(container.textContent).toContain(paragraph);
      }
    }
  });

  it("says the phases are an estimate, on every phase, without being opened", async () => {
    const { api, container } = harness();
    await ready(api);

    for (const card of PHASE_CARDS) {
      fireEvent.click(screen.getByRole("tab", { name: card.short }));
      expect(container.textContent).toContain(ESTIMATE_BAND);
    }
  });

  it("does not treat 28 days as the standard", async () => {
    const { api, container } = harness();
    await ready(api);

    /*
     * This used to read off a "before the phases" preamble. That section is
     * gone and its three claims are each somewhere they are harder to skip:
     * the 28 day one is the first myth card, cycle length versus bleeding days
     * is the second, and the calendar-estimate point is the band under the
     * phase explorer. Flipping the card is what a reader does, so the test
     * does it too.
     */
    fireEvent.click(screen.getByRole("button", { name: /28 days is the normal cycle/ }));

    expect(container.textContent).toContain("An average, not a standard");
    expect(container.textContent).toContain("Claro does not treat 28 as the default");
    expect(container.textContent!.toLowerCase()).not.toContain("28-day");
    // And no verdict on a cycle that is not 28 days, in either direction.
    for (const verdict of ["normal cycle length", "healthy", "abnormal", "too short", "too long"]) {
      expect(container.textContent!.toLowerCase()).not.toContain(verdict);
    }
  });

  it("keeps the myth hidden behind the claim until the reader asks", async () => {
    const { api, container } = harness();
    await ready(api);

    for (const entry of MYTHS) {
      // The claim is what shows first: reading it and then wanting the answer
      // is what makes the correction land.
      expect(container.textContent).toContain(entry.myth);
      expect(container.textContent).not.toContain(entry.truth);
    }

    const card = screen.getByRole("button", { name: new RegExp(MYTHS[1].myth) });
    expect(card.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(card);

    expect(card.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain(MYTHS[1].truth);
    // Independent, so two can be compared side by side.
    expect(container.textContent).not.toContain(MYTHS[0].truth);
  });

  it("corrects a claim and never the reader", async () => {
    const { api, container } = harness();
    await ready(api);

    for (const entry of MYTHS) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(entry.myth) }));
    }

    /*
     * The whole section is about things somebody was told wrongly, which is
     * the one place on this page where it would be easy to slip into telling
     * them they were wrong, or into grading the cycle behind the question.
     */
    const text = container.textContent!.toLowerCase();
    for (const banned of ["you were wrong", "mistake", "actually,", "healthy", "abnormal"]) {
      expect(text).not.toContain(banned);
    }
  });

  it("gives every question somewhere to answer it, and keeps the answer", async () => {
    const { api } = harness();
    await ready(api);

    const prompt = GUIDE_PROMPTS[0];
    // Closed to begin with: five open fields is a form, and this is a page.
    expect(screen.queryByLabelText(prompt.question)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: prompt.question }));
    const field = screen.getByLabelText(prompt.question);
    fireEvent.change(field, { target: { value: "steady, better than last week" } });
    fireEvent.blur(field);

    await waitFor(() =>
      expect(api.store!.cycle.guideAnswers[prompt.id]).toBe("steady, better than last week"),
    );
  });

  it("clears an answer rather than storing an empty one", async () => {
    const { api } = harness();
    await ready(api);

    const prompt = GUIDE_PROMPTS[0];
    fireEvent.click(screen.getByRole("button", { name: prompt.question }));
    const field = screen.getByLabelText(prompt.question);

    fireEvent.change(field, { target: { value: "written" } });
    fireEvent.blur(field);
    await waitFor(() => expect(api.store!.cycle.guideAnswers[prompt.id]).toBe("written"));

    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.blur(field);

    // Emptying the box leaves no trace of having written in it.
    await waitFor(() => expect(prompt.id in api.store!.cycle.guideAnswers).toBe(false));
  });

  it("does not print a private answer on the collapsed row", async () => {
    const { api, container } = harness();
    await ready(api);

    const prompt = GUIDE_PROMPTS[0];
    fireEvent.click(screen.getByRole("button", { name: prompt.question }));
    const field = screen.getByLabelText(prompt.question);
    fireEvent.change(field, { target: { value: "slept badly again" } });
    fireEvent.blur(field);
    await waitFor(() => expect(api.store!.cycle.guideAnswers[prompt.id]).toBe("slept badly again"));

    // Collapse it. Somebody may be reading this page with another person
    // beside them, and the row should not read the note back out.
    fireEvent.click(screen.getByRole("button", { name: prompt.question }));
    expect(container.textContent).not.toContain("slept badly again");
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
