import { useState } from "react";

import { Picker } from "@/components/Picker";
import {
  SCHEDULE_MINUTES,
  atMinutes,
  formatHourLabel,
  formatTimeLabel,
  hourOf,
  minutesOf,
  parseMinutes,
} from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Day } from "@/lib/types";

/**
 * Moving a block within its hour.
 *
 * The minute is the control rather than a label: an entry that landed on the
 * hour and belongs at quarter past should be draggable there in one tap, not
 * deleted and retyped. On the hour it stays almost invisible until the row is
 * hovered, because eighteen ":00"s down the page is noise.
 *
 * **The four quarters are the quick path, not the vocabulary.** A stand-up at
 * 9:05 and a train at 4:37 are ordinary times, so the panel carries a field
 * for any minute of the hour under its four options — the same shape as the
 * focus block's plain minutes field beside its named presets. `time` was
 * always a string, so nothing about the model had to change for this.
 */
export function MinutePicker({
  time,
  day,
  onChange,
  alwaysVisible = false,
}: {
  time: string;
  day: Day;
  onChange: (time: string) => void;
  /**
   * Kept on screen even at the top of the hour.
   *
   * On a filled row the control hides at :00 so eighteen rows are not eighteen
   * time pickers. On an empty line it is the only way to aim the thing being
   * written, so hiding it is hiding the feature.
   */
  alwaysVisible?: boolean;
}) {
  const hour = hourOf(time);
  const taken = new Set(
    day.scheduleItems
      .filter((item) => item.carriedTo == null && item.time !== time)
      .map((item) => item.time),
  );
  const minutes = minutesOf(time);

  return (
    <Picker
      footer={({ close }) => (
        <ExactMinute
          hour={hour}
          current={minutes}
          isTaken={(slot) => taken.has(slot)}
          onPick={(slot) => {
            onChange(slot);
            close();
          }}
        />
      )}
      value={time}
      onChange={onChange}
      label={`Time of the block at ${formatTimeLabel(time)}`}
      placeholder={formatTimeLabel(time)}
      className="shrink-0"
      triggerClassName={cn(
        "minute-trigger",
        /*
          Hidden at rest on a desktop, where hovering the row reveals it. Always
          there on a touch screen, which has no hover: the control that sets an
          exact minute was unreachable on a phone entirely.
        */
        minutes === 0 &&
          !alwaysVisible &&
          "opacity-60 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-60",
      )}
      options={[...new Set([...SCHEDULE_MINUTES, minutes])]
        .sort((a, b) => a - b)
        .map((m) => atMinutes(hour, m))
        .filter((slot) => slot === time || !taken.has(slot))
        .map((slot) => ({ value: slot, label: formatTimeLabel(slot) }))}
    />
  );
}

/**
 * Any minute of the hour, typed.
 *
 * Refuses rather than corrects. Clamping 75 to 59 would move the block to a
 * time nobody asked for, and an hour that already holds something at that
 * minute says so instead of quietly swapping the two.
 */
function ExactMinute({
  hour,
  current,
  isTaken,
  onPick,
}: {
  hour: string;
  current: number;
  isTaken: (slot: string) => boolean;
  onPick: (time: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [refused, setRefused] = useState<string | null>(null);

  const commit = () => {
    if (draft.trim() === "") return;
    const parsed = parseMinutes(draft);
    if (parsed === null) return setRefused("A minute is 0 to 59.");
    const slot = atMinutes(hour, parsed);
    if (isTaken(slot)) return setRefused(`${formatTimeLabel(slot)} already has something.`);
    setRefused(null);
    setDraft("");
    onPick(slot);
  };

  return (
    <div className="px-1">
      {/*
        Stacked rather than in a row: the panel is sized by its options, which
        are short, and a label and a field side by side ran past its edge.
      */}
      <label className="block text-[10px] text-muted-foreground">
        <span className="block">Or exact minutes</span>
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          placeholder={String(current).padStart(2, "0")}
          onChange={(event) => {
            setDraft(event.target.value);
            setRefused(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
          aria-label={`Minutes past ${formatHourLabel(hour)}`}
          // Same field as the focus block's minutes, so a number typed into
          // Claro looks the same wherever it is typed.
          className="tnum mt-1 w-full rounded-md border border-border bg-card px-2 py-1 text-center text-[0.8rem]"
        />
      </label>
      {refused && (
        <p role="status" className="mt-1 text-[10px] text-muted-foreground">
          {refused}
        </p>
      )}
    </div>
  );
}
