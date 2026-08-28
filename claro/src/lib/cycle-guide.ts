/**
 * "Understanding your menstrual cycle": educational content and its sources.
 *
 * Three rules shaped every word below.
 *
 * First, **nothing here is invented**. Every source is a real page from a
 * health service, a professional body or a government health institute, and its
 * title, organisation, date and link were read off the source itself. No
 * citation, credential, date or finding is written from memory.
 *
 * Second, **a phase is an estimate, not a state of mind**. Nothing here says a
 * phase makes someone capable, creative, confident, sociable, productive or
 * hungry, tells them how they will feel, or compares one body to another. The
 * hedging in the copy is not padding: "some people notice" is the strongest
 * claim a calendar can support.
 *
 * Third, **28 days is not the truth**. It is one number among many, and using
 * it as the default is how a person with a 33-day cycle is told they are wrong.
 * Every estimate Claro shows comes from the dates that person logged.
 */

import type { ISODate } from "./types";

/** When Claro last checked this page against the sources listed below. */
export const CLARO_REVIEW_DATE: ISODate = "2026-08-19";

export type GuideSource = {
  id: string;
  title: string;
  organisation: string;
  /** Named author, where the source has one. Institutional pages usually do not. */
  author: string | null;
  /** What makes the organisation a source on this. Factual, never inflated. */
  credentials: string | null;
  /** Exactly as the source states it. Null when the page states none. */
  published: string | null;
  url: string;
  /** What kind of evidence this is, so a reader can weigh it. */
  type: string;
  /** Claro's own review date for the summary written from this source. */
  reviewed: ISODate;
};

/**
 * Read from the pages themselves on {@link CLARO_REVIEW_DATE}.
 *
 * No source list was attached to the brief, so these are official
 * menstrual-health sources: the NHS, ACOG, the US Office on Women's Health and
 * the NICHD.
 */
export const GUIDE_SOURCES: GuideSource[] = [
  {
    id: "nhs-periods",
    title: "Periods",
    organisation: "NHS",
    author: null,
    credentials: "The national health service of the United Kingdom.",
    published: "Page last reviewed 5 January 2023",
    url: "https://www.nhs.uk/conditions/periods/",
    type: "National health service guidance for the public",
    reviewed: CLARO_REVIEW_DATE,
  },
  {
    id: "nhs-fertility",
    title: "Periods and fertility in the menstrual cycle",
    organisation: "NHS",
    author: null,
    credentials: "The national health service of the United Kingdom.",
    published: "Page last reviewed 5 January 2023",
    url: "https://www.nhs.uk/conditions/periods/fertility-in-the-menstrual-cycle/",
    type: "National health service guidance for the public",
    reviewed: CLARO_REVIEW_DATE,
  },
  {
    id: "nhs-irregular",
    title: "Irregular periods",
    organisation: "NHS",
    author: null,
    credentials: "The national health service of the United Kingdom.",
    published: "Page last reviewed 26 June 2026",
    url: "https://www.nhs.uk/conditions/irregular-periods/",
    type: "National health service guidance for the public",
    reviewed: CLARO_REVIEW_DATE,
  },
  {
    id: "acog-vital-sign",
    title:
      "Menstruation in Girls and Adolescents: Using the Menstrual Cycle as a Vital Sign (Committee Opinion No. 651)",
    organisation: "American College of Obstetricians and Gynecologists",
    author: "ACOG Committee on Adolescent Health Care",
    credentials:
      "The professional membership organisation for obstetricians and gynecologists in the United States.",
    published: "December 2015, reaffirmed 2025",
    url: "https://www.acog.org/clinical/clinical-guidance/committee-opinion/articles/2015/12/menstruation-in-girls-and-adolescents-using-the-menstrual-cycle-as-a-vital-sign",
    type: "Professional body clinical guidance",
    reviewed: CLARO_REVIEW_DATE,
  },
  {
    id: "acog-first-period",
    title: "Your First Period",
    organisation: "American College of Obstetricians and Gynecologists",
    author: null,
    credentials:
      "The professional membership organisation for obstetricians and gynecologists in the United States.",
    published: "Last updated June 2022",
    url: "https://www.acog.org/womens-health/faqs/your-first-period",
    type: "Professional body patient information",
    reviewed: CLARO_REVIEW_DATE,
  },
  {
    id: "owh-cycle",
    title: "Menstrual cycle",
    organisation: "Office on Women's Health, U.S. Department of Health and Human Services",
    author: null,
    credentials: "A federal government office within the US Department of Health and Human Services.",
    published: "Page last updated 22 February 2021",
    url: "https://www.womenshealth.gov/menstrual-cycle",
    type: "Government health information for the public",
    reviewed: CLARO_REVIEW_DATE,
  },
  {
    id: "nichd-menstruation",
    title: "Menstruation and Menstrual Problems",
    organisation:
      "Eunice Kennedy Shriver National Institute of Child Health and Human Development (NICHD)",
    author: null,
    credentials: "A research institute of the US National Institutes of Health.",
    published: "Last reviewed 31 January 2017",
    url: "https://www.nichd.nih.gov/health/topics/menstruation",
    type: "Government research institute health information",
    reviewed: CLARO_REVIEW_DATE,
  },
];

