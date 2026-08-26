import { describe, expect, it } from "vitest";

import {
  CARD_META,
  DRIFTED_INVITATION,
  DRIFTED_NOTE,
  DRIFTED_QUESTIONS,
  DRIFT_THRESHOLD,
  GUIDANCE_FRAMING,
  GUIDANCE_NOTICE,
  MATCH_PROMPT,
  PHASE_DEFAULT_ENERGY,
  PHASE_QUESTIONS,
  SUGGESTION_CARDS,
  allGuidanceCopy,
  answerToday,
  answersFor,
  hasDrifted,
  isMiss,
  matchKey,
  suggestionsFor,
} from "./cycle-guidance";
import { CYCLE_PHASES } from "./cycle-phases";
import type { GuidanceMatch, MatchAnswer } from "./types";

const match = (
  card: "phase" | "eat" | "move" | "do",
  phase: string,
  dayId: string,
  answer: MatchAnswer,
): GuidanceMatch => ({
  id: `${card}-${dayId}`,
  card,
  phase,
  dayId,
  answer,
  answeredAt: `${dayId}T20:00:00.000Z`,
});

const asMap = (list: GuidanceMatch[]): Record<string, GuidanceMatch> =>
  Object.fromEntries(list.map((m) => [matchKey(m.card, m.dayId), m]));

describe("the suggestions a card shows", () => {
  it("gives three lines for every card, phase and energy", () => {
    for (const card of SUGGESTION_CARDS) {
      for (const phase of CYCLE_PHASES) {
        for (const band of ["low", "medium", "high"] as const) {
          const { lines } = suggestionsFor(card, phase, band);
          expect(lines.length).toBeGreaterThanOrEqual(2);
          expect(lines.every((l) => l.trim().length > 0)).toBe(true);
        }
      }
    }
  });

  it("changes with the energy the reader logged", () => {
    const low = suggestionsFor("move", "follicular", "low").lines;
    const high = suggestionsFor("move", "follicular", "high").lines;

    expect(low).not.toEqual(high);
  });

  it("falls back to the phase default and says that is what it did", () => {
    const guessed = suggestionsFor("do", "luteal", null);
    const stated = suggestionsFor("do", "luteal", PHASE_DEFAULT_ENERGY.luteal);

    expect(guessed.fromDefault).toBe(true);
    expect(guessed.energy).toBe(PHASE_DEFAULT_ENERGY.luteal);
    expect(guessed.lines).toEqual(stated.lines);
    // A logged energy is never reported as a default, or the interface could
    // not tell the reader which of the two it was working from.
    expect(suggestionsFor("do", "luteal", "high").fromDefault).toBe(false);
  });
});

describe("the copy rules this content had to keep", () => {
  const copy = () => allGuidanceCopy().join(" ").toLowerCase();

  it("never instructs the reader", () => {
    for (const banned of [
      "you should",
      "you must",
      "avoid ",
      "do not eat",
      "make sure",
      "we recommend",
      "best to ",
      "you need to",
    ]) {
      expect(copy()).not.toContain(banned);
    }
  });

  it("makes no claim about a hormone, a symptom or a diagnosis", () => {
    for (const banned of [
      "hormone",
      "oestrogen",
      "estrogen",
      "progesterone",
      "cramps",
      "symptom",
      "boosts",
      "reduces inflammation",
      "your brain",
      "your body is",
    ]) {
      expect(copy()).not.toContain(banned);
    }
  });

  it("makes no fertility or pregnancy claim, in any card", () => {
    for (const banned of ["fertile", "fertility", "conceive", "conception", "pregnan", "ovulating"]) {
      expect(copy()).not.toContain(banned);
    }
  });

  it("passes no verdict on the reader or their numbers", () => {
    for (const banned of ["normal", "abnormal", "healthy", "unhealthy", "too short", "too long"]) {
      expect(copy()).not.toContain(banned);
    }
  });

  it("opens every phase card with a question rather than a reading", () => {
    for (const phase of CYCLE_PHASES) {
      expect(PHASE_QUESTIONS[phase].trim().endsWith("?")).toBe(true);
      expect(DRIFTED_QUESTIONS[phase].trim().endsWith("?")).toBe(true);
    }
  });

  it("frames the suggestions as something some people find helpful, once", () => {
    expect(GUIDANCE_FRAMING.toLowerCase()).toContain("some people find");
    // And not repeated onto each card, which put the same seven words on
    // screen three times in a single glance.
    for (const card of SUGGESTION_CARDS) {
      expect(JSON.stringify(CARD_META[card]).toLowerCase()).not.toContain("some people find");
    }
  });

  it("says the guidance is general and the reader is the better source", () => {
    expect(GUIDANCE_NOTICE.toLowerCase()).toContain("general information only");
    expect(GUIDANCE_NOTICE.toLowerCase()).toContain("what you actually notice");
  });

  it("asks whether it landed, on every card", () => {
    expect(MATCH_PROMPT.trim().endsWith("?")).toBe(true);
  });

  it("uses no em dashes or double hyphens anywhere the reader can see", () => {
    for (const line of allGuidanceCopy()) {
      expect(line).not.toContain("—");
      expect(line).not.toContain("--");
    }
  });
});

