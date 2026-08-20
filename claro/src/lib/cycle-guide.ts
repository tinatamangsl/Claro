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

export type PhaseCard = {
  id: string;
  title: string;
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
export const SUPPORTIVE_PROMPTS: string[] = [
  "How is your energy today?",
  "What movement would feel good, if any?",
  "What food would help you feel nourished today?",
  "Would you like to reduce, keep, or expand your plan?",
  "What did you notice last time around?",
];

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
