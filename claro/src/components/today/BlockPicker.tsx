import { useState } from "react";

import {
  CUSTOM_PRESET_ID,
  FOCUS_PRESETS,
  MAX_BREAK_MINUTES,
  MAX_FOCUS_MINUTES,
  MIN_BREAK_MINUTES,
  MIN_FOCUS_MINUTES,
  clampBreakMinutes,
  clampFocusMinutes,
  describeBlock,
  formatBlockLength,
  matchPreset,
  minutesToMs,
  msToMinutes,
  type FocusPreset,
} from "@/lib/focus-presets";
import { cn } from "@/lib/utils";
import type { FocusPrefs } from "@/lib/types";

type Props = {
  prefs: FocusPrefs;
  onChange: (patch: Partial<FocusPrefs>) => void;
  onStart: (plannedMs: number, breakMs: number) => void;
};

/**
 * How long this block is.
 *
 * Four named shapes for the common cases and a plain minutes field for
 * everything else, because "somewhere between ten and twenty-two minutes" is an
 * ordinary way to want to work and a fixed menu cannot express it.
 *
 * The chips are *derived* from the numbers rather than tracked beside them, so
 * typing 25 and 5 by hand lights up Pomodoro instead of reading "Custom". The
 * two can never disagree, because there is only one of them.
 */
export function BlockPicker({ prefs, onChange, onStart }: Props) {
  // Kept locally while typing so a half-entered "1" of "18" is not clamped to a
  // block length under the user's fingers. Committed on blur and on start.
  const [focusText, setFocusText] = useState(() => String(msToMinutes(prefs.plannedMs)));
  const [breakText, setBreakText] = useState(() => String(msToMinutes(prefs.breakMs)));
  const [open, setOpen] = useState(false);

  const focusMinutes = clampFocusMinutes(Number(focusText));
  const breakMinutes = clampBreakMinutes(Number(breakText));
  const plannedMs = minutesToMs(focusMinutes);
  const breakMs = minutesToMs(breakMinutes);
  const active = matchPreset(plannedMs, breakMs);

  const apply = (preset: FocusPreset) => {
    setFocusText(String(msToMinutes(preset.focusMs)));
    setBreakText(String(msToMinutes(preset.breakMs)));
    setOpen(false);
    onChange({ plannedMs: preset.focusMs, breakMs: preset.breakMs, presetId: preset.id });
  };

  const commit = (nextFocus = focusMinutes, nextBreak = breakMinutes) => {
    const focusMs = minutesToMs(nextFocus);
    const restMs = minutesToMs(nextBreak);
    setFocusText(String(nextFocus));
    setBreakText(String(nextBreak));
    onChange({
      plannedMs: focusMs,
      breakMs: restMs,
      presetId: matchPreset(focusMs, restMs)?.id ?? CUSTOM_PRESET_ID,
    });
  };

  return (
    <div className="mt-7">
      <div className="flex flex-wrap gap-2">
        {FOCUS_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={active?.id === preset.id}
            onClick={() => apply(preset)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-left transition-colors",
              active?.id === preset.id
                ? "border-gold bg-gold/15 text-foreground"
                : "border-border text-muted-foreground hover:border-foreground/40",
            )}
          >
            <span className="block text-[0.82rem] leading-tight">{preset.label}</span>
            <span className="tnum block text-[10px] leading-tight opacity-70">{preset.hint}</span>
          </button>
        ))}

        <button
          type="button"
          aria-pressed={active === null}
          aria-expanded={open || active === null}
          onClick={() => setOpen((was) => !was)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-left transition-colors",
            active === null
              ? "border-gold bg-gold/15 text-foreground"
              : "border-border text-muted-foreground hover:border-foreground/40",
          )}
        >
          <span className="block text-[0.82rem] leading-tight">Custom</span>
          <span className="tnum block text-[10px] leading-tight opacity-70">
            {active === null ? `${focusMinutes} min` : "any length"}
          </span>
        </button>
      </div>

      {(open || active === null) && (
        <div className="paper-panel mt-3 space-y-3 p-3.5">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground">Focus, in minutes</span>
              <input
                type="number"
                inputMode="numeric"
                min={MIN_FOCUS_MINUTES}
                max={MAX_FOCUS_MINUTES}
                value={focusText}
                aria-label="Focus block length in minutes"
                onChange={(e) => setFocusText(e.target.value)}
                onBlur={() => commit()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commit();
                  }
                }}
                className="tnum w-20 rounded-md border border-border bg-card px-2.5 py-1.5 text-[0.95rem]"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground">Break after, in minutes</span>
              <input
                type="number"
                inputMode="numeric"
                min={MIN_BREAK_MINUTES}
                max={MAX_BREAK_MINUTES}
                value={breakText}
                aria-label="Break length in minutes, zero for none"
                onChange={(e) => setBreakText(e.target.value)}
                onBlur={() => commit()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commit();
                  }
                }}
                className="tnum w-20 rounded-md border border-border bg-card px-2.5 py-1.5 text-[0.95rem]"
              />
            </label>
          </div>

          {/* The slider is the fast way to the rough number; the field is the exact one. */}
          <label className="block">
            <span className="sr-only">Focus block length</span>
            <input
              type="range"
              min={MIN_FOCUS_MINUTES}
              max={90}
              step={1}
              value={Math.min(90, focusMinutes)}
              aria-label="Focus block length slider"
              onChange={(e) => {
                setFocusText(e.target.value);
                commit(clampFocusMinutes(Number(e.target.value)));
              }}
              className="field-range"
            />
          </label>

          <p className="text-[11px] text-muted-foreground">
            Anything from {MIN_FOCUS_MINUTES} to {MAX_FOCUS_MINUTES} minutes. Set the break to 0 if
            you would rather not have one.
          </p>
        </div>
      )}

      <p className="mt-3 text-[0.85rem] leading-relaxed text-muted-foreground">
        {describeBlock(plannedMs, breakMs)}
      </p>

      <button
        type="button"
        onClick={() => {
          commit();
          onStart(plannedMs, breakMs);
        }}
        className="btn btn-primary mt-3"
      >
        Start {formatBlockLength(plannedMs)}
      </button>
    </div>
  );
}
