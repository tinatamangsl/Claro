/**
 * What other people sometimes find helpful in a part of the cycle, and the
 * standing offer to disagree with all of it.
 *
 * This module exists because the reference apps fill this slot with per-phase
 * instructions: eat protein-rich meals, do HIIT today, your brain is working
 * harder than usual. Claro will not, and the reason is narrow and specific: it
 * knows four dates somebody typed. It does not know their body, their week,
 * their illness, their job, or whether the phase it has estimated is the phase
 * they are actually in.
 *
 * So three things are true of everything below, and a test enforces each.
 *
 * **Nothing is prescribed.** The register is "some people find this helpful",
 * "worth trying", "you might notice". Never "eat this", "avoid that", "you
 * should". The framing is not packaging around the content; at this distance
 * from a person it *is* the content, because the same sentence is honest or
 * dishonest depending only on whether it claims to know the reader.
 *
 * **Nothing asserts what a phase makes someone.** Each card opens with an open
 * question rather than a claim, and what follows the question is the reader's
 * own logged notes from this point in earlier cycles, if they have any.
 *
 * **The reader outranks the guidance.** Every card asks whether it matched, and
 * a card that keeps missing stops offering suggestions and starts asking what
 * the reader is noticing instead. That is `hasDrifted`, and it is the whole
 * reason the answers are stored at all.
 */

import type { EnergyBand } from "./cycle-log";
import type { CyclePhase } from "./cycle-phases";
import type { GuidanceCard, GuidanceMatch, MatchAnswer } from "./types";

/** The card that carries a suggestion list, as opposed to the phase card. */
export type SuggestionCard = Extract<GuidanceCard, "eat" | "move" | "do">;

export const SUGGESTION_CARDS: SuggestionCard[] = ["eat", "move", "do"];

export const CARD_META: Record<SuggestionCard, { label: string }> = {
  eat: { label: "Eat" },
  move: { label: "Move" },
  do: { label: "Do today" },
};

/**
 * The framing, said once over the three cards rather than on each of them.
 *
 * Repeating it per card put the same seven words on screen three times in one
 * glance, which is the failure this file's own page already learned once: a
 * promise said five times reads as boilerplate and stops being read at all.
 * The cards carry the phase and energy they were drawn from instead.
 */
export const GUIDANCE_FRAMING = "Some people find these helpful";

/**
 * The line under the whole guidance section.
 *
 * It says the two things that make the rest of it safe: this is general, and
 * the reader's own experience is the better source.
 */
export const GUIDANCE_NOTICE = "General information only. Trust what you actually notice.";

/** Asked at the foot of every card, so disagreeing is always one tap away. */
export const MATCH_PROMPT = "Does this match what you are feeling today?";

/**
 * The opening line of the phase card.
 *
 * A question, not a reading. "Your brain is working harder than usual" is a
 * claim about a person Claro has never met; "what does your energy feel like
 * today?" is an invitation to notice, and the answer belongs to the reader.
 */
export const PHASE_QUESTIONS: Record<CyclePhase, string> = {
  menstrual: "How does your energy feel today?",
  follicular: "What feels possible today?",
  ovulation: "What would be good to say out loud today?",
  luteal: "What would you like to finish today?",
};

/**
 * What the card asks once the suggestions have stopped landing.
 *
 * Not an apology and not a smaller version of the same claim: a different
 * question, which is the only honest response to somebody who has said several
 * times that the general picture is not theirs.
 */
export const DRIFTED_QUESTIONS: Record<CyclePhase, string> = {
  menstrual: "What are you noticing today?",
  follicular: "What are you noticing today?",
  ovulation: "What are you noticing today?",
  luteal: "What are you noticing today?",
};

export const DRIFTED_NOTE =
  "You have said a few times that this does not fit. Your own notes are the better guide here.";

/** Shown in place of suggestions once a card has drifted. */
export const DRIFTED_INVITATION =
  "Rather than suggest, Claro will ask. What is actually true for you today?";

/**
 * Where a phase's energy sits when the reader has not said.
 *
 * A default, never a prediction. It picks which of three lists to show and is
 * replaced the moment somebody logs an energy, which is the point.
 */
