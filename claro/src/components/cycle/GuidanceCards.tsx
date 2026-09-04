import { ChevronRight } from "lucide-react";
import { useState } from "react";

import {
  CARD_META,
  DRIFTED_INVITATION,
  DRIFTED_NOTE,
  GUIDANCE_CARD_ORDER,
  GUIDANCE_FRAMING,
  GUIDANCE_NOTICE,
  JOURNAL_PRIVACY,
  JOURNAL_PROMPTS,
  type GuidanceCardName,
  type SuggestionCard,
  answerToday,
  hasDrifted,
  suggestionsFor,
} from "@/lib/cycle-guidance";
import { ENERGY_BAND_LABELS, bandOf, type EnergyBand } from "@/lib/cycle-log";
import { PHASE_META, type CyclePhase } from "@/lib/cycle-phases";
import { checkInOn } from "@/lib/cycle";
import { positionOn } from "@/lib/cycle-timeline";
import { useDebouncedField } from "@/hooks/use-debounced-field";
import type { CycleState, ISODate, MatchAnswer } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MatchPrompt } from "./MatchPrompt";

/**
 * Work Focus, Movement, Journal Prompt and Food, one row each.
 *
 * The reference apps put a plan here: eat these foods, do this workout, tackle
 * the hardest problem. Claro puts a few things **some people find helpful**,
 * and says so once above the set, because that is the strongest claim four
 * typed dates can support. Nothing is addressed to the reader in the
 * imperative and nothing explains itself through a hormone.
 *
 * **They are collapsed, and that is the hierarchy fix.** Open, the three cards
 * that used to live here were 848px of a 3,311px page: the guidance was the
 * heaviest thing on screen while being the least urgent, which pushed the log
 * and the calendar below it. Closed, the same four are a scannable list of
 * what is on offer, and the reader opens the one they came for. The first is
 * left open so the section still shows what a card contains.
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
  onJournal,
}: {
  cycle: CycleState;
  todayId: ISODate;
  onAnswer: (card: SuggestionCard, phase: string, answer: MatchAnswer) => void;
  onJournal: (text: string) => void;
}) {
  /*
   * Which rows are open, by card key. Seeded with the first rather than
   * empty: four closed rows and nothing else reads as a page that failed to
   * load, and the point of collapsing was to rank the guidance, not hide it.
   */
  /*
   * All four open. This has been round twice: they were collapsed to stop the
   * page reading as a dump, then the user pointed out that a row of shut cards
   * is not "what to eat, move and do", it is four labels and a chevron. The
   * two-column layout is what makes both possible now, because the suggestions
   * sit beside the calendar rather than pushing it down the page.
   *
   * Still individually collapsible: the state is per card, so one closed
   * because it is not useful today stays closed.
   */
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(GUIDANCE_CARD_ORDER.map((card) => [card, true])),
  );

  const position = positionOn(cycle, todayId);
  if (!position) return null;

  const logged = bandOf(checkInOn(cycle, todayId).energy);

  return (
    <section>
      <h2 className="eyebrow">{GUIDANCE_FRAMING}</h2>

      <div className="mt-3 space-y-2">
        {GUIDANCE_CARD_ORDER.map((card) => (
          <Card
            key={card}
            card={card}
            cycle={cycle}
            todayId={todayId}
            phase={position.phase}
            logged={logged}
            open={open[card] === true}
            onToggle={() => setOpen((prev) => ({ ...prev, [card]: prev[card] !== true }))}
            onAnswer={(answer) =>
              card !== "journal" && onAnswer(card, position.phase, answer)
            }
            onJournal={onJournal}
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
  open,
  onToggle,
  onAnswer,
  onJournal,
}: {
  card: GuidanceCardName;
  cycle: CycleState;
  todayId: ISODate;
  phase: CyclePhase;
  logged: EnergyBand | null;
  open: boolean;
  onToggle: () => void;
  onAnswer: (answer: MatchAnswer) => void;
  onJournal: (text: string) => void;
}) {
  const meta = CARD_META[card];
  const journal = card === "journal";
  const drifted = !journal && hasDrifted(cycle.guidanceMatches, card, phase);
  const answer = answerToday(cycle.guidanceMatches, card, todayId);

  /*
   * The journal card has no suggestion matrix behind it, so it carries the
   * phase alone. The other three name the energy their lines were drawn from,
   * with "assuming" when nothing was logged, so a default is never read back
   * as something the person told Claro.
   */
  let context = PHASE_META[phase].label;
  let lines: string[] = [];
  if (!journal) {
    const picked = suggestionsFor(card, phase, logged);
    lines = picked.lines;
    context = `${PHASE_META[phase].label}, ${picked.fromDefault ? "assuming " : ""}${ENERGY_BAND_LABELS[
      picked.energy
    ].toLowerCase()} energy`;
  }

  const bodyId = `guidance-${card}`;

  return (
    <article className="guidance-card">
      {/*
        A real button rather than a <details>, because the caret, the label and
        the context all have to sit on one row and a summary marker cannot be
        placed. aria-expanded and aria-controls carry what the disclosure
        triangle would have said.
      */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center gap-3 text-left"
      >
        <ChevronRight
          aria-hidden
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-90",
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="eyebrow block">{meta.label}</span>
          <span className="guidance-context">
            {drifted ? "asking, not suggesting" : context}
          </span>
        </span>
      </button>

      {open && (
        <div id={bodyId} className="mt-3">
          {journal ? (
            <Journal
              cycle={cycle}
              todayId={todayId}
              phase={phase}
              onJournal={onJournal}
            />
          ) : drifted ? (
            <>
              <p className="text-[0.85rem] leading-relaxed text-muted-foreground">
                {DRIFTED_NOTE}
              </p>
              <p className="mt-1.5 text-[0.85rem] leading-relaxed">{DRIFTED_INVITATION}</p>
            </>
          ) : (
            <ul className="guidance-list">
              {lines.map((line) => (
                <li key={line} className="flex gap-2.5 text-[0.875rem] leading-relaxed">
                  <span aria-hidden className="guidance-bullet" />
                  <span className="min-w-0 flex-1">{line}</span>
                </li>
              ))}
            </ul>
          )}

          {!journal && (
            <MatchPrompt
              cardLabel={`the ${meta.label.toLowerCase()} card`}
              answer={answer}
              onAnswer={onAnswer}
            />
          )}
        </div>
      )}
    </article>
  );
}

/**
 * The journal prompt, and somewhere to answer it.
 *
 * No save button. The design drew one, and everywhere else in Claro a save
 * button is the thing this project has already refused: it implies the words
 * could be lost. This commits on the established debounce and on blur, like
 * every other writing field in the app, and says the only thing worth saying
 * underneath, which is who can read it.
 *
 * There is no `MatchPrompt` here either. "Does this match what you are feeling
 * today?" is a question about a suggestion, and this card makes none.
 */
function Journal({
  cycle,
  todayId,
  phase,
  onJournal,
}: {
  cycle: CycleState;
  todayId: ISODate;
  phase: CyclePhase;
  onJournal: (text: string) => void;
}) {
  const note = checkInOn(cycle, todayId);
  const field = useDebouncedField(note.journal, onJournal);

  return (
    <div>
      <p className="display text-[1.05rem] italic leading-relaxed">
        {JOURNAL_PROMPTS[phase]}
      </p>
      <textarea
        rows={4}
        value={field.value}
        onChange={(e) => field.onChange(e.target.value)}
        onBlur={field.onBlur}
        placeholder="Start wherever you like..."
        aria-label="Your answer to today's journal prompt"
        /*
          Ruled, like Today's notes and the focus card. A transparent field on
          a card is invisible until it is clicked, and four blank rows read as
          dead space rather than as somewhere to write. The lines are the
          project's own answer to that, and this is what they are for: a roomy
          writing surface, not a form grid.
        */
        className="field-plain ruled ruled-text mt-3 w-full resize-y"
      />
      <p className="mt-1.5 text-[10px] text-muted-foreground">{JOURNAL_PRIVACY}</p>
    </div>
  );
}
