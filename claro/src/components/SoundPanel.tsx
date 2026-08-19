import { Check, Pause, Play, Plus, Trash2, Volume2, VolumeX } from "lucide-react";
import { useState } from "react";

import { useSoundSession } from "@/hooks/use-sound-session";
import { useClaro } from "@/lib/claro-store";
import { newId } from "@/lib/id";
import { cn } from "@/lib/utils";
import {
  SESSION_MODES,
  SESSION_MODE_META,
  SOUNDSCAPES,
  SOUNDSCAPE_META,
  type SoundPreset,
} from "@/lib/types";

/**
 * Everything the user can choose about sound, in one place.
 *
 * The same panel renders in the header popover and inside Focus mode. Both are
 * views onto one audio session, so playing here shows as playing there, and
 * neither can start a second sound.
 *
 * Modes and soundscapes are names for preferences. Nothing here claims an
 * effect on the person listening.
 */
export function SoundPanel({ compact }: { compact?: boolean }) {
  const {
    prefs,
    setSound,
    playing,
    supported,
    toggle,
    chooseSoundscape,
    chooseMode,
    applyPreset,
  } = useSoundSession();
  const { soundPresets, addPreset, deletePreset } = useClaro();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  if (!supported) {
    return (
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        This browser cannot generate sound. Everything else works as normal.
      </p>
    );
  }

  const presets = Object.values(soundPresets).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  const savePreset = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    addPreset({
      id: newId(),
      name: trimmed,
      mode: prefs.mode ?? "deep",
      soundscape: prefs.soundscape,
      volume: prefs.volume,
      focusMinutes: null,
      createdAt: new Date().toISOString(),
    });
    setName("");
    setNaming(false);
  };

  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      {/* Transport */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void toggle()}
          aria-pressed={playing}
          className="btn btn-sm btn-primary gap-1.5"
        >
          {playing ? (
            <Pause aria-hidden className="h-3.5 w-3.5" />
          ) : (
            <Play aria-hidden className="h-3.5 w-3.5" />
          )}
          {playing ? "Pause sound" : "Play sound"}
        </button>

        <button
          type="button"
          onClick={() => setSound({ muted: !prefs.muted })}
          aria-pressed={prefs.muted}
          aria-label={prefs.muted ? "Unmute" : "Mute"}
          className="btn btn-icon btn-ghost h-8 w-8"
        >
          {prefs.muted ? (
            <VolumeX aria-hidden className="h-3.5 w-3.5" />
          ) : (
            <Volume2 aria-hidden className="h-3.5 w-3.5" />
          )}
        </button>

        <label className="flex flex-1 items-center gap-2">
          <span className="sr-only">Volume</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(prefs.volume * 100)}
            onChange={(e) => setSound({ volume: Number(e.target.value) / 100 })}
            className="w-full accent-[var(--color-primary)]"
          />
        </label>
      </div>

      <p aria-live="polite" className="text-[11px] text-muted-foreground">
        {playing
          ? `Playing ${SOUNDSCAPE_META[prefs.soundscape].label.toLowerCase()}${prefs.muted ? ", muted" : ""}`
          : "Nothing is playing"}
      </p>

      {/* Mode for this session */}
      <fieldset>
        <legend className="eyebrow">Mode for this session</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SESSION_MODES.map((mode) => {
            const selected = prefs.mode === mode;
            return (
              <button
                key={mode}
                type="button"
                aria-pressed={selected}
                onClick={() => chooseMode(selected ? null : mode)}
                title={SESSION_MODE_META[mode].hint}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  selected
                    ? "border-gold bg-gold/15 text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/40",
                )}
              >
                {SESSION_MODE_META[mode].label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          A label for how you plan to work. It does not change anything on its own.
        </p>
      </fieldset>

      {/* Soundscape */}
      <fieldset>
        <legend className="eyebrow">Soundscape</legend>
        <div className="mt-2 grid gap-1">
          {SOUNDSCAPES.map((id) => {
            const selected = prefs.soundscape === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                onClick={() => chooseSoundscape(id)}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors",
                  selected
                    ? "border-gold/60 bg-gold/10"
                    : "border-transparent hover:border-border",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border",
                    selected ? "border-gold bg-gold" : "border-border",
                  )}
                >
                  {selected && <Check className="h-2.5 w-2.5 stroke-[3] text-foreground" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.82rem] leading-snug">
                    {SOUNDSCAPE_META[id].label}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {SOUNDSCAPE_META[id].hint}
                  </span>
                </span>
                {selected && playing && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">Playing</span>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          Generated on this device. Nothing is streamed, stored or recorded.
        </p>
      </fieldset>

      {/* End of session chime */}
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={prefs.endChime}
          onChange={(e) => setSound({ endChime: e.target.checked })}
          className="mt-0.5 accent-[var(--color-primary)]"
        />
        <span className="text-[0.82rem] leading-snug">
          Play a short chime when a block finishes
          <span className="block text-[10px] text-muted-foreground">Off unless you turn it on</span>
        </span>
      </label>

      {/* Presets */}
      <div className="border-t border-border/70 pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="eyebrow">Saved presets</h3>
          {!naming && (
            <button
              type="button"
              onClick={() => setNaming(true)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus aria-hidden className="h-3 w-3" />
              Save this
            </button>
          )}
        </div>

        {naming && (
          <form
            className="mt-2 flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              savePreset();
            }}
          >
            <input
              autoFocus
              aria-label="Preset name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Founder deep work"
              className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-1 text-[0.82rem]"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setName("");
                  setNaming(false);
                }
              }}
            />
            <button type="submit" className="btn btn-sm btn-quiet">
              Save
            </button>
          </form>
        )}

        {presets.length === 0 ? (
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Save a mode, a soundscape and a volume together, then pick it again later.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {presets.map((preset) => (
              <PresetRow
                key={preset.id}
                preset={preset}
                onApply={() => applyPreset(preset)}
                onDelete={() => deletePreset(preset.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PresetRow({
  preset,
  onApply,
  onDelete,
}: {
  preset: SoundPreset;
  onApply: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="group flex items-center gap-1.5">
      <button
        type="button"
        onClick={onApply}
        className="min-w-0 flex-1 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted"
      >
        <span className="block truncate text-[0.82rem]">{preset.name}</span>
        <span className="block text-[10px] text-muted-foreground">
          {SESSION_MODE_META[preset.mode].label}, {SOUNDSCAPE_META[preset.soundscape].label}
          {preset.focusMinutes ? `, ${preset.focusMinutes} minutes` : ""}
        </span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete the preset ${preset.name}`}
        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 aria-hidden className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
