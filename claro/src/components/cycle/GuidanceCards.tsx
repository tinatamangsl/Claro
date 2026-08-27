import {
  CARD_META,
  DRIFTED_INVITATION,
  DRIFTED_NOTE,
  GUIDANCE_FRAMING,
  GUIDANCE_NOTICE,
  SUGGESTION_CARDS,
  type SuggestionCard,
  answerToday,
  hasDrifted,
  suggestionsFor,
} from "@/lib/cycle-guidance";
import { ENERGY_BAND_LABELS, bandOf, type EnergyBand } from "@/lib/cycle-log";
import { PHASE_META, type CyclePhase } from "@/lib/cycle-phases";
import { checkInOn } from "@/lib/cycle";
import { positionOn } from "@/lib/cycle-timeline";
import type { CycleState, ISODate, MatchAnswer } from "@/lib/types";
import { MatchPrompt } from "./MatchPrompt";

/**
 * Eat, Move and Do today.
 *
 * The reference apps put a plan here: eat these foods, do this workout, tackle
 * the hardest problem. Claro puts three things **some people find helpful**,
 * and says so in the heading of every card, because that is the strongest
 * claim four typed dates can support. Nothing here is addressed to the reader
 * in the imperative and nothing explains itself through a hormone.
 *
 * The lists move with the energy the reader logged today, and fall back to the
 * phase's default when they have not logged one. The card says which of the
 * two it used, so a default is never mistaken for a reading of them.
 *
 * Each card asks whether it landed, and a card that keeps missing stops
 * suggesting and starts asking. That is the part that matters: the reader's
 * experience is allowed to overrule the guidance, and the interface has a way
 * for them to say so.
 */
export function GuidanceCards({
  cycle,
  todayId,
  onAnswer,
}: {
  cycle: CycleState;
  todayId: ISODate;
  onAnswer: (card: SuggestionCard, phase: string, answer: MatchAnswer) => void;
}) {
  const position = positionOn(cycle, todayId);
  if (!position) return null;

  const logged = bandOf(checkInOn(cycle, todayId).energy);

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="eyebrow">{GUIDANCE_FRAMING}</h2>
      </div>

      <div className="mt-3 space-y-2.5">
        {SUGGESTION_CARDS.map((card) => (
          <Card
            key={card}
            card={card}
            cycle={cycle}
            todayId={todayId}
            phase={position.phase}
            logged={logged}
            onAnswer={(answer) => onAnswer(card, position.phase, answer)}
          />
        ))}
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground">{GUIDANCE_NOTICE}</p>
    </section>
  );
}

function Card({
  card,
  cycle,
  todayId,
  phase,
  logged,
  onAnswer,
}: {
  card: SuggestionCard;
  cycle: CycleState;
  todayId: ISODate;
  phase: CyclePhase;
  logged: EnergyBand | null;
  onAnswer: (answer: MatchAnswer) => void;
}) {
  const meta = CARD_META[card];
  const drifted = hasDrifted(cycle.guidanceMatches, card, phase);
  const answer = answerToday(cycle.guidanceMatches, card, todayId);
  const { lines, energy, fromDefault } = suggestionsFor(card, phase, logged);
  /*
   * Which phase and which energy these three came from, said on the card.
   * "Assuming" rather than a bare label when nothing was logged, so a default
   * is never read back as something the person told Claro.
   */
  const context = `${PHASE_META[phase].label}, ${fromDefault ? "assuming " : ""}${ENERGY_BAND_LABELS[
    energy
  ].toLowerCase()} energy`;

  return (
    <article className="guidance-card">
      {/*
        The context sits under the label rather than opposite it. Top right at
        10px muted it was present and unread, which is the same as absent for
        the one line saying which energy these three were drawn from.
      */}
      <div>
        <h3 className="eyebrow">{meta.label}</h3>
        <span className="guidance-context">
          {drifted ? "asking, not suggesting" : context}
        </span>
      </div>

      {drifted ? (
        <>
          <p className="mt-2 text-[0.85rem] leading-relaxed text-muted-foreground">
            {DRIFTED_NOTE}
          </p>
          <p className="mt-1.5 text-[0.85rem] leading-relaxed">{DRIFTED_INVITATION}</p>
        </>
      ) : (
        <ul className="guidance-list mt-2.5">
          {lines.map((line) => (
            <li key={line} className="flex gap-2.5 text-[0.875rem] leading-relaxed">
              <span aria-hidden className="guidance-bullet" />
              <span className="min-w-0 flex-1">{line}</span>
            </li>
          ))}
        </ul>
      )}

      <MatchPrompt
        cardLabel={`the ${meta.label.toLowerCase()} card`}
        answer={answer}
        onAnswer={onAnswer}
      />
    </article>
  );
}
