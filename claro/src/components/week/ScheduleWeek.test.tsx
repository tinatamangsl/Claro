import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ScheduleWeek } from "./ScheduleWeek";
import { ScheduleMonth } from "./ScheduleMonth";
import { ClaroProvider, useClaro } from "@/lib/claro-store";
import { formatDayLong, weekDayIds, weekOfDay } from "@/lib/dates";
import { blockItem } from "@/lib/schedule";
import type { ISODate, ScheduleItem, WeekId } from "@/lib/types";

beforeEach(() => localStorage.clear());

type Api = { store: ReturnType<typeof useClaro> | null };

function harness(view: "week" | "month" = "week") {
  const api: Api = { store: null };
  const openDay = vi.fn();
  const openWeek = vi.fn();

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
      <ScheduleWeek weekId={weekOfDay(today)} todayId={today} onOpenDay={openDay} />
    ) : (
      <ScheduleMonth anchor={today} todayId={today} onOpenWeek={openWeek} onOpenDay={openDay} />
    );
  }
  const utils = render(
    <ClaroProvider>
      <Probe />
      <View />
    </ClaroProvider>,
  );
  return { api, openDay, openWeek, ...utils };
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

/** The empty part of a cell, which is also the cell's drop target. */
const adder = (dayId: ISODate, label: string) =>
  screen.getByLabelText(`Add at ${label} on ${formatDayLong(dayId)}`);

describe("the week, as what is booked in it", () => {
  it("still offers hours to fill when nothing is booked yet", async () => {
    const { api, container } = harness();
    await ready(api);

    /*
     * The grid used to refuse to draw at all on an empty week, which was
     * honest when it could only read. Now that a cell can be written into, a
     * week with nothing on it is exactly the week that needs the grid.
     */
    expect(container.textContent).toContain("Nothing is on this week yet");
    expect(adder(days(api)[0], "9 AM")).toBeTruthy();
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
    expect(container.textContent).toContain("Nothing is on this week yet");
  });

  it("opens Daily from a day heading", async () => {
    const { api, openDay } = harness();
    await ready(api);
    const week = days(api);

    fireEvent.click(screen.getByLabelText(`Open ${formatDayLong(week[3])} on Daily`));
    expect(openDay).toHaveBeenCalledWith(week[3]);
  });

  it("opens Daily from the block itself, on the day the block is on", async () => {
    const { api, openDay } = harness();
    await ready(api);
    const week = days(api);
    book(api, week[1], "09:00", "standup");

    await waitFor(() => expect(screen.getByTitle(/standup/)).toBeTruthy());
    fireEvent.click(screen.getByTitle(/standup/));
    expect(openDay).toHaveBeenCalledWith(week[1]);
  });
});

describe("moving a block around the week", () => {
  /*
   * Pointer events, not the browser's drag-and-drop, because HTML5 dragging
   * does not exist on a touch screen. jsdom has no layout, so the hit test
   * that finds the cell under the pointer is stubbed; that it finds the right
   * cell in a real browser is not something jsdom can answer either way.
   */
  type Hit = { elementFromPoint?: (x: number, y: number) => Element | null };
  const dragTo = (block: HTMLElement, cell: HTMLElement) => {
    // jsdom has no layout, so it does not implement hit testing at all.
    const hit = document as unknown as Hit;
    const original = hit.elementFromPoint;
    hit.elementFromPoint = () => cell;
    fireEvent.pointerDown(block, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 240, clientY: 0 });
    fireEvent.pointerUp(window, { clientX: 240, clientY: 0 });
    hit.elementFromPoint = original;
  };

  it("drops it on another day, keeping the minute it was set to", async () => {
    const { api } = harness();
    await ready(api);
    const week = days(api);
    book(api, week[0], "09:40", "deep work");
    // A second block so the grid draws 10 AM as well as 9.
    book(api, week[0], "10:00", "anchor");

    await waitFor(() => expect(screen.getByTitle(/deep work/)).toBeTruthy());
    dragTo(screen.getByTitle(/deep work/), adder(week[2], "10 AM").parentElement!);

    await waitFor(() =>
      expect(api.store!.day(week[2]).scheduleItems.map((i) => i.time)).toEqual(["10:40"]),
    );
    // Written to both days, or the block would exist twice.
    expect(api.store!.day(week[0]).scheduleItems.map((i) => i.text)).toEqual(["anchor"]);
  });

  it("does not open Daily when the press was a drag rather than a tap", async () => {
    const { api, openDay } = harness();
    await ready(api);
    const week = days(api);
    book(api, week[0], "09:00", "deep work");
    book(api, week[0], "10:00", "anchor");

    await waitFor(() => expect(screen.getByTitle(/deep work/)).toBeTruthy());
    const block = screen.getByTitle(/deep work/);
    dragTo(block, adder(week[2], "10 AM").parentElement!);
    // A drag that ends on a block still reads as a click to the browser.
    fireEvent.click(block);

    expect(openDay).not.toHaveBeenCalled();
  });

  it("still opens Daily on the tap after a drag that ended over nothing", async () => {
    const { api, openDay } = harness();
    await ready(api);
    const week = days(api);
    book(api, week[0], "09:00", "deep work");
    book(api, week[0], "10:00", "anchor");

    await waitFor(() => expect(screen.getByTitle(/deep work/)).toBeTruthy());
    const block = screen.getByTitle(/deep work/);

    // Released over the page, not over a cell: no click follows, so the guard
    // that suppresses the click after a drag has nothing to clear it.
    const hit = document as unknown as Hit;
    hit.elementFromPoint = () => null;
    fireEvent.pointerDown(block, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 400, clientY: 400 });
    fireEvent.pointerUp(window, { clientX: 400, clientY: 400 });
    delete hit.elementFromPoint;

    fireEvent.pointerDown(block, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(window, { clientX: 0, clientY: 0 });
    fireEvent.click(block);

    expect(openDay).toHaveBeenCalledWith(week[0]);
  });

  it("will not drag a row that only points at a priority or an action", async () => {
    const { api } = harness();
    await ready(api);
    const week = days(api);

    act(() =>
      api.store!.updateDay(week[0], (day) => ({
        ...day,
        actions: [
          { id: "a1", text: "draft the note", bucket: "task", done: false, createdAt: "x" },
        ],
        scheduleItems: [
          {
            id: "s1",
            time: "09:00",
            text: "draft the note",
            link: { kind: "action", actionId: "a1" },
            done: false,
          },
        ],
      })),
    );

    await waitFor(() => expect(screen.getByTitle(/draft the note/)).toBeTruthy());
    dragTo(screen.getByTitle(/draft the note/), adder(week[2], "10 AM").parentElement!);

    // Moving it would move the booking and leave the action behind.
    expect(api.store!.day(week[0]).scheduleItems[0].time).toBe("09:00");
    expect(api.store!.day(week[2]).scheduleItems).toEqual([]);
  });
});

