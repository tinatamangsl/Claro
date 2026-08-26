import { cn } from "@/lib/utils";
import { MATCH_ANSWERS, MATCH_ANSWER_LABELS, type MatchAnswer } from "@/lib/types";
import { MATCH_PROMPT } from "@/lib/cycle-guidance";

/**
 * "Does this match what you are feeling today?"
 *
 * At the foot of every card that offers a suggestion, so disagreeing with
 * Claro is always exactly as easy as accepting it. That symmetry is the point:
 * a card that can only be read, never answered, is asserting rather than
 * offering, whatever its wording says.
 *
 * The answer changes the wording of this one card and nothing else. It is not
 * a rating, it is not summed, and no other surface reads it.
 */
export function MatchPrompt({
  cardLabel,
  answer,
  onAnswer,
  className,
}: {
  /** Names which card is being answered, so three prompts on one page differ. */
  cardLabel: string;
  answer: MatchAnswer | null;
  onAnswer: (answer: MatchAnswer) => void;
  className?: string;
}) {
  return (
    <div className={cn("mt-3 border-t border-border/60 pt-2.5", className)}>
      <p className="text-[10px] text-muted-foreground">{MATCH_PROMPT}</p>

      <div
        role="group"
        aria-label={`${MATCH_PROMPT} ${cardLabel}`}
        className="mt-1.5 flex flex-wrap gap-1.5"
      >
        {MATCH_ANSWERS.map((option) => {
          const chosen = answer === option;
          return (
            <button
              key={option}
              type="button"
              // Pressed rather than checked: it is a standing answer that can be
              // changed, not a form being submitted.
              aria-pressed={chosen}
              aria-label={`${MATCH_ANSWER_LABELS[option]}, about ${cardLabel}`}
              onClick={() => onAnswer(option)}
              className={cn(
                "btn btn-sm rounded-full px-3 py-1 text-[11px] transition-colors",
                chosen ? "btn-primary" : "btn-quiet",
              )}
            >
              {MATCH_ANSWER_LABELS[option]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