/**
 * The fields a source has to carry before it may appear on the page.
 *
 * `author` and `published` are allowed to be null, because a great many
 * institutional pages genuinely have neither. They are not allowed to be
 * missing: an explicit null records that Claro looked and the source stated
 * none, which is a different thing from nobody having checked.
 */
export function missingSourceFields(source: GuideSource): string[] {
  const missing: string[] = [];
  if (!source.title.trim()) missing.push("title");
  if (!source.organisation.trim()) missing.push("organisation");
  if (!source.url.startsWith("https://")) missing.push("url");
  if (!source.type.trim()) missing.push("type");
  if (!source.reviewed.trim()) missing.push("reviewed");
  if (source.author === undefined) missing.push("author");
  if (source.published === undefined) missing.push("published");
  if (source.credentials === undefined) missing.push("credentials");
  return missing;
}

export function sourceById(id: string): GuideSource | null {
  return GUIDE_SOURCES.find((source) => source.id === id) ?? null;
}

// ------------------------------------------------------------ phase cards

/** One row of the phase card: a short label and the sentence it introduces. */
export type PhaseFact = { label: string; text: string };

export type PhaseCard = {
  id: string;
  title: string;
  /**
   * Additive, and not new claims.
   *
   * `lead` and `facts` are the same three things `body` already said, cut to
   * the length the card can show without being scrolled. The design reads a
   * phase as one statement and three labelled rows; the paragraphs are still
   * here, unchanged, behind "go deeper", so nothing is lost by compressing the
   * front of the card and nothing is asserted that was not asserted before.
   */
  lead: string;
  facts: [PhaseFact, PhaseFact, PhaseFact];
  /** Sits under the phase name in the ring. Says the span, and hedges it. */
  span: string;
  /**
   * The name alone, for the chips and the ring.
   *
   * "Follicular phase" is right in a sentence and wrong on a chip beside three
   * others, where the repeated word is the only thing the eye has to skip past
   * to reach the one that differs.
   */
  short: string;
  /** One or more short paragraphs, in Claro's own words. */
  body: string[];
  /** Says plainly what a calendar can and cannot know. Required on every card. */
  estimateNote: string;
  /** An invitation to record something, never a prediction of it. */
  invitation: string;
  sourceIds: string[];
};