describe("writing into a cell of the week", () => {
  const compose = async (api: Api, dayId: ISODate, label: string) => {
    fireEvent.click(adder(dayId, label));
    return waitFor(() => screen.getByLabelText(new RegExp(`New entry on ${formatDayLong(dayId)}`)));
  };

  it("adds a block at the hour that was clicked", async () => {
    const { api } = harness();
    await ready(api);
    const week = days(api);

    const field = await compose(api, week[2], "11 AM");
    fireEvent.change(field, { target: { value: "write the brief" } });
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() => {
      const items = api.store!.day(week[2]).scheduleItems;
      expect(items.map((i) => [i.time, i.text])).toEqual([["11:00", "write the brief"]]);
    });
  });

  it("adds a task as a real action, with the schedule pointing at it", async () => {
    const { api } = harness();
    await ready(api);
    const week = days(api);

    const field = await compose(api, week[1], "2 PM");
    fireEvent.click(screen.getByRole("button", { name: "Task" }));
    fireEvent.change(field, { target: { value: "call the supplier" } });
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() => expect(api.store!.day(week[1]).actions).toHaveLength(1));
    const day = api.store!.day(week[1]);
    const action = day.actions[0];

    /*
     * One record, in the list Daily and the carry forward both read from. The
     * schedule row points at it rather than holding a second copy of the
     * words, so renaming it in either place renames it in both.
     */
    expect([action.text, action.bucket]).toEqual(["call the supplier", "task"]);
    expect(day.scheduleItems[0].link).toEqual({ kind: "action", actionId: action.id });
    expect(day.scheduleItems[0].time).toBe("14:00");
  });

  it("adds a quick tick to the quick tick bucket, not to tasks", async () => {
    const { api } = harness();
    await ready(api);
    const week = days(api);

    const field = await compose(api, week[0], "9 AM");
    fireEvent.click(screen.getByRole("button", { name: "Quick" }));
    fireEvent.change(field, { target: { value: "reply to Sam" } });
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() => expect(api.store!.day(week[0]).actions).toHaveLength(1));
    expect(api.store!.day(week[0]).actions[0].bucket).toBe("quickTick");
  });

  it("stays open for the next line rather than closing after one", async () => {
    const { api } = harness();
    await ready(api);
    const week = days(api);

    const field = await compose(api, week[3], "12 PM");
    fireEvent.change(field, { target: { value: "first" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(api.store!.day(week[3]).scheduleItems).toHaveLength(1));

    // The same field, emptied, the way AddItem behaves everywhere else.
    expect((field as HTMLInputElement).value).toBe("");
    fireEvent.change(field, { target: { value: "second" } });
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() =>
      expect(api.store!.day(week[3]).scheduleItems.map((i) => i.text)).toEqual([
        "first",
        "second",
      ]),
    );
    // Beside the first, not on top of it.
    expect(api.store!.day(week[3]).scheduleItems.map((i) => i.time)).toEqual(["12:00", "12:15"]);
  });

  it("abandons on Escape without writing anything", async () => {
    const { api } = harness();
    await ready(api);
    const week = days(api);

    const field = await compose(api, week[4], "9 AM");
    fireEvent.change(field, { target: { value: "never mind" } });
    fireEvent.keyDown(field, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByLabelText(new RegExp(`New entry on ${formatDayLong(week[4])}`))).toBeNull(),
    );
    expect(api.store!.day(week[4]).scheduleItems).toEqual([]);
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

  it("opens a week from the number in the margin", async () => {
    const { api, openWeek } = harness("month");
    await ready(api);
    const thisWeek: WeekId = weekOfDay(api.store!.today);

    // Month to week to day, and the first step is the one the month was
    // missing: every cell only ever led to a single day.
    fireEvent.click(screen.getByLabelText(`Open Week ${Number(thisWeek.split("-W")[1])} in the week grid`));
    expect(openWeek).toHaveBeenCalledWith(thisWeek);
  });

  it("opens Daily from a day cell", async () => {
    const { api, openDay } = harness("month");
    await ready(api);

    fireEvent.click(screen.getByLabelText(`Open ${formatDayLong(api.store!.today)} on Daily`));
    expect(openDay).toHaveBeenCalledWith(api.store!.today);
  });
});
