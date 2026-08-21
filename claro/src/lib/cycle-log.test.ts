import { describe, expect, it } from "vitest";

import {
  ENERGY_BANDS,
  bandOf,
  describeMorning,
  isEveningDone,
  isLogged,
  levelForBand,
} from "./cycle-log";
import { FEELING_META, type CycleCheckIn, type EnergyLevel } from "./types";

const note = (patch: Partial<CycleCheckIn> = {}): CycleCheckIn => ({
  dayId: "2026-08-21",
  energy: null,
  mood: null,
  stress: null,
  feeling: null,
  note: "",
  evening: null,
  updatedAt: "",
  ...patch,
});

describe("three taps, one stored reading", () => {
  it("maps every level onto exactly one band", () => {
    expect(([1, 2, 3, 4, 5] as EnergyLevel[]).map(bandOf)).toEqual([
      "low",
      "low",
      "medium",
      "high",
      "high",
    ]);
    expect(bandOf(null)).toBeNull();
  });

  it("keeps a level that is already inside the band it was tapped into", () => {
    // Someone who recorded a 5 on the fuller page and then taps HIGH here still
    // has a 5. Only a move between bands rewrites the number.
    expect(levelForBand("high", 5)).toBe(5);
    expect(levelForBand("low", 1)).toBe(1);
    expect(levelForBand("medium", 3)).toBe(3);
  });

  it("writes the middle of the band when moving into a new one", () => {
    expect(levelForBand("low", 5)).toBe(2);
    expect(levelForBand("medium", 1)).toBe(3);
    expect(levelForBand("high", null)).toBe(4);
  });

  it("round trips: every band writes a level that reads back as that band", () => {
    for (const band of ENERGY_BANDS) {
      expect(bandOf(levelForBand(band, null))).toBe(band);
    }
  });
});

describe("whether the day has been logged", () => {
  it("counts energy, a word for the day, or a written note", () => {
    expect(isLogged(note())).toBe(false);
    expect(isLogged(note({ energy: 3 }))).toBe(true);
    expect(isLogged(note({ feeling: "calm" }))).toBe(true);
    expect(isLogged(note({ note: "Slept badly" }))).toBe(true);
  });

  it("does not count whitespace as something the user wrote", () => {
    expect(isLogged(note({ note: "   " }))).toBe(false);
  });

  it("tracks the evening answer separately from the morning", () => {
    const morning = note({ energy: 3 });
    expect(isEveningDone(morning)).toBe(false);

    expect(
      isEveningDone(
        note({ ...morning, evening: { match: "yes", note: "", emoji: "", updatedAt: "x" } }),
      ),
    ).toBe(true);
  });
});

describe("reading the morning back", () => {
  it("says what was entered, and nothing that was not", () => {
    const feeling = (f: keyof typeof FEELING_META) => FEELING_META[f].label;

    expect(describeMorning(note({ energy: 2, feeling: "scattered" }), feeling)).toBe(
      "low energy, scattered",
    );
    expect(describeMorning(note({ energy: 4 }), feeling)).toBe("high energy");
    expect(describeMorning(note({ feeling: "calm" }), feeling)).toBe("calm");
    expect(describeMorning(note(), feeling)).toBe("");
  });
});
