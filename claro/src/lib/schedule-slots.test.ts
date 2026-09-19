import { describe, expect, it } from "vitest";

import { freeSlotAfterLast, hourHasRoom, nextFreeSlot } from "./day-plan";
import { blankDay } from "./storage";
import type { Day, ScheduleItem } from "./types";

const at = (time: string, text = "x"): ScheduleItem => ({
  id: time,
  time,
  text,
  link: null,
  done: false,
});

const day = (...items: ScheduleItem[]): Day => ({
  ...blankDay("2026-09-19"),
  scheduleItems: items,
});

describe("finding room in an hour", () => {
  it("offers the top of an empty hour", () => {
    expect(freeSlotAfterLast(day(), "14:00")).toBe("14:00");
  });

  it("looks forward from what is already booked, not back to the top", () => {
    /*
     * Having just written something at 2:40, the next thing is almost always
     * after it. Offering 2:00 would be technically free and practically wrong.
     */
    expect(freeSlotAfterLast(day(at("14:40")), "14:00")).toBe("14:45");
  });

  it("fills a gap when there is nothing later to go after", () => {
    // 2:45 is the latest and nothing follows it inside the hour, so the
    // earlier hole is better than refusing.
    expect(freeSlotAfterLast(day(at("14:00"), at("14:45")), "14:00")).toBe("14:15");
  });

  it("keeps an hour open past the four tidy quarters", () => {
    const full = day(at("14:00"), at("14:15"), at("14:30"), at("14:45"));

    /*
     * The dead end this exists for. Four entries used to close an hour
     * completely: the plus disappeared with no reason given, on a day that
     * genuinely had five things in it.
     */
    expect(hourHasRoom(full, "14:00")).toBe(true);
    expect(freeSlotAfterLast(full, "14:00")).toBe("14:46");
  });

  it("prefers a tidy quarter over a stray minute", () => {
    // 2:01 is free and later than 2:00, but 2:15 is the better offer.
    expect(freeSlotAfterLast(day(at("14:00")), "14:00")).toBe("14:15");
  });

  it("says an hour is out of room only when it truly is", () => {
    const every = day(
      ...Array.from({ length: 60 }, (_, m) => at(`14:${String(m).padStart(2, "0")}`)),
    );
    expect(hourHasRoom(every, "14:00")).toBe(false);
    expect(freeSlotAfterLast(every, "14:00")).toBeNull();
  });

  it("ignores a block that was carried to another day", () => {
    const carried = day({ ...at("14:00"), carriedTo: "2026-09-20" });
    expect(freeSlotAfterLast(carried, "14:00")).toBe("14:00");
  });

  it("does not let another hour's blocks crowd this one", () => {
    expect(freeSlotAfterLast(day(at("15:00"), at("15:15")), "14:00")).toBe("14:00");
  });

  it("keeps nextFreeSlot answering with a time, for callers that need one", () => {
    // The older helper still returns the hour as its fallback, so the places
    // that write a block with it are unchanged.
    expect(nextFreeSlot(day(at("14:40")), "14:00")).toBe("14:45");
  });
});
