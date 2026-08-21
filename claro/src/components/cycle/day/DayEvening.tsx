import { useState } from "react";

import { describeMorning } from "@/lib/cycle-log";
import { cn } from "@/lib/utils";
import {
  EVENING_LABELS,
  EVENING_MATCHES,
  FEELING_META,
  type CycleCheckIn,
  type EveningMatch,
  type Feeling,
} from "@/lib/types";

type Props = {
  note: CycleCheckIn;
  onWrite: (patch: Partial<CycleCheckIn>) => void;
  onDone: () => void;
};

/**
 * The end of the day, weighed against what the user wrote this morning.
 *
 * The design this came from asked whether energy matched what *Claro predicted*.
 * Claro predicts nothing, so there would be nothing to compare against and the
 * question would quietly assert that it had made a forecast. It asks about
 * their own morning reading instead, which is a real thing that exists.
 */
export function DayEvening({ note, onWrite, onDone }: Props) {
  const [match, setMatch] = useState<EveningMatch | null>(note.evening?.match ?? null);
  const [text, setText] = useState(note.evening?.note ?? "");
  const [emoji, setEmoji] = useState(note.evening?.emoji ?? "");

  const morning = describeMorning(note, (f: Feeling) => FEELING_META[f].label);

  const save = () => {
    if (!match) return;
    onWrite({ evening: { match, note: text, emoji, updatedAt: "" } });
    onDone();
  };

  return (
    <div className="space-y-7">
      <p className="text-center eyebrow">End of day</p>

      <p className="display text-center text-[1.35rem] leading-snug italic">
        {morning
          ? `This morning you logged ${morning}. Did that hold?`
          : "You did not log anything this morning. How did today go?"}
      </p>

      <div className="space-y-2">
        {EVENING_MATCHES.map((option) => {
          const selected = match === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => setMatch(option)}
              className={cn(
                "h-14 w-full rounded-xl text-[0.92rem] transition-colors",
                selected ? "bg-foreground text-background" : "bg-muted text-foreground",
              )}
            >
              {EVENING_LABELS[option]}
            </button>
          );
        })}
      </div>

      {match && (
        <div className="space-y-4">
          <label className="block">
            <span className="eyebrow">What happened?</span>
            <textarea
              rows={2}
              value={text}
              placeholder="anything worth noting…"
              onChange={(e) => setText(e.target.value)}
              className="mt-2 w-full resize-none rounded-xl bg-card p-3 text-[0.9rem] outline-none placeholder:text-muted-foreground/70"
            />
          </label>

          <label className="block">
            <span className="eyebrow">One emoji for today</span>
            <input
              type="text"
              value={emoji}
              maxLength={4}
              aria-label="One emoji for today"
              placeholder="🌤"
              onChange={(e) => setEmoji(e.target.value)}
              className="mt-2 w-16 rounded-xl bg-card p-3 text-center text-[1.1rem] outline-none"
            />
          </label>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={save}
          disabled={!match}
          className="h-[52px] w-full rounded-xl bg-primary text-[0.95rem] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          done for today
        </button>
        <p className="mt-2 text-center text-[10px] leading-relaxed text-muted-foreground">
          Kept privately with your other notes. Claro reads nothing into it.
        </p>
      </div>
    </div>
  );
}
