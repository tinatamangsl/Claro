import { useCallback, useEffect, useState } from "react";

import { useClaro } from "@/lib/claro-store";
import * as sound from "@/lib/sound";
import type { SessionMode, SoundPreset, SoundscapeId } from "@/lib/types";

/**
 * The one audio session, as a hook.
 *
 * Playback state lives in the engine module rather than in React, so the header
 * control and the panel inside Focus mode are two views onto the same sound.
 * Mounting a second control can never start a second sound, and unmounting one
 * never stops the sound the other is showing.
 */
export function useSoundSession() {
  const { sound: prefs, setSound } = useClaro();
  const [playing, setPlaying] = useState(false);
  const [supported, setSupported] = useState(true);

  // Read support and current playback after mount: the server has neither.
  useEffect(() => {
    setSupported(sound.isSupported());
    setPlaying(sound.isPlaying());
  }, []);

  /**
   * Mirror the engine so every mounted control agrees about what is happening,
   * including after one of them stops the sound. The engine stays the single
   * source of truth; this only reflects it.
   */
  useEffect(() => {
    const tick = setInterval(() => {
      setPlaying((current) => (current === sound.isPlaying() ? current : sound.isPlaying()));
    }, 400);
    return () => clearInterval(tick);
  }, []);

  // Keep a running sound in step with the stored preference.
  useEffect(() => {
    sound.setLevel(prefs.volume, prefs.muted);
  }, [prefs.volume, prefs.muted]);

  /** Never called on mount, only from a click. */
  const start = useCallback(async () => {
    const started = await sound.play(prefs.soundscape, prefs.volume, prefs.muted);
    setPlaying(started);
    return started;
  }, [prefs.soundscape, prefs.volume, prefs.muted]);

  const pause = useCallback(() => {
    sound.pause();
    setPlaying(false);
  }, []);

  const toggle = useCallback(async () => {
    if (sound.isPlaying()) {
      pause();
      return false;
    }
    return start();
  }, [pause, start]);

  /** Switches soundscape live when something is playing, silently when not. */
  const chooseSoundscape = useCallback(
    (soundscape: SoundscapeId) => {
      setSound({ soundscape });
      sound.select(soundscape, prefs.volume, prefs.muted);
    },
    [setSound, prefs.volume, prefs.muted],
  );

  const chooseMode = useCallback(
    (mode: SessionMode | null) => setSound({ mode }),
    [setSound],
  );

  /**
   * Applies a saved preset. It changes the sound and the stored preference and
   * nothing else: the focus duration is handed back for the caller to use or
   * ignore, so a preset can never silently restart someone's timer.
   */
  const applyPreset = useCallback(
    (preset: SoundPreset) => {
      setSound({ mode: preset.mode, soundscape: preset.soundscape, volume: preset.volume });
      sound.select(preset.soundscape, preset.volume, prefs.muted);
      sound.setLevel(preset.volume, prefs.muted);
      return preset.focusMinutes;
    },
    [setSound, prefs.muted],
  );

  return {
    prefs,
    setSound,
    playing,
    supported,
    start,
    pause,
    toggle,
    chooseSoundscape,
    chooseMode,
    applyPreset,
  };
}
