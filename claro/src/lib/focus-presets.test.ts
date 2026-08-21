import { describe, expect, it } from "vitest";

import {
  CUSTOM_PRESET_ID,
  DEFAULT_FOCUS_PREFS,
  FOCUS_PRESETS,
  MAX_FOCUS_MINUTES,
  clampBreakMinutes,
  clampFocusMinutes,
  describeBlock,
  formatBlockLength,
  matchPreset,
  minutesToMs,
  msToMinutes,
  presetById,
  readFocusPrefs,
} from "./focus-presets";

const MINUTE = 60_000;

describe("the named shapes", () => {
  it("includes Pomodoro, with the break that makes it one", () => {
    const pomodoro = presetById("pomodoro");

    expect(pomodoro?.focusMs).toBe(25 * MINUTE);
    expect(pomodoro?.breakMs).toBe(5 * MINUTE);
  });

  it("gives every preset a length and a label", () => {
    for (const preset of FOCUS_PRESETS) {
      expect(preset.focusMs).toBeGreaterThan(0);
      expect(preset.label.trim()).not.toBe("");
      expect(preset.hint.trim()).not.toBe("");
    }
  });

  it("has unique ids, so a chip can never mean two things", () => {
    const ids = FOCUS_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(CUSTOM_PRESET_ID);
  });

  it("is derived from the numbers, so typing 25 and 5 is still Pomodoro", () => {
    expect(matchPreset(25 * MINUTE, 5 * MINUTE)?.id).toBe("pomodoro");
    // The same focus length with a different break is not the same shape.
    expect(matchPreset(25 * MINUTE, 0)).toBeNull();
    expect(matchPreset(22 * MINUTE, 0)).toBeNull();
  });
});

describe("any length at all", () => {
  it("takes the odd numbers people actually work in", () => {
    for (const value of [1, 10, 13, 22, 47, 90, 180]) {
      expect(clampFocusMinutes(value)).toBe(value);
    }
  });

  it("holds the ends of the range rather than refusing", () => {
    expect(clampFocusMinutes(0)).toBe(1);
    expect(clampFocusMinutes(-30)).toBe(1);
    expect(clampFocusMinutes(600)).toBe(MAX_FOCUS_MINUTES);
  });

  it("never lets a half-typed field become a block length", () => {
    // An empty input is `Number("")` → 0 elsewhere, but a blank or a stray
    // character must fall back rather than produce NaN minutes.
    expect(clampFocusMinutes(Number.NaN)).toBe(25);
    expect(clampFocusMinutes(Number("abc"))).toBe(25);
    expect(Number.isFinite(minutesToMs(clampFocusMinutes(Number.NaN)))).toBe(true);
  });

  it("rounds rather than storing a fraction of a minute", () => {
    expect(clampFocusMinutes(22.4)).toBe(22);
    expect(clampFocusMinutes(22.6)).toBe(23);
  });

  it("treats a break of zero as a real answer, not a missing one", () => {
    expect(clampBreakMinutes(0)).toBe(0);
    expect(clampBreakMinutes(-5)).toBe(0);
    expect(clampBreakMinutes(90)).toBe(60);
  });

  it("survives a round trip through milliseconds", () => {
    for (const value of [1, 22, 50, 180]) {
      expect(msToMinutes(minutesToMs(value))).toBe(value);
    }
  });
});

describe("saying what will happen", () => {
  it("reads a length back in plain words", () => {
    expect(formatBlockLength(MINUTE)).toBe("1 minute");
    expect(formatBlockLength(22 * MINUTE)).toBe("22 minutes");
    expect(formatBlockLength(60 * MINUTE)).toBe("1 hour");
    expect(formatBlockLength(90 * MINUTE)).toBe("1 hour 30 minutes");
    expect(formatBlockLength(0)).toBe("0 minutes");
  });

  it("says whether a break follows, in the same sentence", () => {
    expect(describeBlock(25 * MINUTE, 5 * MINUTE)).toBe(
      "25 minutes of focus, then a 5 minute break.",
    );
    expect(describeBlock(22 * MINUTE, 0)).toBe("22 minutes of focus, with no break after it.");
  });

  it("uses no em dashes or double hyphens", () => {
    const copy = [
      ...FOCUS_PRESETS.flatMap((preset) => [preset.label, preset.hint]),
      describeBlock(25 * MINUTE, 5 * MINUTE),
      describeBlock(22 * MINUTE, 0),
    ];
    for (const line of copy) {
      expect(line).not.toContain("—");
      expect(line).not.toContain("--");
    }
  });
});

describe("remembering the choice", () => {
  it("keeps a stored pair as it was saved", () => {
    const stored = { plannedMs: 18 * MINUTE, breakMs: 3 * MINUTE, presetId: "custom" };

    expect(readFocusPrefs(stored)).toEqual(stored);
  });

  it("falls back rather than crashing on anything unusable", () => {
    expect(readFocusPrefs(null)).toEqual(DEFAULT_FOCUS_PREFS);
    expect(readFocusPrefs("nonsense")).toEqual(DEFAULT_FOCUS_PREFS);
    expect(readFocusPrefs({})).toEqual({
      plannedMs: 25 * MINUTE,
      breakMs: 0,
      presetId: "custom",
    });
  });

  it("pulls an out-of-range stored length back into the range", () => {
    expect(readFocusPrefs({ plannedMs: 9999 * MINUTE, breakMs: 0 }).plannedMs).toBe(
      MAX_FOCUS_MINUTES * MINUTE,
    );
    expect(readFocusPrefs({ plannedMs: 0, breakMs: 0 }).plannedMs).toBe(MINUTE);
  });

  it("works out which chip a stored pair belongs to when none was recorded", () => {
    expect(readFocusPrefs({ plannedMs: 25 * MINUTE, breakMs: 5 * MINUTE }).presetId).toBe(
      "pomodoro",
    );
    expect(readFocusPrefs({ plannedMs: 22 * MINUTE, breakMs: 0 }).presetId).toBe(CUSTOM_PRESET_ID);
  });

  it("defaults to Pomodoro, which is a starting point and not a rule", () => {
    expect(DEFAULT_FOCUS_PREFS.presetId).toBe("pomodoro");
    expect(matchPreset(DEFAULT_FOCUS_PREFS.plannedMs, DEFAULT_FOCUS_PREFS.breakMs)?.id).toBe(
      "pomodoro",
    );
  });
});
