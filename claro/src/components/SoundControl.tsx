import { Waves } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { SoundPanel } from "@/components/SoundPanel";
import { useSoundSession } from "@/hooks/use-sound-session";
import { SOUNDSCAPE_META } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The header's sound control: a state indicator and a way into the panel.
 *
 * It shares the one audio session with the panel inside Focus mode, so opening
 * controls in two places shows the same sound rather than starting another.
 */
export function SoundControl() {
  const { playing, supported, prefs } = useSoundSession();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement | null>(null);

  // Close on an outside click or Escape, the way a small popover should.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!supported) return null;

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={
          playing
            ? `Sound settings. Playing ${SOUNDSCAPE_META[prefs.soundscape].label.toLowerCase()}`
            : "Sound settings"
        }
        className={cn("btn btn-sm btn-ghost gap-1.5", playing && "text-foreground")}
      >
        <Waves aria-hidden className={cn("h-3.5 w-3.5", playing && "text-gold")} />
        <span className="hidden sm:inline">{playing ? "Sound on" : "Sound"}</span>
      </button>

      {open && (
        <div className="surface absolute top-full right-0 z-40 mt-2 max-h-[min(70vh,34rem)] w-72 overflow-y-auto p-4">
          <SoundPanel compact />
        </div>
      )}
    </div>
  );
}
