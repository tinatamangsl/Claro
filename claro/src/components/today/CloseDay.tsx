import { Check, Moon } from "lucide-react";
import { useState } from "react";

import { EditableText } from "@/components/EditableText";
import { formatDayShort, formatHourLabel } from "@/lib/dates";
import { openItems, type Decision, type OpenItem } from "@/lib/day-close";
import { cn } from "@/lib/utils";
import {
  MOOD_FACES,
  MOOD_FACE_META,
  STRESS_LABELS,
  STRESS_LEVELS,
  type DailyReview as Review,
  type Day,
  type MoodFace,
} from "@/lib/types";

type Props = {
  day: Day;
  /** True once the day has passed its 9 PM. */
  eligible: boolean;
  open: boolean;
  tomorrowId: string;
  onOpen: () => void;
  onWrite: (patch: Partial<Review>) => void;
  onDecide: (item: OpenItem, decision: Decision, toDayId?: string) => void;
  onClose: () => void;
  onReopen: () => void;
};

/**
 * Closing the day.
 *
 * Before 9 PM this is a quiet button and nothing more. After 9 PM it asks once,
 * gently, and never again in a stronger voice. Two short questions, an optional
 * mood and stress note, and then one decision per piece of unfinished work.
 */
export function CloseDay({
  day,
  eligible,
  open,
  tomorrowId,
  onOpen,
  onWrite,
  onDecide,
  onClose,
  onReopen,
}: Props) {
  const review = day.review;
  const items = openItems(day);
  const closed = day.closedAt !== null;

  if (closed && !open) {
    return (
      <section className="surface flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span className="flex items-center gap-2 text-[0.88rem]">
          <Check aria-hidden className="h-3.5 w-3.5 text-positive" />
          Your day is closed.
        </span>
        <button type="button" onClick={onReopen} className="btn btn-sm btn-ghost">
          Open it again
        </button>
      </section>
    );
  }

  if (!open) {
    return (
      <section
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 px-4 py-3",
          eligible ? "surface border-gold/50" : "card-dashed",
        )}
      >
        <span className="flex items-center gap-2 text-[0.88rem]">
          <Moon aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
          {eligible ? "Would you like to close your day?" : "Finished for the day?"}
        </span>
        <button
          type="button"
          onClick={onOpen}
          className={cn("btn btn-sm", eligible ? "btn-primary" : "btn-quiet")}
        >
          Close my day
        </button>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-baseline gap-2.5">
        <h2 className="eyebrow">Close my day</h2>
        <span className="text-[10px] text-muted-foreground">optional, and only for you</span>
      </div>

      <div className="surface mt-2 space-y-5 p-4">
        <Question
          label="One thing I am proud of today"
          value={review?.proudOf ?? ""}
          placeholder="However small."
          onCommit={(proudOf) => onWrite({ proudOf })}
        />
        <Question
          label="One thing I can do better tomorrow"
          value={review?.betterTomorrow ?? ""}
          onCommit={(betterTomorrow) => onWrite({ betterTomorrow })}
        />

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
          <div className="mt-2 flex flex-wrap gap-1.5">
            {STRESS_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                aria-pressed={review?.stress === level}
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

        <div className="border-t border-border/70 pt-4">
          <div className="flex items-baseline gap-2.5">
            <h3 className="eyebrow">Still open</h3>
            <span className="text-[10px] text-muted-foreground">
              {items.length === 0
                ? "nothing waiting"
                : `${items.length} to decide, one at a time`}
            </span>
          </div>

          {items.length === 0 ? (
            <p className="mt-2 text-[0.85rem] leading-relaxed text-muted-foreground">
              Everything on today has been dealt with.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-subtle">
              {items.map((item) => (
                <OpenRow
                  key={`${item.kind}:${item.id}`}
                  item={item}
                  tomorrowId={tomorrowId}
                  onDecide={onDecide}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border/70 pt-4">
          <button type="button" onClick={onClose} className="btn btn-sm btn-primary">
            Close the day
          </button>
          <span className="text-[11px] text-muted-foreground">
            Everything is already saved. You can open it again whenever you like.
          </span>
        </div>
      </div>
    </section>
  );
}

function Question({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[0.88rem] leading-snug">{label}</span>
      <div className="paper-panel ruled mt-2 px-3 pb-2">
        <EditableText
          value={value}
          onCommit={onCommit}
          multiline
          rows={2}
          ariaLabel={label}
          placeholder={placeholder}
          className="ruled-text -ml-2 py-0"
        />
      </div>
    </label>
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

/** One unfinished thing, and the four choices. Nothing is implied or default. */
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
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className="min-w-0 flex-1 text-[0.88rem] leading-snug">{item.text}</p>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {item.kind === "priority"
            ? "priority"
            : item.kind === "schedule"
              ? formatHourLabel(item.time)
              : item.bucket === "project"
                ? "project"
                : item.bucket === "quickTick"
                  ? "quick tick"
                  : "task"}
        </span>
      </div>

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
            <span className="sr-only">Choose a date for "{item.text}"</span>
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
