import { Volume1, Volume2, VolumeX, Waves } from "lucide-react";
import { useEffect, useState } from "react";

import { useClaro } from "@/lib/claro-store";
import * as sound from "@/lib/sound";
import { cn } from "@/lib/utils";

/**
 * Optional ambient sound, available from every route.
 *
 * The engine is a module singleton, so this control is a view onto one sound
 * rather than one sound per page. It never starts on its own: playback begins
 * only when someone presses play, and the stored preference is a volume, not a
 * "resume automatically".
 */
export function SoundControl() {
  const { sound: prefs, setSound } = useClaro();
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(true);

  // Read support after mount: the server has no AudioContext to ask.
  useEffect(() => setAvailable(sound.isSupported()), []);

  // Keep the running sound in step with the stored preference.
  useEffect(() => {
    sound.setLevel(prefs.volume, prefs.muted);
  }, [prefs.volume, prefs.muted]);

  // A route change must not leave a sound playing with no control attached.
  useEffect(() => () => setPlaying(sound.isPlaying()), []);

  if (!available) return null;

  const toggle = async () => {
    if (playing) {
      sound.pause();
      setPlaying(false);
      return;
    }
    // Called straight from the click, which is what browsers require.
    const started = await sound.play(prefs.volume, prefs.muted);
    setPlaying(started);
    if (started) setOpen(true);
  };

  const Icon = prefs.muted ? VolumeX : prefs.volume > 0.5 ? Volume2 : Volume1;

  return (
    <div className="relative flex items-center gap-1">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={playing}
        aria-label={playing ? "Pause ambient sound" : "Play ambient sound"}
        className={cn(
          "btn btn-sm btn-ghost gap-1.5",
          playing && "text-foreground",
        )}
      >
        <Waves aria-hidden className={cn("h-3.5 w-3.5", playing && "text-gold")} />
        <span className="hidden sm:inline">{playing ? "Sound on" : "Sound"}</span>
      </button>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Sound settings"
        className="btn btn-icon btn-ghost h-7 w-7"
      >
        <Icon aria-hidden className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="surface absolute top-full right-0 z-40 mt-2 w-56 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="eyebrow">Ambient sound</span>
            <button
              type="button"
              onClick={() => setSound({ muted: !prefs.muted })}
              aria-pressed={prefs.muted}
              className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {prefs.muted ? "Unmute" : "Mute"}
            </button>
          </div>

          <label className="mt-3 block">
            <span className="sr-only">Ambient sound volume</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(prefs.volume * 100)}
              onChange={(e) => setSound({ volume: Number(e.target.value) / 100 })}
              className="w-full accent-[var(--color-primary)]"
            />
          </label>

          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Generated on this device. Nothing is streamed or recorded.
          </p>
        </div>
      )}
    </div>
  );
}