export const PHASE_CARDS: PhaseCard[] = [
  {
    id: "menstruation",
    title: "Menstruation",
    lead: "Day 1 is the first day of proper bleeding, not the spotting before it. That is where counting starts.",
    span: "Days 1 to 5, roughly",
    short: "Menstruation",
    facts: [
      {
        label: "Overlap",
        text: "It sits inside the wider follicular phase, so the two run together rather than one after the other.",
      },
      {
        label: "Length",
        text: "How long bleeding lasts differs between people, and between your own cycles.",
      },
      { label: "Claro", text: "Records the days you logged. Measures nothing." },
    ],
    body: [
      "Day 1 of a cycle is the first day of proper bleeding, not spotting before it. That is the day cycle counting starts from, which is why Claro asks for a start date rather than working one out.",
      "Menstruation happens at the beginning of the wider follicular phase, so the two overlap rather than following one another.",
      "How long bleeding lasts differs from person to person, and can differ between one cycle and the next for the same person.",
    ],
    estimateNote:
      "Claro knows only the dates you have entered. It records the days you logged and does not measure anything.",
    invitation:
      "If you want to, record how these days went for you. Your own notes are the most relevant context you have.",
    sourceIds: ["nhs-periods", "acog-first-period", "owh-cycle"],
  },
  {
    id: "follicular",
    title: "Follicular phase",
    lead: "From the first day of a period until an egg is released. Follicles develop, and usually one goes on to release an egg.",
    span: "Day 1 until an egg is released",
    short: "Follicular",
    facts: [
      {
        label: "Varies",
        text: "The most variable stretch of the cycle. Most of the difference in overall length comes from here.",
      },
      {
        label: "Meaning",
        text: "A longer or shorter phase is not something a calendar can interpret for you.",
      },
      {
        label: "You",
        text: "Some people notice changes across these days. Some notice none. Both are ordinary.",
      },
    ],
    body: [
      "The follicular phase runs from the first day of a period until an egg is released. During it, follicles in the ovaries develop, and usually one of them goes on to release an egg.",
      "This phase is the part of the cycle that varies most in length, both between people and between cycles. Much of the difference in overall cycle length comes from here.",
      "Because of that variation, a longer or shorter phase is not something a calendar can interpret for you.",
    ],
    estimateNote:
      "Any phase Claro shows is worked out from the gaps between the dates you logged. It is an estimate from a calendar, not a measurement of hormones.",
    invitation:
      "Some people notice changes across this part of their cycle and some notice none. Your experience may differ from anyone else's, and from your own last cycle.",
    sourceIds: ["owh-cycle", "nichd-menstruation", "nhs-fertility"],
  },
  {
    id: "ovulation",
    title: "Ovulation",
    lead: "An egg is released from an ovary. It is the point that separates the follicular phase from the luteal one.",
    span: "Once per cycle, day not fixed",
    short: "Ovulation",
    facts: [
      {
        label: "Timing",
        text: "The day is not fixed. It moves between cycles, including for otherwise regular ones.",
      },
      {
        label: "Proof",
        text: "Dates alone cannot confirm ovulation happened, or when. That needs clinical assessment.",
      },
      {
        label: "Claro",
        text: "Shows no fertile window and no chance of pregnancy. A calendar cannot support either.",
      },
    ],
    body: [
      "Ovulation is the release of an egg from an ovary. It happens once in most cycles, and it is the point that separates the follicular phase from the luteal phase.",
      "The day it happens is not fixed. It can move between cycles for the same person, including for someone whose cycles are otherwise regular.",
      "Dates alone cannot confirm that ovulation happened, or when. Confirming it needs clinical assessment, which is outside what Claro does.",
    ],
    estimateNote:
      "Claro does not show a fertile window, a chance of pregnancy, or an ovulation prediction, because a calendar cannot support any of them.",
    invitation:
      "If you are trying to understand your fertility, or avoid pregnancy, please talk to a doctor, nurse or pharmacist rather than relying on an app estimate.",
    sourceIds: ["nhs-fertility", "owh-cycle", "acog-vital-sign"],
  },
  {
    id: "luteal",
    title: "Luteal phase",
    lead: "From ovulation until the next period begins. If pregnancy does not occur, the next cycle starts.",
    span: "Ovulation until the next period",
    short: "Luteal",
    facts: [
      {
        label: "Length",
        text: "Usually the steadier of the two halves, though this varies between people as well.",
      },
      {
        label: "You",
        text: "Some people notice changes in mood, energy or sleep. Others notice little. Both are ordinary.",
      },
      {
        label: "Claro",
        text: "Places this phase from your logged dates alone. It cannot see inside your body.",
      },
    ],
    body: [
      "The luteal phase runs from ovulation until the next period begins. The structure left behind after the egg is released produces hormones that thicken the lining of the womb.",
      "If pregnancy does not occur, those hormone levels fall and the lining is shed, which is the next period and the start of the next cycle.",
      "Some people notice changes in mood, energy, sleep or physical symptoms during this phase. Others notice little or nothing. Both are ordinary, and neither tells you anything about anyone else.",
    ],
    estimateNote:
      "Claro places this phase from your logged dates alone. It cannot tell you what is happening in your body on any given day.",
    invitation:
      "Mood, energy, stress and symptoms are all things you can record privately in Claro if you find it useful. Nothing is assumed about them, and nothing is read into what you write.",
    sourceIds: ["owh-cycle", "nichd-menstruation", "nhs-periods"],
  },
];

