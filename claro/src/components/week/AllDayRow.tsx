import { useEffect, useRef, useState, type ReactNode } from "react";

import { useClaro } from "@/lib/claro-store";
import { formatDayLong } from "@/lib/dates";
import {
  addLabel,
  labelsOf,
  newSpanId,
  removeSpan,
  renameSpan,
  spansOf,
  type LabelSpan,
} from "@/lib/day-labels";
import { readDay } from "@/lib/storage";
import { cn } from "@/lib/utils";
import type { ISODate } from "@/lib/types";

/** What is being written: a new stretch over a range, or an existing one. */
type Editing =
  | { kind: "new"; from: number; to: number }
  | { kind: "span"; spanId: string; from: number; to: number; text: string };

/**
 * The band above the hours: what a day *is*, rather than what is in it.
 *
 * Office day, annual leave, in Berlin, somebody's birthday. Half of what a
 * calendar tells you at a glance is this kind of thing, and none of it belongs
 * at a time: booking annual leave at 9 AM would be a lie about when it
 * applies. Every calendar has a row like this one, and the week grid read thin
 * without it.
 *
 * **Drag across it to cover several days.** Press on Monday, pull to Friday,
 * type once. A single click is the same gesture over one day, so there is one
 * thing to learn rather than two.
 *
 * A stretch is one label per day sharing a `spanId` (see `day-labels.ts`), so
 * this is not a second store: each day still answers for itself, and the bar
 * is only how a run of them is drawn.
 */
