import { act, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, search, children, ...rest }: { to: string; search?: Record<string, string>; children: ReactNode }) => (
    <a href={search?.d ? `${to}?d=${search.d}` : to} {...rest}>
      {children}
    </a>
  ),
}));

import { ScheduleWeek } from "./ScheduleWeek";
import { ScheduleMonth } from "./ScheduleMonth";
import { ClaroProvider, useClaro } from "@/lib/claro-store";
import { weekDayIds, weekOfDay } from "@/lib/dates";
import { blockItem } from "@/lib/schedule";
import type { ISODate, ScheduleItem } from "@/lib/types";

beforeEach(() => localStorage.clear());

type Api = { store: ReturnType<typeof useClaro> | null };

function harness(view: "week" | "month" = "week") {
  const api: Api = { store: null };
  function Probe() {
    api.store = useClaro();
    return null;
  }
  function View() {
    const { today, ready } = useClaro();
    /*
     * The real app gates every page behind `ready` in `AppShell`, so `today` is
     * never the empty string these components would be handed here. Without
     * this the first render asks date-fns to format "" and throws.
     */
    if (!ready) return null;
    return view === "week" ? (
      <ScheduleWeek weekId={weekOfDay(today)} todayId={today} />
    ) : (
      <ScheduleMonth anchor={today} todayId={today} />
    );
  }
  const utils = render(
    <ClaroProvider>
      <Probe />
      <View />
    </ClaroProvider>,
  );
  return { api, ...utils };
}

const ready = async (api: Api) => waitFor(() => expect(api.store?.ready).toBe(true));

/** Put a block on a day, the only way the schedule is ever written. */
const book = (api: Api, dayId: ISODate, time: string, text: string, patch: Partial<ScheduleItem> = {}) =>
  act(() =>
    api.store!.updateDay(dayId, (day) => ({
      ...day,
      scheduleItems: [...day.scheduleItems, { ...blockItem(time, text), ...patch }],
    })),
  );

const days = (api: Api) => weekDayIds(weekOfDay(api.store!.today));

describe("the week, as what is booked in it", () => {
  it("says what is missing rather than drawing an empty grid", async () => {
    const { api, container } = harness();
    await ready(api);

    expect(container.textContent).toContain("Nothing is on the week yet");
  });

  it("shows a block in its own day and hour", async () => {
    const { api } = harness();
    await ready(api);
    book(api, days(api)[2], "13:00", "lunch with Ren");

    await waitFor(() => expect(screen.getByTitle(/lunch with Ren/)).toBeTruthy());
    expect(screen.getByText("1 PM")).toBeTruthy();
  });

  it("draws only the hours the week uses, not all eighteen", async () => {
    const { api, container } = harness();
    await ready(api);
    book(api, days(api)[0], "09:00", "standup");

    /*
     * Eighteen empty rows is a spreadsheet. One hour either side of what is
     * actually booked is a week somebody can read at a glance.
     */
    await waitFor(() => expect(screen.getByText("9 AM")).toBeTruthy());
    expect(screen.getByText("8 AM")).toBeTruthy();
    expect(screen.getByText("10 AM")).toBeTruthy();
    expect(container.textContent).not.toContain("5 AM");
    expect(container.textContent).not.toContain("10 PM");
  });

  it("leaves out work that was carried to another day", async () => {
    const { api, container } = harness();
    await ready(api);
    book(api, days(api)[1], "10:00", "moved on", { carriedTo: "2026-12-01" });

    // It belongs to the day it went to, and counting it twice would overstate
    // a week somebody has already dealt with.
    await waitFor(() => expect(api.store?.ready).toBe(true));
    expect(container.textContent).toContain("Nothing is on the week yet");
  });

  it("links a day to Daily, and names today by leaving the URL alone", async () => {
    const { api } = harness();
    await ready(api);
    const week = days(api);
    book(api, week[0], "09:00", "standup");

    await waitFor(() => expect(screen.getByTitle(/standup/)).toBeTruthy());
    const href = screen.getByTitle(/standup/).getAttribute("href");
    // A day that is not today names itself; today is the bare route, so the
    // link cannot pin a date that stops being today tomorrow.
    expect(href).toBe(week[0] === api.store!.today ? "/today" : `/today?d=${week[0]}`);
  });
});

describe("the month, as what is booked in it", () => {
  it("lists the blocks on a day rather than counting them", async () => {
    const { api } = harness("month");
    await ready(api);
    book(api, api.store!.today, "09:00", "standup");

    /*
     * The month on /calendar answers "how did my month go" with counts. This
     * one answers "what is on my month", and a count of three cannot.
     */
    await waitFor(() => expect(screen.getByTitle(/standup/)).toBeTruthy());
  });

  it("stops listing past three and says how many are left", async () => {
    const { api, container } = harness("month");
    await ready(api);
    const day = api.store!.today;
    for (const [time, text] of [["09:00", "a"], ["10:00", "b"], ["11:00", "c"], ["12:00", "d"], ["13:00", "e"]]) {
      book(api, day, time, text);
    }

    // Squeezing five blocks into a 72px cell makes every one unreadable.
    await waitFor(() => expect(container.textContent).toContain("2 more"));
  });
});
