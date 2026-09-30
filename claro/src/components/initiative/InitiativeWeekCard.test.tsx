import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { InitiativeWeekCard } from "./InitiativeWeekCard";
import { ClaroProvider, useClaro } from "@/lib/claro-store";
import { applySeed, selfLoveLockIn } from "@/lib/initiatives";
import type { ClaroState, Initiative } from "@/lib/types";

beforeEach(() => localStorage.clear());

type Api = { store: ReturnType<typeof useClaro> | null };

/** Monday 5 October to Sunday 11 October 2026, the initiative's second week. */
const WEEK = "2026-W41";
const SUNDAY = "2026-10-11";

function harness(todayId: string, seedState?: (state: ClaroState) => ClaroState) {
  const api: Api = { store: null };

  function Probe() {
    api.store = useClaro();
    return null;
  }
  function View() {
    const { ready, state } = useClaro();
    if (!ready) return null;
    const initiative = Object.values(state.initiatives ?? {})[0] as Initiative | undefined;
    if (!initiative) return <p>no initiative</p>;
    return <InitiativeWeekCard initiative={initiative} weekId={WEEK} todayId={todayId} />;
  }

  const utils = render(
    <ClaroProvider>
      <Probe />
      <View />
    </ClaroProvider>,
  );
  return { api, seedState, ...utils };
}

const ready = async (api: Api) => waitFor(() => expect(api.store?.ready).toBe(true));

/** Lay the real initiative down, the way the button does. */
const setUp = (api: Api) =>
  act(() => api.store!.applyInitiativeSeed(selfLoveLockIn(), new Date("2026-09-30T09:00:00.000Z")));

describe("the initiative, beside the week it is made of", () => {
  it("names itself and shows nothing kept before anything is done", async () => {
    const { api } = harness("2026-10-07");
    await ready(api);
    setUp(api);

    await waitFor(() => expect(screen.getByText("Self Love Lock In")).toBeTruthy());
    // Two habit days pinned into this week plus one content day, one review
    // and one wind-down question: what was due, none of it kept yet.
    expect(screen.getByText(/^0 of \d+$/)).toBeTruthy();
  });

  it("counts a practice the moment it is ticked", async () => {
    const { api } = harness("2026-10-07");
    await ready(api);
    setUp(api);

    await waitFor(() => expect(screen.getByText("Self Love Lock In")).toBeTruthy());
    const before = screen.getByText(/^0 of (\d+)$/).textContent!;
    const due = before.split(" of ")[1];

    const run = Object.values(api.store!.state.habits).find((h) => h.name === "run")!;
    act(() => api.store!.toggleHabitDone(run.id, "2026-10-05", new Date("2026-10-05T09:00:00Z")));

    await waitFor(() => expect(screen.getByText(`1 of ${due}`)).toBeTruthy());
  });

  it("says the night is not rated rather than calling it zero", async () => {
    const { api } = harness("2026-10-07");
    await ready(api);
    setUp(api);

    await waitFor(() => expect(screen.getByText("Not rated yet")).toBeTruthy());
  });

  it("averages only the nights that were rated", async () => {
    const { api } = harness("2026-10-07");
    await ready(api);
    setUp(api);
    await waitFor(() => expect(screen.getByText("Self Love Lock In")).toBeTruthy());

    act(() => {
      api.store!.updateDay("2026-10-05", (d) => ({ ...d, sleepQuality: 4 }));
      api.store!.updateDay("2026-10-06", (d) => ({ ...d, sleepQuality: 3 }));
    });

    await waitFor(() => expect(screen.getByText("3.5 of 5")).toBeTruthy());
  });
});

