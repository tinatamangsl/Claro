import { describe, expect, it } from "vitest";

import {
  CLARO_REVIEW_DATE,
  GUIDE_NOTICE,
  GUIDE_SOURCES,
  NO_JUDGEMENT_NOTE,
  PHASE_CARDS,
  SUPPORTIVE_PROMPTS,
  SUPPORT_NOTE,
  missingSourceFields,
  sourceById,
  sourcesFor,
} from "./cycle-guide";

/** Every word the guide puts in front of a reader. */
const allCopy = (): string[] => [
  ...GUIDE_SOURCES.flatMap((s) => [s.title, s.organisation, s.type, s.credentials ?? "", s.published ?? ""]),
  ...PHASE_CARDS.flatMap((c) => [c.title, ...c.body, c.estimateNote, c.invitation]),
  ...SUPPORTIVE_PROMPTS,
  GUIDE_NOTICE,
  SUPPORT_NOTE,
  NO_JUDGEMENT_NOTE,
];

describe("source metadata", () => {
  it("gives every source the fields the page has to show", () => {
    for (const source of GUIDE_SOURCES) {
      expect(missingSourceFields(source)).toEqual([]);
    }
  });

  it("refuses a source that is missing any of them", () => {
    const good = GUIDE_SOURCES[0];

    expect(missingSourceFields({ ...good, title: "  " })).toEqual(["title"]);
    expect(missingSourceFields({ ...good, organisation: "" })).toEqual(["organisation"]);
    expect(missingSourceFields({ ...good, url: "http://example.com" })).toEqual(["url"]);
    expect(missingSourceFields({ ...good, type: "" })).toEqual(["type"]);
    expect(missingSourceFields({ ...good, reviewed: "" })).toEqual(["reviewed"]);
  });

  it("treats a missing author as different from one that was never checked", () => {
    const good = GUIDE_SOURCES[0];

    // An explicit null records that Claro looked and the source named nobody.
    expect(missingSourceFields({ ...good, author: null })).toEqual([]);
    expect(
      missingSourceFields({ ...good, author: undefined as unknown as string | null }),
    ).toEqual(["author"]);
  });

  it("links only to real https pages, one per source", () => {
    const urls = GUIDE_SOURCES.map((s) => s.url);

    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) expect(url.startsWith("https://")).toBe(true);
  });

  it("carries Claro's own review date on every source", () => {
    for (const source of GUIDE_SOURCES) {
      expect(source.reviewed).toBe(CLARO_REVIEW_DATE);
    }
    expect(CLARO_REVIEW_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("includes official menstrual health bodies", () => {
    const orgs = GUIDE_SOURCES.map((s) => s.organisation).join(" ");

    expect(orgs).toContain("NHS");
    expect(orgs).toContain("American College of Obstetricians and Gynecologists");
  });

  it("resolves the sources each card was written from", () => {
    for (const card of PHASE_CARDS) {
      expect(card.sourceIds.length).toBeGreaterThan(0);
      expect(sourcesFor(card).length).toBe(card.sourceIds.length);
    }
    expect(sourceById("nope")).toBeNull();
  });
});

describe("phase cards", () => {
  it("covers the four phases", () => {
    expect(PHASE_CARDS.map((c) => c.id)).toEqual([
      "menstruation",
      "follicular",
      "ovulation",
      "luteal",
    ]);
  });

  it("says on every single card that a date is an estimate", () => {
    for (const card of PHASE_CARDS) {
      expect(card.estimateNote.trim().length).toBeGreaterThan(0);
      expect(card.estimateNote.toLowerCase()).toMatch(
        /estimate|does not measure|dates you|logged dates|calendar/,
      );
    }
  });

  it("starts cycle counting at day 1 of bleeding, on the menstruation card", () => {
    const card = PHASE_CARDS.find((c) => c.id === "menstruation")!;

    expect(card.body.join(" ")).toContain("Day 1");
    expect(card.body.join(" ").toLowerCase()).toContain("follicular");
  });

  /**
   * These ideas are allowed to appear, but only as a refusal. Banning the words
   * outright would delete the very sentence that says Claro will not do it, so
   * the rule is checked per sentence instead.
   */
  it("mentions a fertile window or a pregnancy chance only to rule it out", () => {
    const sentences = allCopy()
      .join(" ")
      .toLowerCase()
      .split(/(?<=[.?!])\s+/);

    const banned = [
      "fertile window",
      "fertility window",
      "chance of pregnancy",
      "likely to conceive",
      "most fertile",
      "ovulation prediction",
      "predicts ovulation",
    ];

    for (const sentence of sentences) {
      for (const phrase of banned) {
        if (!sentence.includes(phrase)) continue;
        expect(sentence).toMatch(/\bnot\b|\bcannot\b|\bnever\b/);
      }
    }
  });

  it("says plainly that dates cannot confirm ovulation", () => {
    const card = PHASE_CARDS.find((c) => c.id === "ovulation")!;
    const text = `${card.body.join(" ")} ${card.estimateNote}`.toLowerCase();

    expect(text).toContain("cannot");
  });

  it("never tells the reader how they will feel, or what a phase makes them", () => {
    const text = allCopy().join(" ").toLowerCase();

    for (const banned of [
      "you will feel",
      "you will be",
      "makes you more",
      "makes you less",
      "your best work",
      "more productive",
      "less capable",
      "more creative",
      "more confident",
    ]) {
      expect(text).not.toContain(banned);
    }
  });

  it("never compares one body to another, or to men", () => {
    const text = allCopy().join(" ").toLowerCase();

    for (const banned of ["unlike men", "compared to men", "men do not", "male hormone"]) {
      expect(text).not.toContain(banned);
    }
  });

  it("never presents 28 days as the standard", () => {
    const text = allCopy().join(" ").toLowerCase();

    expect(text).not.toContain("28-day");
    expect(text).not.toContain("28 day");
    expect(text).not.toContain("usually 28");
  });

  it("never calls a period or a cycle normal or abnormal", () => {
    const text = allCopy().join(" ").toLowerCase();

    for (const banned of ["is normal", "abnormal", "perfectly normal", "nothing to worry"]) {
      expect(text).not.toContain(banned);
    }
  });

  it("hedges rather than asserts, at least somewhere on the phases", () => {
    const text = PHASE_CARDS.flatMap((c) => [...c.body, c.invitation]).join(" ").toLowerCase();

    expect(text).toContain("some people notice");
    expect(text).toContain("your experience may differ");
  });
});

describe("guidance is a set of questions", () => {
  it("asks, and never instructs", () => {
    for (const prompt of SUPPORTIVE_PROMPTS) {
      expect(prompt.trim().endsWith("?")).toBe(true);
    }
  });

  it("prescribes no food, supplement, workout, treatment or kind of work", () => {
    const text = SUPPORTIVE_PROMPTS.join(" ").toLowerCase();

    for (const banned of [
      "you should",
      "take a supplement",
      "avoid ",
      "try to ",
      "we recommend",
      "best to ",
    ]) {
      expect(text).not.toContain(banned);
    }
  });

  it("states that it does not replace medical advice", () => {
    expect(GUIDE_NOTICE.toLowerCase()).toContain("does not replace medical advice");
  });

  it("offers healthcare support without diagnosing or triaging", () => {
    const text = SUPPORT_NOTE.toLowerCase();

    expect(text).toMatch(/doctor|nurse|pharmacist/);
    for (const banned of ["you may have", "this could be", "urgent", "seek immediate"]) {
      expect(text).not.toContain(banned);
    }
  });

  it("promises no verdict on a duration or a gap", () => {
    expect(NO_JUDGEMENT_NOTE.toLowerCase()).toContain("does not say whether");
  });
});

describe("copy style", () => {
  it("uses no em dashes or double hyphens anywhere the reader can see", () => {
    for (const line of allCopy()) {
      expect(line).not.toContain("—");
      expect(line).not.toContain("--");
    }
  });
});
