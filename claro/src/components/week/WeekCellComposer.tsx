import { useState } from "react";

import { MinutePicker } from "@/components/MinutePicker";
import { useClaro } from "@/lib/claro-store";
import { formatDayLong, formatTimeLabel } from "@/lib/dates";
import { addEntry, slotFor, type WeekEntryKind } from "@/lib/week-plan";
import { readDay } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { BUCKET_META, type ISODate } from "@/lib/types";

/** The four things a cell can make, in the order the day itself uses them. */
const KINDS: { kind: WeekEntryKind; label: string }[] = [
  { kind: "block", label: "Block" },
  { kind: "task", label: BUCKET_META.task.short },
  { kind: "quickTick", label: BUCKET_META.quickTick.short },
  { kind: "project", label: BUCKET_META.project.short },
];

/**
 * Writing into one cell of the week grid.
 *
 * Inline, like every other editor in Claro, and it stays open after Enter so a
 * Tuesday afternoon can be filled in one sitting rather than one click per
 * line. The kind chosen is remembered for the next line in the same cell,
 * because somebody blocking out a morning is usually making the same sort of
 * thing four times over.
 *
 * It writes through `updateDay`, the writer Daily uses, so a task made here is
 * the same record Daily shows and the two can never disagree.
 */
export function WeekCellComposer({
  dayId,
  hour,
  onClose,
}: {
  dayId: ISODate;
  hour: string;
  onClose: () => void;
}) {
  const { state, updateDay } = useClaro();
  const [kind, setKind] = useState<WeekEntryKind>("block");
  const [text, setText] = useState("");
  /*
   * The minute, once it has been chosen deliberately.
   *
   * Until then the cell offers the next free slot of the hour that was
   * clicked, which is right nearly always. Null rather than that slot, so the
   * offer keeps moving as lines are added: type three things into 2 PM and
   * they land at 2:00, 2:15 and 2:30 without touching the control once.
   */
  const [picked, setPicked] = useState<string | null>(null);

  const day = readDay(state, dayId);
  const time = picked ?? slotFor(day, hour);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    updateDay(dayId, (d) => addEntry(d, time, trimmed, kind, new Date()));
    setText("");
    // The minute was for the line just written; the next one starts fresh.
    setPicked(null);
  };

  return (
    <div
      className="rounded-md border border-primary/40 bg-card p-1 shadow-sm"
      // A click inside the editor is not a click on the empty cell behind it,
      // which would otherwise close and reopen it under the pointer.
      onClick={(event) => event.stopPropagation()}
    >
      <input
        type="text"
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
          if (event.key === "Escape") onClose();
        }}
        onBlur={(event) => {
          // Leaving for the kind buttons is still being in the editor.
          if (event.currentTarget.parentElement?.contains(event.relatedTarget)) return;
          submit();
          onClose();
        }}
        aria-label={`New entry on ${formatDayLong(dayId)} at ${formatTimeLabel(time)}`}
        placeholder={formatTimeLabel(time)}
        className="w-full rounded bg-transparent px-1 py-0.5 text-[11px] leading-tight outline-none placeholder:text-muted-foreground"
      />

      <div className="mt-0.5 flex flex-wrap items-center gap-0.5">
        {/*
          Any minute of the hour, not just the one the cell picked. A stand-up
          at 9:05 and a train at 4:37 are ordinary times, and the same control
          the day view uses answers for both here.
        */}
        <MinutePicker time={time} day={day} onChange={setPicked} alwaysVisible />
        {KINDS.map((option) => (
          <button
            key={option.kind}
            type="button"
            aria-pressed={kind === option.kind}
            onClick={() => setKind(option.kind)}
            className={cn(
              "rounded px-1 py-0.5 text-[9px] leading-none transition-colors",
              kind === option.kind
                ? "bg-gold/30 text-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