describe("a card that stops fitting", () => {
  it("keeps offering suggestions while it is landing", () => {
    const matches = asMap([
      match("do", "luteal", "2026-08-24", "yes"),
      match("do", "luteal", "2026-08-25", "yes"),
    ]);

    expect(hasDrifted(matches, "do", "luteal")).toBe(false);
  });

  it("does not flinch at a single bad day", () => {
    const matches = asMap([
      match("do", "luteal", "2026-08-24", "yes"),
      match("do", "luteal", "2026-08-25", "notReally"),
    ]);

    // One miss is a day, not a pattern. A card that gave up here would never
    // settle for anyone.
    expect(hasDrifted(matches, "do", "luteal")).toBe(false);
  });

  it("stops asserting once it has missed twice inside the window", () => {
    const matches = asMap([
      match("do", "luteal", "2026-08-24", "notReally"),
      match("do", "luteal", "2026-08-25", "opposite"),
    ]);

    expect(hasDrifted(matches, "do", "luteal")).toBe(true);
  });

  it("counts opposite as a miss, and keeps it as its own answer", () => {
    expect(isMiss("opposite")).toBe(true);
    expect(isMiss("notReally")).toBe(true);
    expect(isMiss("yes")).toBe(false);
  });

  it("can come back, because only recent answers count", () => {
    const matches = asMap([
      match("do", "luteal", "2026-06-01", "notReally"),
      match("do", "luteal", "2026-06-02", "opposite"),
      match("do", "luteal", "2026-08-24", "yes"),
      match("do", "luteal", "2026-08-25", "yes"),
      match("do", "luteal", "2026-08-26", "yes"),
    ]);

    // Being wrong in June must not silence the card forever.
    expect(hasDrifted(matches, "do", "luteal")).toBe(false);
  });

  it("keeps each card and phase separate", () => {
    const matches = asMap([
      match("do", "luteal", "2026-08-24", "notReally"),
      match("do", "luteal", "2026-08-25", "opposite"),
    ]);

    // Saying the luteal Do card misses says nothing about Eat, or about Do in
    // another phase, and must not silence either.
    expect(hasDrifted(matches, "do", "luteal")).toBe(true);
    expect(hasDrifted(matches, "eat", "luteal")).toBe(false);
    expect(hasDrifted(matches, "do", "follicular")).toBe(false);
  });

  it("needs at least the threshold of answers before it can drift at all", () => {
    const one = asMap([match("do", "luteal", "2026-08-25", "opposite")]);

    expect(DRIFT_THRESHOLD).toBeGreaterThan(1);
    expect(hasDrifted(one, "do", "luteal")).toBe(false);
  });

  it("reads today's answer back, so the choice stays visible", () => {
    const matches = asMap([match("eat", "menstrual", "2026-08-26", "notReally")]);

    expect(answerToday(matches, "eat", "2026-08-26")).toBe("notReally");
    expect(answerToday(matches, "eat", "2026-08-25")).toBeNull();
    expect(answerToday(matches, "move", "2026-08-26")).toBeNull();
  });

  it("orders answers newest first, whatever order they were written in", () => {
    const matches = asMap([
      match("eat", "luteal", "2026-08-20", "yes"),
      match("eat", "luteal", "2026-08-26", "notReally"),
      match("eat", "luteal", "2026-08-23", "yes"),
    ]);

    expect(answersFor(matches, "eat", "luteal").map((m) => m.dayId)).toEqual([
      "2026-08-26",
      "2026-08-23",
      "2026-08-20",
    ]);
  });

  it("says what it is doing instead, rather than going quiet", () => {
    expect(DRIFTED_NOTE.length).toBeGreaterThan(0);
    expect(DRIFTED_INVITATION.trim().endsWith("?")).toBe(true);
  });
});
