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

  it("opens on today, not on the grid today is drawn from", async () => {
    const { container } = await enabled();

    const headings = [...container.querySelectorAll("h1, h2")].map((h) => h.textContent);
    /*
     * This reverses the earlier order deliberately. The calendar used to come
     * first, on the reasoning that it is what the page is for. It is what the
     * page is made *of*; what somebody opens it for is "what about today?".
     * So the phase card and the guidance come first, then the log, and the
     * grid follows.
     */
    expect(headings).toEqual([
      "Cycle notes",
      "Today",
      // No guidance section here: with no logged start there is no phase, and
      // a card of suggestions for a phase nobody is in would be invention.
      "How are you feeling today?",
      "Your cycle calendar",
      "Log a period start",
      "Your numbers",
      "Your data",
    ]);
    expect(headings.indexOf("How are you feeling today?")).toBeLessThan(
      headings.indexOf("Your cycle calendar"),
    );
  });

  it("keeps the records behind one control instead of five screens of stack", async () => {
    const { container } = await enabled();

    const tabs = [...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent);
    // The calendar left the control when it moved to the top of the page.
    expect(tabs).toEqual(["Numbers", "Phases", "History"]);
    // Only the chosen one is mounted, which is what keeps the page short.
    expect(container.textContent).not.toContain("Your cycle, part by part");
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
    const text = container.textContent!.toLowerCase();

    expect(text).toContain("your usual cycle length");
    expect(text).toContain("which cycle day is a date?");
    // Every calculator the reference apps offer here is a fertility or
    // pregnancy prediction, and none of them can come from a calendar.
    for (const banned of ["ovulation calculator", "implantation", "hcg", "due date"]) {
      expect(text).not.toContain(banned);
    }
    // "Fertile" now appears once, in the sentence that rules it out.
    for (const sentence of text.split(/(?<=[.?!])\s+/)) {
      if (!sentence.includes("fertile")) continue;
      expect(sentence).toMatch(/\bnot\b|\bcannot\b|\bnever\b|does not/);
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

  it("says plainly what is missing when there is no history yet", async () => {
    const { container } = await enabled();

    expect(container.textContent).toContain("Not enough of your own history yet");
    // And points at the two ways out rather than leaving a dead end.
    expect(container.textContent).toContain("tell Claro your usual cycle length");
  });

  it("shows the day, the phase and the next window once there is history", async () => {
    const h = harness();
    await ready(h.api);
    const todayId = h.api.store!.today;

    act(() => {
      h.api.store!.setCycleEnabled(true, new Date());
      h.api.store!.setCycleEntries(
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
        ),
      );
    });

    expect(h.container.textContent).toContain("of about 28");
    expect(h.container.textContent).toContain("Next period");
    expect(h.container.textContent).toContain("estimated, from your own dates");
  });

  it("keeps every promise in full, once, rather than in fragments on each card", async () => {
    const { container } = await enabled();

    // Collapsed, but present in the document, so it is searchable and reachable.
    const note = [...container.querySelectorAll("details")].find((d) =>
      d.textContent?.includes("What Claro does with this"),
    )!;
    expect(note).toBeTruthy();
    expect(note.open).toBe(false);

    for (const promise of [
      "estimate, not medical advice",
      "first day of one period to the first day of the next",
      "never changes your day, week, quarter, habits, goals, focus or sound",
      "does not show a fertile window",
      "doctor, nurse or pharmacist",
    ]) {
      expect(note.textContent).toContain(promise);
    }
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

    /*
     * The daily note is no longer one of these. It was folded away at the foot
     * of the page, which put the one thing done every day furthest from the
     * top; it is now open, above the calendar. Nothing else was unfolded.
     */
    const folded = [...container.querySelectorAll("details")]
      .map((d) => d.querySelector("h2")?.textContent)
      .filter(Boolean);
    expect(folded).not.toContain("How today felt");
    // Whatever remains folded is still closed by default, and still findable
    // by the browser's own in-page search.
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

describe("the guidance, and the standing offer to disagree with it", () => {
  const withHistory = async () => {
    const h = harness();
    await ready(h.api);
    const todayId = h.api.store!.today;

    act(() => {
      h.api.store!.setCycleEnabled(true, new Date());
      h.api.store!.setCycleEntries(
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
        ),
      );
    });
    return h;
  };

  it("opens the phase card with a question rather than a reading", async () => {
    const h = await withHistory();

    // Not "your energy is building" or "your brain is working harder": Claro
    // knows four dates, and a question is the strongest honest opening.
    const insight = h.container.querySelector("section")!;
    expect(h.container.textContent).toMatch(/\?/);
    expect(insight.textContent).not.toContain("your brain");
    expect(h.container.textContent).not.toContain("Energy is building");
  });

  it("frames the three cards as something some people find helpful", async () => {
    const h = await withHistory();

    expect(h.container.textContent).toContain("Some people find these helpful");
    expect(h.container.textContent).toContain("General information only");
    expect(h.container.textContent).toContain("Trust what you actually notice");
  });

  it("asks whether each card landed, and records the answer", async () => {
    const h = await withHistory();

    const notReally = screen.getAllByRole("button", { name: /^Not really, about/ });
    // Four cards ask: the phase card and the three suggestion cards.
    expect(notReally.length).toBe(4);

    act(() => {
      notReally[0].click();
    });

    const saved = Object.values(h.api.store!.cycle.guidanceMatches);
    expect(saved).toHaveLength(1);
    expect(saved[0].answer).toBe("notReally");
  });

  it("changes nothing outside the card that was answered", async () => {
    const h = await withHistory();
    const before = JSON.stringify(h.api.store!.day(h.api.store!.today));

    act(() => {
      screen.getAllByRole("button", { name: /^Opposite, about/ })[0].click();
    });

    // The whole promise of this page is that it never edits a plan.
    expect(JSON.stringify(h.api.store!.day(h.api.store!.today))).toBe(before);
  });

  it("names each card's answers apart, so three prompts are not one control", async () => {
    const h = await withHistory();

    expect(screen.getByRole("button", { name: "Yes, about the eat card" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, about the move card" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, about the do today card" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, about the phase card" })).toBeTruthy();
  });
});
