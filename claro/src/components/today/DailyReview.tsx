import { useState } from "react";

import { EditableText } from "@/components/EditableText";
import { formatDayShort } from "@/lib/dates";
import { openItems, type Decision, type OpenItem } from "@/lib/daily-review";
import { cn } from "@/lib/utils";
import {
  MOOD_FACES,
  MOOD_FACE_META,
  STRESS_LABELS,
  STRESS_LEVELS,
  type DailyReview as Review,
  type Day,
  type MoodFace,
  type StressLevel,
} from "@/lib/types";

type Props = {
  day: Day;
  tomorrowId: string;
  onWrite: (patch: Partial<Review>) => void;
  onDecide: (item: OpenItem, decision: Decision, toDayId?: string) => void;
};

/**
 * A short look back at the day.
 *
 * Every part is optional, nothing is counted, and there is no streak, score or
 * ranking anywhere in it. Unfinished work is listed for a decision rather than
 * copied forward on the user's behalf.
 */
export function DailyReview({ day, tomorrowId, onWrite, onDecide }: Props) {
  const review = day.review;
  const open = openItems(day);

  return (
    <section>
      <div className="flex items-baseline gap-2.5">
        <h2 className="eyebrow">Daily review</h2>
        <span className="text-[10px] text-muted-foreground">optional, and only for you</span>
      </div>

      <div className="surface mt-2 space-y-5 p-4">
        <div>
          <label className="block text-[0.88rem] leading-snug">
            One thing you are proud of today
            <div className="paper-panel ruled mt-2 px-3 pb-2">
              <EditableText
                value={review?.proudOf ?? ""}
                onCommit={(proudOf) => onWrite({ proudOf })}
                multiline
                rows={2}
                ariaLabel="One thing you are proud of today"
                placeholder="However small."
                className="ruled-text -ml-2 py-0"
              />
            </div>
          </label>
        </div>

        <div>
          <label className="block text-[0.88rem] leading-snug">
            What helped, or got in the way?
            <div className="paper-panel ruled mt-2 px-3 pb-2">
              <EditableText
                value={review?.helped ?? ""}
                onCommit={(helped) => onWrite({ helped })}
                multiline
                rows={2}
                ariaLabel="What helped, or got in the way?"
                className="ruled-text -ml-2 py-0"
              />
            </div>
          </label>
        </div>

        <fieldset>
          <legend className="text-[0.88rem]">How did today feel?</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {MOOD_FACES.map((face) => (
              <MoodButton
                key={face}
                face={face}
                selected={review?.mood === face}
                onSelect={() => onWrite({ mood: review?.mood === face ? null : face })}
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-[0.88rem]">
            Stress today
            <span className="ml-2 text-[10px] text-muted-foreground">low to high</span>
          </legend>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {STRESS_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                aria-pressed={review?.stress === level}
                aria-label={STRESS_LABELS[level]}
                onClick={() => onWrite({ stress: review?.stress === level ? null : level })}
                className={cn(
                  "h-7 rounded-full border px-3 text-[11px] transition-colors",
                  review?.stress === level
                    ? "border-gold bg-gold/20 text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/40",
                )}
              >
                {STRESS_LABELS[level]}
              </button>
            ))}
          </div>
        </fieldset>

        {open.length > 0 && (
          <div className="border-t border-border/70 pt-4">
            <div className="flex items-baseline gap-2.5">
              <h3 className="eyebrow">Still open</h3>
              <span className="text-[10px] text-muted-foreground">
                your call, one at a time
              </span>
            </div>

            <ul className="mt-2 divide-y divide-subtle">
              {open.map((item) => (
                <OpenRow
                  key={`${item.kind}:${item.id}`}
                  item={item}
                  tomorrowId={tomorrowId}
                  onDecide={onDecide}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function MoodButton({
  face,
  selected,
  onSelect,
}: {
  face: MoodFace;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = MOOD_FACE_META[face];
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={meta.label}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
        selected
          ? "border-gold bg-gold/20 text-foreground"
          : "border-border text-muted-foreground hover:border-foreground/40",
      )}
    >
      <span aria-hidden className="text-[0.95rem] leading-none">
        {meta.emoji}
      </span>
      {meta.label}
    </button>
  );
}

/** One unfinished thing, with the four choices and nothing implied. */
function OpenRow({
  item,
  tomorrowId,
  onDecide,
}: {
  item: OpenItem;
  tomorrowId: string;
  onDecide: (item: OpenItem, decision: Decision, toDayId?: string) => void;
}) {
  const [scheduling, setScheduling] = useState(false);

  return (
    <li className="py-2.5">
      <p className="text-[0.88rem] leading-snug">{item.text}</p>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onDecide(item, "complete")}
          className="btn btn-sm btn-quiet"
        >
          Complete
        </button>
        <button
          type="button"
          onClick={() => onDecide(item, "carry", tomorrowId)}
          className="btn btn-sm btn-ghost"
        >
          Carry forward to {formatDayShort(tomorrowId)}
        </button>

        {scheduling ? (
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="sr-only">Schedule "{item.text}" for</span>
            <input
              type="date"
              autoFocus
              onChange={(e) => {
                if (e.target.value) onDecide(item, "schedule", e.target.value);
                setScheduling(false);
              }}
              onBlur={() => setScheduling(false)}
              className="field-select tnum"
            />
          </label>
        ) : (
          <button
            type="button"
            onClick={() => setScheduling(true)}
            className="btn btn-sm btn-ghost"
          >
            Schedule later
          </button>
        )}

        <button
          type="button"
          onClick={() => onDecide(item, "letGo")}
          className="btn btn-sm btn-ghost ml-auto"
        >
          Let go
        </button>
      </div>
    </li>
  );
}
