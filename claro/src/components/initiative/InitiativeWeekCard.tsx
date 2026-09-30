import { useClaro } from "@/lib/claro-store";
import { weekDayIds } from "@/lib/dates";
import {
  answerReview,
  averageSleep,
  isReviewDay,
  promisesIn,
  reviewOn,
} from "@/lib/initiatives";
import { EditableText } from "@/components/EditableText";
import type { Initiative, WeekId } from "@/lib/types";

/** The three questions a week closes on. Ids are storage; the words are copy. */
export const WEEK_PROMPTS: { id: string; question: string }[] = [
  { id: "kept", question: "What did I keep?" },
  { id: "inTheWay", question: "What got in the way?" },
  { id: "adjust", question: "One thing to adjust next week?" },
];

/**
 * The initiative, beside the practices it is made of.
 *
 * It sits next to Practices this week rather than above or below it because
 * they answer the same question at two altitudes: that card says which days
 * each practice was kept, this one says what the week added up to and what it
 * was for.
 *
 * **The review appears on Sunday and not before.** Asking "what got in the
 * way" on a Tuesday invites somebody to write off the rest of the week. On any
 * other day the card is three readings and no questions.
 */
export function InitiativeWeekCard({
  initiative,
  weekId,
  todayId,
}: {
  initiative: Initiative;
  weekId: WeekId;
  todayId: string;
}) {
  const { state, updateInitiative } = useClaro();

  const days = weekDayIds(weekId);
  const { kept, due } = promisesIn(state, initiative, days);
  const sleep = averageSleep(state, days);

  /*
   * The review belongs to the last day of the week being looked at, not to
   * today, so opening last week on a Wednesday still shows what was written
   * on that Sunday rather than an empty form.
   */
  const reviewDay = days[6];
  const open = isReviewDay(todayId) || reviewOn(initiative, reviewDay, "week") !== null;
  const review = reviewOn(initiative, reviewDay, "week");

  return (
    <section className="surface-quiet p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="eyebrow">{initiative.name}</h2>
        <span className="text-[10px] text-muted-foreground">this week</span>
      </div>

      {initiative.identity ? (
        <p className="mt-2 display text-[1.1rem] leading-snug">{initiative.identity}</p>
      ) : (
        <p className="mt-2 text-[0.85rem] leading-relaxed text-muted-foreground">
          The identity statement is written on Quarter.
        </p>
      )}

      <dl className="mt-4 flex flex-wrap gap-x-7 gap-y-3">
        <div>
          <dt className="eyebrow text-[9px]">Promises kept</dt>
          <dd className="tnum mt-0.5 display text-[1.35rem] leading-none">
            {due === null ? kept : `${kept} of ${due}`}
          </dd>
        </div>
        <div>
          <dt className="eyebrow text-[9px]">Slept</dt>
          <dd className="tnum mt-0.5 display text-[1.35rem] leading-none">
            {sleep === null ? (
              <span className="text-[0.9rem] text-muted-foreground">Not rated yet</span>
            ) : (
              `${sleep} of 5`
            )}
          </dd>
        </div>
      </dl>

      {open && (
        <div className="mt-5 border-t border-border/70 pt-4">
          <h3 className="eyebrow">The week, in your words</h3>
          <div className="mt-2 space-y-3">
            {WEEK_PROMPTS.map((prompt) => (
              <div key={prompt.id}>
                <p className="text-[0.8rem] text-muted-foreground">{prompt.question}</p>
                <EditableText
                  value={review?.answers[prompt.id] ?? ""}
                  onCommit={(answer) =>
                    updateInitiative(initiative.id, (i) =>
                      answerReview(i, reviewDay, "week", prompt.id, answer),
                    )
                  }
                  multiline
                  rows={1}
                  ariaLabel={prompt.question}
                  placeholder="Your words"
                  className="-ml-2 mt-0.5 text-[0.9rem] leading-snug"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
