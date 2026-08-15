import { Minus, Plus } from "lucide-react";

import { MOOD_LABELS, type Day, type Mood } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  day: Day;
  onPatch: (patch: Partial<Day>) => void;
};

const MOODS: Mood[] = [1, 2, 3, 4, 5];
const MAX_WATER = 10;

/**
 * Four small readings, not a health tracker. The point is to eventually see how
 * energy and execution relate — so it stays lightweight and optional.
 */
export function WellbeingBlock({ day, onPatch }: Props) {
  return (
    <section>
      <div className="flex items-baseline gap-2.5">
        <h2 className="eyebrow">Check-in</h2>
        <span className="text-[11px] text-muted-foreground">how the body's doing</span>
      </div>

      <div className="mt-3 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <Cell label="Sleep" hint="hours">
          <Stepper
            value={day.sleepHours ?? 0}
            onChange={(v) => onPatch({ sleepHours: v === 0 ? null : v })}
            step={0.5}
            min={0}
            max={16}
            format={(v) => (day.sleepHours === null ? "—" : `${v}`)}
            label="hours of sleep"
          />
        </Cell>

        <Cell label="Water" hint="glasses">
          <div className="space-y-2.5">
            <div className="tnum text-[1.6rem] leading-none">{day.waterGlasses}</div>
            <div className="flex gap-1">
              {Array.from({ length: MAX_WATER }, (_, i) => {
                const filled = i < day.waterGlasses;
                return (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Set water to ${i + 1} glasses`}
                    onClick={() =>
                      onPatch({ waterGlasses: day.waterGlasses === i + 1 ? i : i + 1 })
                    }
                    className={cn(
                      "h-3 w-3 shrink-0 rounded-full border transition-colors",
                      filled
                        ? "border-primary bg-primary"
                        : "border-border bg-transparent hover:border-foreground/40",
                    )}
                  />
                );
              })}
            </div>
          </div>
        </Cell>

        <Cell label="Steps" hint="today">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            aria-label="Steps today"
            value={day.steps ?? ""}
            placeholder="—"
            onChange={(e) => {
              const raw = e.target.value;
              onPatch({ steps: raw === "" ? null : Math.max(0, Number(raw)) });
            }}
            className="tnum w-full bg-transparent text-[1.6rem] leading-none outline-none placeholder:text-foreground"
          />
        </Cell>

        <Cell label="Mood" hint={day.mood ? MOOD_LABELS[day.mood] : "1 – 5"}>
          <div className="flex gap-1.5 pt-1.5">
            {MOODS.map((m) => {
              const active = day.mood !== null && m <= day.mood;
              return (
                <button
                  key={m}
                  type="button"
                  aria-label={`Mood ${m} — ${MOOD_LABELS[m]}`}
                  aria-pressed={day.mood === m}
                  onClick={() => onPatch({ mood: day.mood === m ? null : m })}
                  className={cn(
                    "h-6 w-6 rounded-full border text-[11px] transition-colors",
                    active
                      ? "border-gold bg-gold text-foreground"
                      : "border-border text-muted-foreground hover:border-foreground/40",
                  )}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </Cell>
      </div>
    </section>
  );
}

function Cell({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium">{label}</span>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function Stepper({
  value,
  onChange,
  step,
  min,
  max,
  format,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  step: number;
  min: number;
  max: number;
  format: (value: number) => string;
  label: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Number(v.toFixed(1))));
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="tnum text-[1.6rem] leading-none">{format(value)}</span>
      <div className="flex gap-1">
        <StepButton onClick={() => onChange(clamp(value - step))} label={`Decrease ${label}`}>
          <Minus className="h-3 w-3" />
        </StepButton>
        <StepButton onClick={() => onChange(clamp(value + step))} label={`Increase ${label}`}>
          <Plus className="h-3 w-3" />
        </StepButton>
      </div>
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
      className="grid h-6 w-6 place-items-center rounded border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}
