import { describe, expect, it } from "vitest";

import {
  BAND_LABELS,
  CYCLE_BANDS,
  MIN_NOTES_FOR_PATTERN,
  MIN_NOTES_IN_BAND,
  observations,
  positionOn,
  summariseNote,
} from "./cycle-timeline";
import { blankCycle } from "./storage";
import type { CycleCheckIn, CycleState, ISODate } from "./types";

/** Four starts 28 days apart, so the median gap is a clean 28. */
const withStarts = (...starts: ISODate[]): CycleState => ({
  settings: { enabled: true, optedInAt: "2026-01-01T09:00:00.000Z" },
  entries: Object.fromEntries(
    starts.map((startDate, i) => [`e${i}`, { id: `e${i}`, startDate, loggedAt: "x" }]),
  ),
  checkIns: {},
});

const REGULAR = () => withStarts("2026-05-04", "2026-06-01", "2026-06-29", "2026-07-27");

const note = (
  dayId: ISODate,
  patch: Partial<CycleCheckIn> = {},
): CycleCheckIn => ({
  dayId,
  energy: null,
  mood: null,
  stress: null,
  note: "",
  updatedAt: "x",
  ...patch,
});

const withNotes = (cycle: CycleState, ...notes: CycleCheckIn[]): CycleState => ({
  ...cycle,
  checkIns: Object.fromEntries(notes.map((n) => [n.dayId, n])),
});

describe("where a day falls", () => {
  it("counts from the most recent logged start, with day one being the start", () => {
    expect(positionOn(REGULAR(), "2026-07-27")).toMatchObject({ day: 1, since: "2026-07-27" });
    expect(positionOn(REGULAR(), "2026-08-01")).toMatchObject({ day: 6, since: "2026-07-27" });
  });

  it("measures against the user's own median, not a standard length", () => {
    expect(positionOn(REGULAR(), "2026-08-01")?.ofAbout).toBe(28);
  });

  it("puts a day in one of three equal bands", () => {
    expect(positionOn(REGULAR(), "2026-07-28")?.band).toBe("early");
    expect(positionOn(REGULAR(), "2026-08-08")?.band).toBe("middle");
    expect(positionOn(REGULAR(), "2026-08-20")?.band).toBe("later");
  });

  it("says nothing at all without enough history to know a typical length", () => {
    expect(positionOn(withStarts("2026-07-27"), "2026-08-01")).toBeNull();
    expect(positionOn(blankCycle(), "2026-08-01")).toBeNull();
  });

  it("says nothing before the first logged start", () => {
    expect(positionOn(REGULAR(), "2026-01-01")).toBeNull();
  });

  it("stops counting once it is far past a typical length", () => {
    // Well beyond the estimate, the number would mean nothing.
    expect(positionOn(REGULAR(), "2026-12-01")).toBeNull();
  });

  it("labels bands by position, never by physiology", () => {
    const labels = CYCLE_BANDS.map((b) => BAND_LABELS[b].toLowerCase()).join(" ");

    expect(labels).toContain("estimated cycle");
    // No physiological or fertility naming anywhere in the labels.
    for (const forbidden of ["follicular", "luteal", "ovulat", "fertile", "hormone"]) {
      expect(labels).not.toContain(forbidden);
    }
  });
});

describe("personal observations", () => {
  it("says nothing until there is enough of the user's own history", () => {
    expect(MIN_NOTES_FOR_PATTERN).toBe(5);
    expect(observations(REGULAR())).toEqual([]);

    const few = withNotes(
      REGULAR(),
      note("2026-07-28", { energy: 1 }),
      note("2026-07-29", { energy: 2 }),
    );
    expect(observations(few)).toEqual([]);
  });

  it("says nothing when a band has too few notes to describe", () => {
    expect(MIN_NOTES_IN_BAND).toBe(3);

    // Five notes overall, but spread so no band reaches three.
    const spread = withNotes(
      REGULAR(),
      note("2026-07-28", { energy: 1 }),
      note("2026-07-29", { energy: 1 }),
      note("2026-08-08", { energy: 1 }),
      note("2026-08-09", { energy: 1 }),
      note("2026-08-20", { energy: 1 }),
    );

    expect(observations(spread)).toEqual([]);
  });

  it("describes what the user logged, as a plain count", () => {
    const early = withNotes(
      REGULAR(),
      note("2026-07-28", { energy: 1 }),
      note("2026-07-29", { energy: 2 }),
      note("2026-07-30", { energy: 1 }),
      note("2026-07-31", { energy: 4 }),
      note("2026-08-01", { energy: 5 }),
    );

    const found = observations(early);
    expect(found).toHaveLength(1);
    expect(found[0].band).toBe("early");
    expect(found[0].text).toBe(
      "You logged lower energy on 3 of your last 5 notes in this part of your cycle.",
    );
  });

  it("stays quiet when the readings do not lean one way", () => {
    const mixed = withNotes(
      REGULAR(),
      note("2026-07-28", { energy: 1 }),
      note("2026-07-29", { energy: 4 }),
      note("2026-07-30", { energy: 5 }),
      note("2026-07-31", { energy: 4 }),
      note("2026-08-01", { energy: 5 }),
    );

    expect(observations(mixed)).toEqual([]);
  });

  it("never advises, recommends or explains a cause", () => {
    const early = withNotes(
      REGULAR(),
      note("2026-07-28", { stress: 5 }),
      note("2026-07-29", { stress: 4 }),
      note("2026-07-30", { stress: 5 }),
      note("2026-07-31", { stress: 5 }),
      note("2026-08-01", { stress: 4 }),
    );

    const text = observations(early).map((o) => o.text).join(" ").toLowerCase();
    expect(text).toContain("you logged");
    for (const forbidden of ["should", "try ", "because", "recommend", "avoid", "eat", "hormone"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("ignores empty notes entirely", () => {
    const empties = withNotes(
      REGULAR(),
      note("2026-07-28"),
      note("2026-07-29"),
      note("2026-07-30"),
      note("2026-07-31"),
      note("2026-08-01"),
    );

    expect(observations(empties)).toEqual([]);
  });
});

describe("summarising one note", () => {
  it("reads back only what was set", () => {
    expect(summariseNote(note("2026-08-01", { energy: 2, stress: 4 }))).toBe(
      "Energy low, Stress high",
    );
    expect(summariseNote(note("2026-08-01"))).toBe("");
  });
});
