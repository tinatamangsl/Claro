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

  it("opens on the calendar, with today directly under it", async () => {
    const { container } = await enabled();

    const headings = [...container.querySelectorAll("h1, h2")].map((h) => h.textContent);
    /*
     * This reverses the order a second time, and the reversal is the point.
     *
     * It was calendar first, then today first on the reasoning that the
     * calendar is what the page is made *of* while what somebody opens it for
     * is "what about today?". The calendar leads again now, and it earns the
     * slot because everything under it was compressed to let it.
     *
     * **This list is the guard on that compression.** Eight blocks once sat
     * between the header and the footer, because the design's additions were
     * layered on top of the page they were meant to replace rather than taking
     * its place: a separate energy card, a link into the section directly below
     * it, a full period-logging card, and a grid of three tiles that each led
     * somewhere already on screen. Adding a block here should be hard, and
     * doing it means answering why the design has no slot for it.
     */
    expect(headings).toEqual([
      "Cycle notes",
      "Your cycle calendar",
      // Today is one card carrying the reading and the two things done about
      // it: the energy row and the match prompt were taken off when the card
      // became the design's affirmation, and put back on request.
      "Today",
      "Energy today",
      // No guidance section here: with no logged start there is no phase, and
      // a card of suggestions for a phase nobody is in would be invention.
      "Your cycle, part by part",
      "Your data",
    ]);
    expect(headings.indexOf("Your cycle calendar")).toBeLessThan(headings.indexOf("Today"));
  });

  it("keeps the records behind one control instead of five screens of stack", async () => {
    const { container } = await enabled();

    // Scoped to the records control: the phase panel inside it carries a
    // tablist of its own, and an unscoped query returns both sets as one.
    const tabs = [
      ...container.querySelectorAll('[aria-label="Your cycle records"] [role="tab"]'),
    ].map((t) => t.textContent);
    // Four now: History became half of Your log, because a logged period and a
    // logged day are the same question at two scales, and Recent notes and
    // Cycle length were split out of the check-in form and the numbers.
    expect(tabs).toEqual(["About this phase", "Your log", "Recent notes", "Cycle length"]);
    // Only the chosen one is mounted, which is what keeps the page short.
    expect(container.textContent).not.toContain("Your logged periods");
  });

  it("keeps the destinations that go somewhere and drops the ones that did not", async () => {
    const { container } = await enabled();

    /*
     * A grid of three tiles used to sit here. Two of them went where the page
     * already went: "Log today" to the log this page carries, "Learn" to the
     * guidance link at the foot. Only the week ahead was somewhere else, so
     * both survivors are one quiet line each instead of a third of a grid
     * competing with the page's own content.
     */
    expect(screen.getByRole("link", { name: /The week ahead/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /guidance and sources/ })).toBeTruthy();
    expect(container.querySelector(".grid-cols-3")).toBeNull();
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
    // The numbers moved behind Cycle length when the records control grew from
    // three tabs to four; they are no longer what the section opens on.
    fireEvent.click(screen.getByRole("tab", { name: "Cycle length" }));
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
    fireEvent.click(screen.getByRole("tab", { name: "About this phase" }));
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

    /*
     * The action is logging a period, and it is the first thing on the page:
     * the calendar leads and a day is logged by tapping or dragging across it.
     * The "My period started today" card said the same thing a second time in
     * a second place, so it moved into Your log beside the history it writes
     * into. Nothing is behind a Learn more, which is what this has always been
     * about; the affordance simply stopped being duplicated.
     */
    expect(container.textContent).toContain("Tap a day, or drag across several");
    expect(container.textContent).not.toContain("Learn more");

    fireEvent.click(screen.getByRole("tab", { name: "Your log" }));
    expect(screen.getByRole("button", { name: "My period started today" })).toBeTruthy();
  });

  it("says plainly what is missing when there is no history yet", async () => {
    const { container } = await enabled();
    fireEvent.click(screen.getByRole("tab", { name: "Cycle length" }));

    /*
     * This used to read "not enough of your own history yet" off the glance
     * strip. The strip is gone: it repeated the cycle day, the phase and the
     * next estimate, which is now exactly what the today card carries, and two
     * components saying the same three things is the duplication this redesign
     * set out to remove. The promise it made survives here instead, beside the
     * field that actually resolves it, which is a better place for it.
     */
    expect(container.textContent).toContain("Not yet");
    // And points at the two ways out rather than leaving a dead end.
    expect(container.textContent).toContain(
      "Log a period start, then tell Claro roughly how long your cycle runs",
    );
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

    // Both on the today card: the day line carries the estimated length so the
    // chip beside it need not repeat it.
    expect(h.container.textContent).toContain("Day 6 of about 28");
    expect(h.container.textContent).toContain("Next period estimated");

    fireEvent.click(screen.getByRole("tab", { name: "Cycle length" }));
    expect(h.container.textContent).toContain("An estimate from your own dates");
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
    fireEvent.click(screen.getByRole("tab", { name: "About this phase" }));

    expect(container.textContent).toContain("How is your energy today?");
    expect(container.textContent).toContain("Would you like to reduce, keep, or expand your plan?");
    expect(container.textContent).toContain("does not tell you what to eat");
  });

  it("folds the long sections away, so the page opens short", async () => {
    const { container } = await enabled();

    /*
     * Nothing above the fold is a disclosure at all now. The calendar used to
     * be one, opened by default, which is a control that only ever hides the
     * thing the page leads with; it is a column of the layout instead. The
     * daily note was one too, folded at the foot, which put the thing done
     * every day furthest from the top.
     *
     * What is left folded is the secondary section and the promises note, and
     * both open closed. They stay in the document either way, so the browser's
     * own in-page search still reaches inside them.
     */
    const sections = [...container.querySelectorAll("details")];
    const named = (d: Element) => d.querySelector("h2")?.textContent ?? "";
    expect(sections.map(named)).not.toContain("How today felt");
    expect(sections.map(named)).not.toContain("Your cycle calendar");
    expect(sections.every((d) => !d.open)).toBe(true);
  });
});