export const PHASE_DEFAULT_ENERGY: Record<CyclePhase, EnergyBand> = {
  menstrual: "low",
  follicular: "medium",
  ovulation: "high",
  luteal: "low",
};

type ByEnergy = Record<EnergyBand, string[]>;

/**
 * The suggestions themselves.
 *
 * Read them as items under "some people find these helpful in this phase",
 * which is how they are always rendered. Note what is *not* here: no claim
 * that a food does something to a hormone, no claim that a phase causes a
 * symptom, and no sentence addressed to the reader in the imperative.
 */
const EAT: Record<CyclePhase, ByEnergy> = {
  menstrual: {
    low: ["Iron rich foods like lentils, spinach and red meat", "Warm soups and broths", "Dark chocolate, nuts and seeds"],
    medium: ["Eggs, fish and legumes", "Turmeric and ginger in cooking", "Cooked vegetables rather than raw"],
    high: ["Lighter iron rich meals", "Water within easy reach", "Regular meals, even when appetite is small"],
  },
  follicular: {
    low: ["Oats, sweet potato and other slow carbohydrates", "Leafy greens", "Fermented foods like kimchi and yoghurt"],
    medium: ["Protein alongside slow carbohydrates", "Fermented foods", "Fresh fruit and vegetables"],
    high: ["Protein at each meal", "Broccoli, berries and other colourful vegetables", "Pumpkin seeds and chickpeas"],
  },
  ovulation: {
    low: ["Lighter fresh meals, salads and smoothies", "Raw fruit and vegetables", "Water within easy reach"],
    medium: ["Fibre rich foods", "Oily fish, walnuts and flaxseed", "Cruciferous vegetables"],
    high: ["Cruciferous vegetables", "Berries and leafy greens", "Protein that keeps you going"],
  },
  luteal: {
    low: ["Dark chocolate, almonds and avocado", "Slow carbohydrates when cravings arrive", "Less caffeine, if that suits you"],
    medium: ["Bananas, salmon and chickpeas", "Lighter hand with salt", "Warm, grounding meals"],
    high: ["Brazil nuts, seeds and eggs", "Colourful vegetables", "Less alcohol, even on a good day"],
  },
};

const MOVE: Record<CyclePhase, ByEnergy> = {
  menstrual: {
    low: ["Gentle yoga, especially hips and lower back", "A ten minute walk", "Complete rest, if that is what you want"],
    medium: ["Light pilates or stretching", "Slow swimming", "Restorative yoga"],
    high: ["The gentler options are still here if you want them", "Energy on a bleeding day is real, and so is being tired later"],
  },
  follicular: {
    low: ["Walking", "Light yoga or stretching", "Something short rather than nothing"],
    medium: ["Running or cycling at a steady effort", "Strength training", "A class with other people"],
    high: ["Intervals or higher intensity work", "Something new, if you fancy it", "A harder session than usual"],
  },
  ovulation: {
    low: ["Almost anything gentle tends to beat sitting still", "A walk or a stretch"],
    medium: ["Classes and team sport", "Dancing, swimming, cycling", "Something social"],
    high: ["A hard training session", "Higher volume than usual", "A personal best attempt, if you want one"],
  },
  luteal: {
    low: ["Yin or restorative yoga", "Gentle stretching", "A walk outdoors"],
    medium: ["Moderate strength work", "Barre or pilates", "Swimming"],
    high: ["Strength rather than long cardio", "An effort you could repeat tomorrow", "Stopping while it still feels good"],
  },
};

const DO: Record<CyclePhase, ByEnergy> = {
  menstrual: {
    low: ["One thing, if one thing is what today holds", "Decisions that can wait, waiting", "Rest counted as the work"],
    medium: ["Admin and low stakes decisions", "Reviewing and planning", "A short list rather than a long one"],
    high: ["A shorter list than the energy suggests", "Keeping something in reserve"],
  },
  follicular: {
    low: ["One small first step on something new", "Reading and research", "Leaving the bigger push for later in the week"],
    medium: ["Making, planning and learning", "Strategy and ideas", "The project you have been circling"],
    high: ["The hardest problem on the list", "New work, creative work, bold calls", "Whatever needs your sharpest hour"],
  },
  ovulation: {
    low: ["Conversations, which often survive a flat day", "The people you have been meaning to reach", "Short focused bursts"],
    medium: ["Meetings, collaboration and pitching", "Visible work", "Leading a conversation"],
    high: ["Deciding and presenting", "Your most important conversation", "The high stakes thing"],
  },
  luteal: {
    low: ["Finishing rather than starting", "Detail and editing work", "One meaningful thing, and protecting the rest"],
    medium: ["Closing open loops", "Work that rewards a sharp eye", "Fewer meetings, if you can"],
    high: ["Finishing, even on a good day", "Energy spent on completion", "Mornings kept for focused work"],
  },
};