export function AllDayRow({ days }: { days: ISODate[] }) {
  const { state, updateDay } = useClaro();
  const [editing, setEditing] = useState<Editing | null>(null);
  /** The columns a drag is covering, before it is let go. */
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);

  const lanes = spansOf(days, (dayId) => labelsOf(readDay(state, dayId)));

  /*
   * The same window-level pointer tracking the grid below uses. A press has to
   * be followed once it leaves the cell it started in, which is the whole
   * point of dragging across days.
   */
  const anchor = useRef<number | null>(null);
  const rangeRef = useRef<{ from: number; to: number } | null>(null);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (anchor.current === null) return;

      const under = document
        .elementFromPoint?.(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-allday]");
      const index = under ? Number(under.dataset.allday) : NaN;
      if (Number.isNaN(index)) return;

      const next = { from: Math.min(anchor.current, index), to: Math.max(anchor.current, index) };
      rangeRef.current = next;
      setRange(next);
    };

    const end = () => {
      const start = anchor.current;
      anchor.current = null;
      if (start === null) return;

      const covered = rangeRef.current ?? { from: start, to: start };
      rangeRef.current = null;
      setRange(null);
      setEditing({ kind: "new", from: covered.from, to: covered.to });
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  const write = (edit: Editing, text: string) => {
    if (edit.kind === "span") {
      for (let i = edit.from; i <= edit.to; i++) {
        updateDay(days[i], (day) => renameSpan(day, edit.spanId, text));
      }
      return;
    }
    if (!text.trim()) return;
    // One id across the whole range, so the days know they are one stretch.
    const spanId = newSpanId();
    for (let i = edit.from; i <= edit.to; i++) {
      updateDay(days[i], (day) => addLabel(day, text, spanId));
    }
  };

  const clear = (edit: Editing) => {
    if (edit.kind !== "span") return;
    for (let i = edit.from; i <= edit.to; i++) {
      updateDay(days[i], (day) => removeSpan(day, edit.spanId));
    }
  };

  /*
   * One spare lane under the drawn ones, so there is always an empty row to
   * start a stretch in and the band is never a wall of existing bars. It is
   * also where a new stretch is typed, which means the editor can never land
   * on top of a bar whatever range was dragged.
   */
  const rows: LabelSpan[][] = [...lanes, []];
  const spare = rows.length - 1;

  return (
    <div className="col-span-full grid grid-cols-subgrid gap-px border-b border-border/70 pb-1">
      {/*
        Styled like the hour rail below rather than as an `.eyebrow`: the
        eyebrow's letter-spacing pushes "all day" past a 3.25rem gutter and it
        wrapped onto two lines, which read as a heading for the whole grid.
      */}
      <span className="self-center whitespace-nowrap pr-1.5 text-right text-[9px] uppercase leading-none text-muted-foreground">
        all day
      </span>

      {rows.map((lane, laneIndex) => (
        <Lane
          key={laneIndex}
          lane={lane}
          laneIndex={laneIndex}
          isSpare={laneIndex === spare}
          days={days}
          range={range}
          editing={editing}
          onPress={(index) => {
            anchor.current = index;
            rangeRef.current = { from: index, to: index };
            setRange({ from: index, to: index });
            setEditing(null);
          }}
          onOpen={(index) => setEditing({ kind: "new", from: index, to: index })}
          onEditSpan={(span) =>
            setEditing({
              kind: "span",
              spanId: span.spanId,
              from: span.from,
              to: span.to,
              text: span.text,
            })
          }
          onCommit={(edit, text) => {
            write(edit, text);
            setEditing(null);
          }}
          onClear={(edit) => {
            clear(edit);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      ))}
    </div>
  );
}

function Lane({
  lane,
  laneIndex,
  isSpare,
  days,
  range,
  editing,
  onPress,
  onOpen,
  onEditSpan,
  onCommit,
  onClear,
  onCancel,
}: {
  lane: LabelSpan[];
  laneIndex: number;
  isSpare: boolean;
  days: ISODate[];
  range: { from: number; to: number } | null;
  editing: Editing | null;
  onPress: (index: number) => void;
  onOpen: (index: number) => void;
  onEditSpan: (span: LabelSpan) => void;
  onCommit: (edit: Editing, text: string) => void;
  onClear: (edit: Editing) => void;
  onCancel: () => void;
}) {
  /*
   * Walked left to right, emitting either a bar spanning its days or one empty
   * cell, so the lane lays out by ordinary grid flow. Placing bars on explicit
   * column lines would work too, right up until the band sits in a subgrid and
   * the numbers stop meaning what they say.
   */
  const cells: ReactNode[] = [];
  const starts = new Map(lane.map((span) => [span.from, span]));

  // Every lane after the first sits under the gutter label, not beside it.
  if (laneIndex > 0) cells.push(<span key="gutter" aria-hidden />);

  for (let index = 0; index < days.length; index++) {
    const span = starts.get(index);

    const open =
      editing &&
      (editing.kind === "span"
        ? span?.spanId === editing.spanId
        : isSpare && editing.from === index);

    if (open && editing) {
      const cover = editing.to - editing.from + 1;
      cells.push(
        <LabelField
          key={`edit-${index}`}
          cover={cover}
          initial={editing.kind === "span" ? editing.text : ""}
          days={days}
          from={editing.from}
          to={editing.to}
          onCommit={(text) => onCommit(editing, text)}
          onClear={() => onClear(editing)}
          onCancel={onCancel}
        />,
      );
      index += cover - 1;
      continue;
    }

    if (span) {
      const width = span.to - span.from + 1;
      cells.push(
        <button
          key={`${span.spanId}-${index}`}
          type="button"
          style={{ gridColumn: `span ${width}` }}
          onClick={() => onEditSpan(span)}
          aria-label={`${span.text}, ${labelRange(days, span.from, span.to)}. Edit`}
          title={span.text}
          className="truncate rounded bg-gold/25 px-1.5 py-0.5 text-left text-[10px] leading-tight text-foreground transition-colors hover:bg-gold/40"
        >
          {span.text}
        </button>,
      );
      index += width - 1;
      continue;
    }

    const covered = range !== null && index >= range.from && index <= range.to;
    cells.push(
      <button
        key={`cell-${index}`}
        type="button"
        data-allday={index}
        onPointerDown={() => onPress(index)}
        // Also reachable without a pointer: a keyboard press opens one day.
        onClick={() => onOpen(index)}
        aria-label={`Add an all day note on ${formatDayLong(days[index])}`}
        className={cn(
          "min-h-[1.15rem] touch-none select-none rounded transition-colors hover:bg-muted/70",
          covered && "bg-primary/20",
        )}
      />,
    );
  }

  return <>{cells}</>;
}

/** The days a bar covers, said once, for anyone who cannot see the bar. */
function labelRange(days: ISODate[], from: number, to: number): string {
  return from === to
    ? formatDayLong(days[from])
    : `${formatDayLong(days[from])} to ${formatDayLong(days[to])}`;
}

function LabelField({
  cover,
  initial,
  days,
  from,
  to,
  onCommit,
  onClear,
  onCancel,
}: {
  cover: number;
  initial: string;
  days: ISODate[];
  from: number;
  to: number;
  onCommit: (text: string) => void;
  onClear: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);

  return (
    <input
      type="text"
      autoFocus
      value={text}
      style={{ gridColumn: `span ${cover}` }}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          // Emptying a stretch is how it is removed: a label with nothing in
          // it is not a label, and a separate delete control for something
          // already cleared is friction nobody needs.
          if (text.trim()) onCommit(text);
          else onClear();
        }
        if (event.key === "Escape") onCancel();
      }}
      onBlur={() => (text.trim() ? onCommit(text) : onCancel())}
      aria-label={`All day note on ${labelRange(days, from, to)}`}
      placeholder="Office day, annual leave, away"
      className="min-w-0 rounded border border-primary/40 bg-card px-1.5 py-0.5 text-[10px] leading-tight outline-none placeholder:text-muted-foreground"
    />
  );
}