describe("logging a period from the screen", () => {
  /*
   * The period card lives in Your log now, beside the history it writes into.
   * The calendar above still logs a period by tap or drag, which is the
   * affordance that had to stay in the open; this is the typed way in, and it
   * belongs with the records rather than as a second full card on the page.
   */
  const enabled = async () => {
    const h = harness();
    await ready(h.api);
    act(() => h.api.store!.setCycleEnabled(true, new Date()));
    fireEvent.click(screen.getByRole("tab", { name: "Your log" }));
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
  /*
   * The suggestion cards open one at a time now, so anything asking about all
   * of their contents has to say so. Only the first is open on arrival, which
   * is the point of the redesign: four suggestions stacked open was the
   * information dump this page was reorganised to stop being.
   */
  /*
   * They open by default now, so this is a guard rather than a step: it still
   * opens anything closed, so the tests below read the same whichever way that
   * decision goes next.
   */
  const openEverySuggestion = () => {
    for (const name of ["Work Focus", "Movement", "Food"]) {
      const header = screen.getByRole("button", { name: new RegExp(`^${name}`) });
      if (header.getAttribute("aria-expanded") === "false") fireEvent.click(header);
    }
  };

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
    openEverySuggestion();

    const notReally = screen.getAllByRole("button", { name: /^Not really, about/ });
    /*
     * Four ask: the today card and the three that make a suggestion. The
     * journal card is the one that does not, because there is no right answer
     * to something written in the reader's own words, and grading it would be
     * the page passing a verdict on what they wrote.
     */
    expect(notReally.length).toBe(4);

    act(() => {
      notReally[0].click();
    });

    const saved = Object.values(h.api.store!.cycle.guidanceMatches);
    expect(saved).toHaveLength(1);
    expect(saved[0].answer).toBe("notReally");
  });

  it("opens all four, because a shut row is a label rather than a suggestion", async () => {
    await withHistory();

    const headers = ["Work Focus", "Movement", "Journal Prompt", "Food"].map((name) =>
      screen.getByRole("button", { name: new RegExp(`^${name}`) }),
    );
    const open = () => headers.filter((h) => h.getAttribute("aria-expanded") === "true");

    /*
     * This went round twice: collapsed to stop the page reading as a dump, then
     * opened again when the user pointed out that four shut rows are not "what
     * to eat, move and do". The two-column layout is what lets them be open
     * without pushing the rest of the page down.
     */
    expect(open()).toEqual(headers);

    // Still individually collapsible, and independent rather than an accordion.
    fireEvent.click(headers[0]);
    expect(open()).toEqual([headers[1], headers[2], headers[3]]);

    fireEvent.click(headers[0]);
    expect(open()).toEqual(headers);
  });

  it("asks the journal prompt as a question, and never grades the answer", async () => {
    await withHistory();

    const header = screen.getByRole("button", { name: /^Journal Prompt/ });

    const body = document.getElementById(header.getAttribute("aria-controls")!)!;
    expect(body.textContent).toContain("?");
    expect(body.textContent).toContain("Only you ever see this");
    /*
     * The three suggestion cards ask whether they landed. This one does not:
     * there is no right answer to something written in the user's own words,
     * so asking whether it matched would be the page marking their work.
     */
    expect(body.querySelector('[aria-label^="Yes, about"]')).toBeNull();
  });

  it("keeps what was written in the journal on the same check-in as everything else", async () => {
    const h = await withHistory();
    const box = screen.getByLabelText("Your answer to today's journal prompt");
    fireEvent.change(box, { target: { value: "finishing the migration, then nothing" } });
    fireEvent.blur(box);

    await waitFor(() =>
      expect(h.api.store!.cycle.checkIns[h.api.store!.today]?.journal).toBe(
        "finishing the migration, then nothing",
      ),
    );
    // A separate field, so answering the prompt cannot overwrite the place
    // somebody said the guidance did not fit them.
    expect(h.api.store!.cycle.checkIns[h.api.store!.today]?.noticed).toBe("");
  });

  it("changes nothing outside the card that was answered", async () => {
    const h = await withHistory();
    const before = JSON.stringify(h.api.store!.day(h.api.store!.today));

    // The prompts live on the suggestion cards now, which start closed.
    openEverySuggestion();
    act(() => {
      screen.getAllByRole("button", { name: /^Opposite, about/ })[0].click();
    });

    // The whole promise of this page is that it never edits a plan.
    expect(JSON.stringify(h.api.store!.day(h.api.store!.today))).toBe(before);
  });

  it("names each card's answers apart, so three prompts are not one control", async () => {
    await withHistory();
    openEverySuggestion();

    /*
     * These read off the cards' displayed labels, not their storage keys. The
     * keys are still eat, move and do, because they are persisted inside
     * guidanceMatches and renaming them would orphan every answer already
     * saved; what a screen reader announces is the visible name.
     */
    expect(screen.getByRole("button", { name: "Yes, about the food card" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, about the movement card" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, about the work focus card" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, about the phase card" })).toBeTruthy();
  });
});
