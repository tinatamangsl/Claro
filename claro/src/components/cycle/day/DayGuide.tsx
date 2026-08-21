import { Link } from "@tanstack/react-router";

import { CYCLE_LENGTH_NOTE } from "@/lib/cycle";
import { BAND_LABELS, observations, positionOn, summariseNote } from "@/lib/cycle-timeline";
import { pastNotesFor } from "@/lib/cycle-forecast";
import { SUPPORTIVE_PROMPTS } from "@/lib/cycle-guide";
import { formatDayShort } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { CycleState, Day, ISODate } from "@/lib/types";

type Props = {
  cycle: CycleState;
  todayId: ISODate;
  day: Day;
  onForecast: () => void;
  onEvening: () => void;
  /** True after six in the evening, so the end-of-day link is offered then. */
  eveningReady: boolean;
};

/**
 * What today looks like, drawn only from what the user already wrote.
 *
 * The card that carries the most weight on this screen is a *description of
 * their own notes*, not a claim about their body. The design this came from put
 * a sentence here about the brain working harder and deep work costing more.
 * Claro cannot know either thing, and saying it would decide the day for
 * somebody before they had lived it.
 *
 * The one thing today is the user's own first priority. It is shown, never
 * chosen, reordered or re-scoped by anything on this page.
 */
export function DayGuide({ cycle, todayId, day, onForecast, onEvening, eveningReady }: Props) {
  const position = positionOn(cycle, todayId);
  const found = observations(cycle);
  const here = found.filter((o) => o.band === position?.band);
  const shown = here.length > 0 ? here : found;
  const past = pastNotesFor(cycle, todayId, 2);
  const anchor = day.priority1;

  return (
    <div className="space-y-7">
      <p className="text-[10px] text-muted-foreground">
        {position
          ? `${BAND_LABELS[position.band]} · Day ${position.day}`
          : "Not enough logged dates for a day count"}
      </p>

      {/* The insight card: a count of what they wrote, and never more. */}
      <section
        className={cn(
          "rounded-r-xl border-l-[3px] border-primary bg-card p-4",
        )}
      >
        <p className="display text-[1.06rem] leading-[1.6] italic">
          {shown.length > 0
            ? shown[0].text
            : "Nothing to describe yet. A few more notes and Claro can read your own patterns back to you."}
        </p>
        <p className="mt-2.5 text-[10px] leading-relaxed text-muted-foreground">
          A personal observation from your own entries. Not medical advice, not a prediction, and
          nothing here changes your plans.
        </p>
      </section>

      <section>
        <h2 className="eyebrow">Your one thing today</h2>
        <div className="surface mt-2.5 flex items-start justify-between gap-3 rounded-xl p-4">
          <p className="min-w-0 flex-1 text-[0.94rem] leading-snug font-medium">
            {anchor.text.trim() || "Nothing named yet."}
          </p>
          {anchor.text.trim() !== "" && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {anchor.done ? "done" : "your priority"}
            </span>
          )}
        </div>
      </section>

      <section>
        <h2 className="eyebrow">Also worth knowing</h2>
        <div className="mt-2.5 space-y-2">
          {past.length > 0 ? (
            past.map((entry) => (
              <div key={entry.dayId} className="rounded-[10px] bg-muted p-3.5">
                <p className="text-[0.87rem] leading-relaxed">
                  On {formatDayShort(entry.dayId)}, around this point in a past cycle, you logged{" "}
                  {summariseNote(entry).toLowerCase() || "a note"}.
                  {entry.note.trim() !== "" && ` You wrote: ${entry.note.trim()}`}
                </p>
              </div>
            ))
          ) : (
            <div className="rounded-[10px] bg-muted p-3.5">
              <p className="text-[0.87rem] leading-relaxed">
                You have not written anything around this point in a past cycle yet.
              </p>
            </div>
          )}

          <div className="rounded-[10px] bg-muted p-3.5">
            <p className="text-[0.87rem] leading-relaxed">{SUPPORTIVE_PROMPTS[3]}</p>
          </div>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          {CYCLE_LENGTH_NOTE}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onForecast}
          className="h-12 rounded-xl bg-muted text-[0.88rem] font-medium text-foreground transition-colors hover:bg-muted/70"
        >
          the next 7 days
        </button>
        <Link
          to="/today"
          className="grid h-12 place-items-center rounded-xl bg-foreground text-[0.88rem] font-medium text-background transition-opacity hover:opacity-90"
        >
          plan my day →
        </Link>
      </section>

      {eveningReady && (
        <button
          type="button"
          onClick={onEvening}
          className="w-full text-center text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          end of day check-in →
        </button>
      )}
    </div>
  );
}