const SUGGESTIONS: Record<SuggestionCard, Record<CyclePhase, ByEnergy>> = {
  eat: EAT,
  move: MOVE,
  do: DO,
};

/**
 * The three lines a card shows.
 *
 * `energy` is what the reader logged today, or null when they have not: the
 * phase default fills in, and the card says which of the two it used, so a
 * default is never mistaken for a reading.
 */
export function suggestionsFor(
  card: SuggestionCard,
  phase: CyclePhase,
  energy: EnergyBand | null,
): { lines: string[]; energy: EnergyBand; fromDefault: boolean } {
  const band = energy ?? PHASE_DEFAULT_ENERGY[phase];
  return {
    lines: SUGGESTIONS[card][phase][band],
    energy: band,
    fromDefault: energy === null,
  };
}

// ------------------------------------------------------- has this stopped fitting

/** How many recent answers about one card are weighed. */
export const DRIFT_WINDOW = 3;

/** How many of them have to miss before the card stops offering suggestions. */
export const DRIFT_THRESHOLD = 2;

export const matchKey = (card: GuidanceCard, dayId: string): string => `${card}:${dayId}`;

/** "Not really" and "opposite" are both misses; only "yes" is a fit. */
export const isMiss = (answer: MatchAnswer): boolean => answer !== "yes";

/**
 * The answers about one card in one phase, newest first.
 *
 * Scoped to the phase as well as the card, because "the luteal Do card does not
 * fit me" is a different statement from "the Do card does not fit me", and only
 * the first is supported by somebody answering it in the luteal phase.
 */
export function answersFor(
  matches: Record<string, GuidanceMatch>,
  card: GuidanceCard,
  phase: CyclePhase,
): GuidanceMatch[] {
  return Object.values(matches)
    .filter((m) => m.card === card && m.phase === phase)
    .sort((a, b) => b.dayId.localeCompare(a.dayId));
}

/**
 * Has this card stopped fitting this person?
 *
 * Two misses inside the last three answers. Deliberately not one: a single bad
 * day is a bad day, and a card that flinched at the first disagreement would
 * never settle. Deliberately not a running total either, or a card could never
 * come back once it had been wrong early on.
 */
export function hasDrifted(
  matches: Record<string, GuidanceMatch>,
  card: GuidanceCard,
  phase: CyclePhase,
): boolean {
  const recent = answersFor(matches, card, phase).slice(0, DRIFT_WINDOW);
  return recent.filter((m) => isMiss(m.answer)).length >= DRIFT_THRESHOLD;
}

/** What the reader said about this card today, if anything. */
export function answerToday(
  matches: Record<string, GuidanceMatch>,
  card: GuidanceCard,
  dayId: string,
): MatchAnswer | null {
  return matches[matchKey(card, dayId)]?.answer ?? null;
}

/** Every string a reader can see from this module, for the copy rules to check. */
export function allGuidanceCopy(): string[] {
  const lines: string[] = [
    GUIDANCE_NOTICE,
    MATCH_PROMPT,
    DRIFTED_NOTE,
    DRIFTED_INVITATION,
    ...Object.values(PHASE_QUESTIONS),
    ...Object.values(DRIFTED_QUESTIONS),
    GUIDANCE_FRAMING,
    ...Object.values(CARD_META).map((m) => m.label),
  ];

  for (const card of SUGGESTION_CARDS) {
    for (const phase of Object.keys(SUGGESTIONS[card]) as CyclePhase[]) {
      for (const band of Object.keys(SUGGESTIONS[card][phase]) as EnergyBand[]) {
        lines.push(...SUGGESTIONS[card][phase][band]);
      }
    }
  }
  return lines;
}
