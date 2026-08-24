import { useEffect, useRef, useState } from "react";

import {
  DAYS_AGO_OPTIONS,
  ENERGY_BANDS,
  ENERGY_BAND_LABELS,
  LOGGED_LINE,
  bandOf,
  levelForBand,
  type EnergyBand,
  type PeriodAnswer,
} from "@/lib/cycle-log";
import { positionOn } from "@/lib/cycle-timeline";
import { PHASE_META } from "@/lib/cycle-phases";
import { ongoingPeriod } from "@/lib/cycle";
import { cn } from "@/lib/utils";
import {
  FEELINGS,
  FEELING_META,
  type CycleCheckIn,
  type CycleState,
  type Feeling,
  type ISODate,
} from "@/lib/types";

/** Long enough to read the line, short enough not to be a wait. */
const CONFIRM_MS = 1500;

/** One word each, so the shape of the choice is obvious at a glance. */
const ENERGY_HINTS: Record<EnergyBand, { moon: string; hint: string }> = {
  low: { moon: "🌑", hint: "I need to take it easy" },
  medium: { moon: "🌓", hint: "I can manage the essentials" },
  high: { moon: "🌕", hint: "I'm ready for more" },
};

type Step = "period" | "daysAgo" | "feeling" | "energy" | "done";

type Props = {
  cycle: CycleState;
  todayId: ISODate;
  note: CycleCheckIn;
  onWrite: (patch: Partial<CycleCheckIn>) => void;
  /** Records a period start that began `daysAgo` days ago, or closes an open one. */
  onPeriod: (answer: PeriodAnswer) => void;
  onDone: () => void;
};

/**
 * The morning log, as one question at a time.
 *
 * A tap is the whole interaction: choosing an answer advances, so there is no
 * submit button between steps and never two decisions on screen at once. Three
 * taps on an ordinary day.
 *
 * The first question adapts to what is already recorded rather than asking the
 * same thing regardless. With a period already open it asks whether that period
 * has ended, and it always offers a way through without logging one, because a
 * flow that can only be answered "yes" is not asking.
 */