export function sourcesFor(card: PhaseCard): GuideSource[] {
  return card.sourceIds.map(sourceById).filter((source): source is GuideSource => source !== null);
}

// --------------------------------------------------------------- guidance

/**
 * User-led prompts, and deliberately nothing more.
 *
 * Every one of these is a question. None of them recommends a food, a
 * supplement, a workout, a treatment or a kind of work, and none is triggered
 * by an estimated phase. The user answers them or ignores them.
 */
export type GuidePrompt = {
  /**
   * The storage key for whatever the reader writes, and the reason this list
   * is objects rather than strings. Deriving a key from the question text
   * would orphan an answer the first time a word in the question changed.
   */
  id: string;
  question: string;
};

export const GUIDE_PROMPTS: GuidePrompt[] = [
  { id: "energy", question: "How is your energy today?" },
  { id: "movement", question: "What movement would feel good, if any?" },
  { id: "food", question: "What food would help you feel nourished today?" },
  { id: "plan", question: "Would you like to reduce, keep, or expand your plan?" },
  { id: "last-time", question: "What did you notice last time around?" },
];

/**
 * The questions alone, for the four screens that only ever show them.
 *
 * Derived rather than duplicated, so the guide and everywhere else can never
 * drift into asking two different sets of questions.
 */
export const SUPPORTIVE_PROMPTS: string[] = GUIDE_PROMPTS.map((p) => p.question);

/**
 * The three misreadings this page exists to correct.
 *
 * Each is a sentence somebody has actually been told, paired with what is
 * true instead. They are corrections of claims, never of a person: no card
 * says the reader was wrong, and none of them grades a cycle. The 28 day one
 * matters most, because it is the number every other app defaults to and the
 * one Claro deliberately does not.
 */
export type Myth = { myth: string; truth: string };

export const MYTHS: Myth[] = [
  {
    myth: "28 days is the normal cycle.",
    truth:
      "An average, not a standard. A great many ordinary cycles sit either side of it, and Claro does not treat 28 as the default.",
  },
  {
    myth: "Cycle length is how long my period lasts.",
    truth:
      "It is the first day of one period to the first day of the next. Bleeding days are a separate count.",
  },
  {
    myth: "An app can tell me when I ovulated.",
    truth:
      "It cannot. Dates alone cannot confirm that ovulation happened, or when, which is why Claro does not claim to.",
  },
];

/** Sits under the phase explorer, where the estimate is easiest to forget. */
export const ESTIMATE_BAND =
  "Phases in Claro are worked out from the dates you entered. A calendar estimate, not a measurement.";

/** Introduces the prompts, and says plainly why Claro does not answer them. */
export const PROMPTS_INTRO =
  "Claro does not tell you what to eat, how to train, or what work suits a phase. It has no basis for that. These are yours to answer.";

export const GUIDE_NOTICE =
  "This guide is for general education and personal reflection. It does not replace medical advice.";

/**
 * Offered once, plainly, without asking what is wrong.
 *
 * It does not diagnose, triage, reassure, or suggest that anything is or is not
 * worth seeing someone about. That judgement belongs to the person reading it.
 */
export const SUPPORT_NOTE =
  "If something about your cycle is worrying you, or is getting in the way of your life, a doctor, nurse or pharmacist can talk it through with you.";

/** Shown wherever a duration or a gap is read back to the user. */
export const NO_JUDGEMENT_NOTE =
  "Claro records what you enter and reads it back to you. It does not say whether a period or a cycle is short, long, heavy or light.";
