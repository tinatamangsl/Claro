import { useState } from "react";

import { EditableText } from "@/components/EditableText";
import { HabitIntentEditor } from "@/components/today/HabitIntentEditor";
import { useClaro } from "@/lib/claro-store";
import { formatDayShort } from "@/lib/dates";
import { countCompletions } from "@/lib/habits";
import { answerReview, averageSleep, daysOf, promisesIn, reviewOn } from "@/lib/initiatives";
import type { Initiative, ReviewKind } from "@/lib/types";

const MIDPOINT_PROMPTS = [
  { id: "working", question: "What is working?" },
  { id: "changing", question: "What am I changing for the second half?" },
];

const CLOSING_PROMPTS = [
  { id: "whoNow", question: "Who am I now compared to 1 October?" },
  { id: "trust", question: "What do I trust myself to do?" },
  { id: "carries", question: "What carries into the next two months?" },
];

/**
 * The two reviews that close each half of an initiative.
 *
 * They appear on their date and stay, rather than arriving and expiring: a
 * reflection somebody did not get to on the day is not a reflection they have
 * forfeited, and one they did write is the part of the whole two months most
 * worth being able to reread.
 */
export function InitiativeReview({
  initiative,
  kind,
  dayId,
  todayId,
}: {
  initiative: Initiative;
  kind: ReviewKind;
  dayId: string;
  todayId: string;
}) {
  const { state, updateInitiative, patchHabit } = useClaro();
  const [adjusting, setAdjusting] = useState<string | null>(null);

  const written = reviewOn(initiative, dayId, kind);
  // Nothing before its day, unless something was already written into it.
  if (todayId < dayId && !written) return null;

  const prompts = kind === "midpoint" ? MIDPOINT_PROMPTS : CLOSING_PROMPTS;
  const days = daysOf(initiative).filter((id) => id <= todayId);
  const { kept, due } = promisesIn(state, initiative, days);
  const sleep = averageSleep(state, days);

  const habits = initiative.habitIds
    .map((id) => state.habits[id])
    .filter((habit) => habit && !habit.archivedAt);

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="eyebrow">
          {kind === "midpoint" ? "Midpoint review" : "Closing reflection"}
        </h2>
        <span className="tnum text-[10px] text-muted-foreground">{formatDayShort(dayId)}</span>
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
        <div>
          <dt className="eyebrow text-[9px]">Promises kept</dt>
          <dd className="tnum mt-0.5 display text-[1.35rem] leading-none">
            {due === null ? kept : `${kept} of ${due}`}
          </dd>
        </div>
        {habits.map((habit) => (
          <div key={habit.id}>
            <dt className="eyebrow text-[9px]">{habit.name}</dt>
            <dd className="tnum mt-0.5 display text-[1.35rem] leading-none">
              {countCompletions(state.habitCompletions, habit.id, days)}
            </dd>
          </div>
        ))}
        <div>
          <dt className="eyebrow text-[9px]">Slept</dt>
          <dd className="tnum mt-0.5 display text-[1.35rem] leading-none">
            {sleep === null ? (
              <span className="text-[0.85rem] text-muted-foreground">Not rated</span>
            ) : (
              `${sleep} of 5`
            )}
          </dd>
        </div>
      </dl>

      {kind === "midpoint" && habits.length > 0 && (
        <div className="mt-5 border-t border-border/70 pt-4">
          <div className="flex items-baseline gap-2.5">
            <h3 className="eyebrow text-[9px]">Change what you meant to do</h3>
            <span className="text-[10px] text-muted-foreground">
              nothing here is counted as a miss
            </span>
          </div>
          <div className="mt-2 space-y-2">
            {habits.map((habit) =>
              adjusting === habit.id ? (
                <HabitIntentEditor
                  key={habit.id}
                  habit={habit}
                  onPatch={(patch) => patchHabit(habit.id, patch)}
                  onDone={() => setAdjusting(null)}
                />
              ) : (
                <button
                  key={habit.id}
                  type="button"
                  onClick={() => setAdjusting(habit.id)}
                  className="flex w-full items-baseline justify-between gap-3 rounded px-2 py-1.5 text-left text-[0.88rem] transition-colors hover:bg-muted"
                >
                  <span>{habit.name}</span>
                  <span className="tnum text-[11px] text-muted-foreground">
                    {habit.targetPerWeek ? `${habit.targetPerWeek} a week` : "No target"}
                  </span>
                </button>
              ),
            )}
          </div>
          {/*
            Said plainly rather than quietly not mentioned. A habit carries one
            target, not a target per week, so changing it changes how every
            week of the stretch reads. That is a fair trade for being able to
            change your mind halfway, but it should not be a surprise.
          */}
          <p className="mt-2 px-2 text-[10px] leading-relaxed text-muted-foreground">
            A new target applies to the whole stretch, including the weeks
            already behind you.
          </p>
        </div>
      )}

      <div className="mt-5 border-t border-border/70 pt-4">
        <div className="space-y-3">
          {prompts.map((prompt) => (
            <div key={prompt.id}>
              <p className="text-[0.82rem] text-muted-foreground">{prompt.question}</p>
              <EditableText
                value={written?.answers[prompt.id] ?? ""}
                onCommit={(answer) =>
                  updateInitiative(initiative.id, (i) =>
                    answerReview(i, dayId, kind, prompt.id, answer),
                  )
                }
                multiline
                rows={1}
                ariaLabel={prompt.question}
                placeholder="Your words"
                className="-ml-2 mt-0.5 text-[0.95rem] leading-snug"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