export function DayLog({ cycle, todayId, note, onWrite, onPeriod, onDone }: Props) {
  const [step, setStep] = useState<Step>("period");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const finish = () => {
    setStep("done");
    timer.current = setTimeout(onDone, CONFIRM_MS);
  };

  const position = positionOn(cycle, todayId);
  const ongoing = ongoingPeriod(cycle);

  if (step === "done") {
    return (
      <div
        role="status"
        className="flex min-h-[55vh] flex-col items-center justify-center px-6 text-center"
      >
        <p className="display text-[1.5rem] leading-snug italic">{LOGGED_LINE}</p>
        {position && (
          <p className="mt-3 text-[0.82rem] text-muted-foreground">
            Day {position.day}. {PHASE_META[position.phase].label}, estimated.
          </p>
        )}
      </div>
    );
  }

  const stepIndex = step === "period" || step === "daysAgo" ? 0 : step === "feeling" ? 1 : 2;

  return (
    <div className="flex min-h-[55vh] flex-col">
      <Dots active={stepIndex} />

      {step === "period" && (
        <Stage question={ongoing ? "Is your period still going?" : "Has your period started?"}>
          {ongoing ? (
            <>
              <Choice
                label="Yes, still going"
                onSelect={() => {
                  onPeriod({ kind: "none" });
                  setStep("feeling");
                }}
              />
              <Choice
                label="It ended today"
                onSelect={() => {
                  onPeriod({ kind: "ended" });
                  setStep("feeling");
                }}
              />
            </>
          ) : (
            <>
              <Choice
                label="Yes, today"
                onSelect={() => {
                  onPeriod({ kind: "started", daysAgo: 0 });
                  setStep("feeling");
                }}
              />
              <Choice label="It started a few days ago" onSelect={() => setStep("daysAgo")} />
              {/*
                A flow that can only be answered yes is not asking anything.
                Every answer reports, and "none" is the handler's no-op, so the
                decision about whether anything is written lives in one place.
              */}
              <Choice
                label="No, not yet"
                quiet
                onSelect={() => {
                  onPeriod({ kind: "none" });
                  setStep("feeling");
                }}
              />
            </>
          )}
        </Stage>
      )}

      {step === "daysAgo" && (
        <Stage question="How many days ago?">
          <div className="flex gap-2">
            {DAYS_AGO_OPTIONS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => {
                  onPeriod({ kind: "started", daysAgo: days });
                  setStep("feeling");
                }}
                className="h-14 flex-1 rounded-xl bg-card text-[0.95rem] font-medium ring-1 ring-border transition-colors hover:bg-muted"
              >
                {days === 5 ? "5+" : days}
              </button>
            ))}
          </div>
          <p className="mt-3 text-center text-[10px] text-muted-foreground">
            Longer ago than that? The cycle calendar takes an exact date.
          </p>
        </Stage>
      )}

      {step === "feeling" && (
        <Stage question="How are you feeling right now?">
          <div className="grid grid-cols-2 gap-3">
            {FEELINGS.map((feeling) => (
              <button
                key={feeling}
                type="button"
                aria-pressed={note.feeling === feeling}
                onClick={() => {
                  onWrite({ feeling: feeling as Feeling });
                  setStep("energy");
                }}
                className={cn(
                  "flex h-14 items-center justify-center gap-2 rounded-xl text-[0.9rem] transition-colors",
                  note.feeling === feeling
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-foreground ring-1 ring-border hover:bg-muted",
                )}
              >
                <span aria-hidden className="text-[1.05rem] leading-none">
                  {FEELING_META[feeling].emoji}
                </span>
                {FEELING_META[feeling].label}
              </button>
            ))}
          </div>
          <SkipLine onSkip={() => setStep("energy")} />
        </Stage>
      )}

      {step === "energy" && (
        <Stage question="What's your energy like today?">
          <div className="space-y-2">
            {ENERGY_BANDS.map((band) => (
              <button
                key={band}
                type="button"
                aria-pressed={bandOf(note.energy) === band}
                onClick={() => {
                  onWrite({ energy: levelForBand(band, note.energy) });
                  finish();
                }}
                className={cn(
                  "flex h-14 w-full items-center gap-3 rounded-xl px-4 text-left transition-colors",
                  bandOf(note.energy) === band
                    ? "bg-primary text-primary-foreground"
                    : "bg-card ring-1 ring-border hover:bg-muted",
                )}
              >
                <span aria-hidden className="text-[1.1rem] leading-none">
                  {ENERGY_HINTS[band].moon}
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.92rem] font-medium">
                    {ENERGY_BAND_LABELS[band]}
                  </span>
                  <span className="block text-[11px] opacity-75">{ENERGY_HINTS[band].hint}</span>
                </span>
              </button>
            ))}
          </div>
          <SkipLine onSkip={finish} label="skip and finish" />
        </Stage>
      )}
    </div>
  );
}

/** One question, filling the content area. Fades in so steps do not jump. */
function Stage({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <div key={question} className="cycle-step flex flex-1 flex-col justify-center">
      <h2 className="display mb-7 text-center text-[1.375rem] leading-snug italic">{question}</h2>
      <div>{children}</div>
    </div>
  );
}

function Choice({
  label,
  onSelect,
  quiet,
}: {
  label: string;
  onSelect: () => void;
  quiet?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "mb-2 h-14 w-full rounded-xl px-4 text-[0.95rem] transition-colors",
        quiet
          ? "text-muted-foreground hover:text-foreground"
          : "bg-card font-medium ring-1 ring-border hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

function SkipLine({ onSkip, label = "skip this" }: { onSkip: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onSkip}
      className="mt-5 w-full text-center text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      {label}
    </button>
  );
}

/** Where you are, stated quietly. Three questions, never a score. */
function Dots({ active }: { active: number }) {
  return (
    <div aria-hidden className="mb-6 flex justify-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full transition-colors",
            i <= active ? "bg-foreground/45" : "bg-border",
          )}
        />
      ))}
    </div>
  );
}
