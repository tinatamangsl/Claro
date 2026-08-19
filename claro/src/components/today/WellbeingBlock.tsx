import { Minus, Plus } from "lucide-react";

import { MOOD_LABELS, type Day, type Mood } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  day: Day;
  onPatch: (patch: Partial<Day>) => void;
  className?: string;
};

const MOODS: Mood[] = [1, 2, 3, 4, 5];
const MAX_WATER = 8;

/**
 * Four small readings on one line, not a health tracker. It sits as a strip
 * across the spread the way the paper page carries sleep, water and steps in a
 * single row — present, but never the loudest thing on the page.
 */
export function WellbeingBlock({ day, onPatch, className }: Props) {
  return (
    <section className={cn("shrink-0", className)}>
      <div className="flex items-baseline gap-2">
        <h2 className="eyebrow">Check-in</h2>
        <span className="text-[10px] text-muted-foreground">how the body's doing</span>
      </div>

      <div className="paper-panel mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-2">
        <Field label="Sleep">
          <Stepper
            value={day.sleepHours ?? 0}
            onChange={(v) => onPatch({ sleepHours: v === 0 ? null : v })}
            display={day.sleepHours === null ? "·" : `${day.sleepHours}`}
            label="hours of sleep"
          />
        </Field>

        <Field label="Water">
          <div className="flex gap-1">
            {Array.from({ length: MAX_WATER }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Set water to ${i + 1} glasses`}
                onClick={() => onPatch({ waterGlasses: day.waterGlasses === i + 1 ? i : i + 1 })}
                className={cn(
                  "h-3 w-3 shrink-0 rounded-full border transition-colors",
                  i < day.waterGlasses
                    ? "border-primary bg-primary"
                    : "border-border bg-transparent hover:border-foreground/40",
                )}
              />
            ))}
          </div>
        </Field>

        <Field label="Steps">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            aria-label="Steps today"
            value={day.steps ?? ""}
            placeholder="·"
            onChange={(e) => {
              const raw = e.target.value;
              onPatch({ steps: raw === "" ? null : Math.max(0, Number(raw)) });
            }}
            className="tnum w-16 bg-transparent text-[0.85rem] outline-none placeholder:text-foreground"
          />
        </Field>

        <Field label={day.mood ? MOOD_LABELS[day.mood] : "Mood"}>
          <div className="flex gap-1">
            {MOODS.map((m) => (
              <button
                key={m}
                type="button"
                aria-label={`Mood ${m}, ${MOOD_LABELS[m]}`}
                aria-pressed={day.mood === m}
                onClick={() => onPatch({ mood: day.mood === m ? null : m })}
                className={cn(
                  "h-5 w-5 rounded-full border text-[10px] transition-colors",
                  day.mood !== null && m <= day.mood
                    ? "border-gold bg-gold text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/40",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </Field>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-[10px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Stepper({
  value,
  onChange,
  display,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  display: string;
  label: string;
}) {
  const clamp = (v: number) => Math.min(16, Math.max(0, Number(v.toFixed(1))));
  return (
    <div className="flex items-center gap-1.5">
      <span className="tnum w-6 text-[0.85rem]">{display}</span>
      <StepButton onClick={() => onChange(clamp(value - 0.5))} label={`Decrease ${label}`}>
        <Minus className="h-2.5 w-2.5" />
      </StepButton>
      <StepButton onClick={() => onChange(clamp(value + 0.5))} label={`Increase ${label}`}>
        <Plus className="h-2.5 w-2.5" />
      </StepButton>
    </div>
  );
}

function StepButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-5 w-5 place-items-center rounded border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}