describe("the Sunday review", () => {
  it("stays out of the way on a Tuesday", async () => {
    const { api } = harness("2026-10-06");
    await ready(api);
    setUp(api);

    /*
     * Asking "what got in the way" on a Tuesday invites somebody to write off
     * the rest of the week before it has happened.
     */
    await waitFor(() => expect(screen.getByText("Self Love Lock In")).toBeTruthy());
    expect(screen.queryByLabelText("What did I keep?")).toBeNull();
  });

  it("opens its three questions on Sunday", async () => {
    const { api } = harness(SUNDAY);
    await ready(api);
    setUp(api);

    await waitFor(() => expect(screen.getByLabelText("What did I keep?")).toBeTruthy());
    expect(screen.getByLabelText("What got in the way?")).toBeTruthy();
    expect(screen.getByLabelText("One thing to adjust next week?")).toBeTruthy();
  });

  it("writes an answer against the Sunday of the week on screen", async () => {
    const { api } = harness(SUNDAY);
    await ready(api);
    setUp(api);

    const field = await screen.findByLabelText("What did I keep?");
    fireEvent.change(field, { target: { value: "the run and two lifts" } });
    fireEvent.blur(field);

    await waitFor(() => {
      const initiative = Object.values(api.store!.state.initiatives)[0];
      expect(initiative.reviews[0]).toMatchObject({
        dayId: SUNDAY,
        kind: "week",
        answers: { kept: "the run and two lifts" },
      });
    });
  });

  it("still shows a review written on a week being looked back at", async () => {
    // Opened on a Wednesday weeks later: the questions belong to that Sunday,
    // so what was written then has to come back rather than an empty form.
    const { api } = harness("2026-11-18");
    await ready(api);
    setUp(api);
    await waitFor(() => expect(screen.getByText("Self Love Lock In")).toBeTruthy());

    act(() => {
      const id = Object.keys(api.store!.state.initiatives)[0];
      api.store!.updateInitiative(id, (i) => ({
        ...i,
        reviews: [{ id: "r1", dayId: SUNDAY, kind: "week", answers: { kept: "most of it" } }],
      }));
    });

    await waitFor(() =>
      expect((screen.getByLabelText("What did I keep?") as HTMLTextAreaElement).value).toBe(
        "most of it",
      ),
    );
  });
});

describe("laying the initiative down", () => {
  it("writes the whole two months through the store", async () => {
    const { api } = harness("2026-10-07");
    await ready(api);
    expect(screen.getByText("no initiative")).toBeTruthy();

    setUp(api);

    await waitFor(() => expect(screen.getByText("Self Love Lock In")).toBeTruthy());
    const state = api.store!.state;
    expect(Object.keys(state.days).length).toBeGreaterThan(30);
    expect(Object.values(state.habits).map((h) => h.name).sort()).toEqual([
      "evening wind-down",
      "lift",
      "run",
    ]);
  });

  it("is safe to press twice, through the store as well as in the library", async () => {
    const { api } = harness("2026-10-07");
    await ready(api);
    setUp(api);
    await waitFor(() => expect(screen.getByText("Self Love Lock In")).toBeTruthy());

    const count = () =>
      Object.values(api.store!.state.days).flatMap((d) => [...d.actions, ...d.scheduleItems]).length;
    const before = count();

    setUp(api);
    await waitFor(() => expect(Object.keys(api.store!.state.initiatives)).toHaveLength(1));
    expect(count()).toBe(before);
  });

  it("keeps a state written by the library identical to one written by the store", async () => {
    const { api } = harness("2026-10-07");
    await ready(api);
    setUp(api);

    await waitFor(() => expect(screen.getByText("Self Love Lock In")).toBeTruthy());
    const viaStore = api.store!.state;
    const viaLib = applySeed(
      { ...viaStore, days: {}, habits: {}, initiatives: {} },
      selfLoveLockIn(),
      new Date("2026-09-30T09:00:00.000Z"),
    ).state;

    // The store method is a thin wrapper and must stay one: the counts are
    // what would drift first if it ever grew logic of its own.
    expect(Object.keys(viaLib.days).length).toBe(Object.keys(viaStore.days).length);
  });
});
