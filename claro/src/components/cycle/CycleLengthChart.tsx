import { gaps, sortedEntries } from "@/lib/cycle";
import { cn } from "@/lib/utils";
import { formatDayShort } from "@/lib/dates";
import type { CycleState } from "@/lib/types";

/** A line needs two points. One gap is a number, not a shape. */
export const MIN_GAPS_TO_PLOT = 2;

/** How many recent gaps the chart draws, matching the design's eight. */
export const MAX_GAPS_PLOTTED = 8;

/*
 * The line's own coordinate space. It is stretched to whatever width the card
 * gives it, so these are proportions rather than pixels; nothing with a
 * readable size lives inside it, because a viewBox scales type along with
 * everything else and 13px would land at 7px on a phone.
 */
const VIEW = { w: 640, h: 160, pad: 16 };

/**
 * The gaps between the period starts this person logged, drawn as a line.
 *
 * Every point is arithmetic on two dates the user typed: the number of days
 * from one logged start to the next. There is no model here, no population
 * average, and no projection, which is why the line stops at the last thing
 * they recorded rather than continuing across the panel.
 *
 * **No verdict is passed on the shape.** The supplied design captioned its
 * chart "steady enough that Claro can plan around it. The dip in March lined
 * up with a stretch of short sleep", which reads a cause into a wobble from
 * data that cannot support one, and grades the line on top of it. A short
 * cycle is not a problem and a variable one is not a warning: this draws what
 * was recorded and says how many records it rests on.
 *
 * Unfiltered on purpose. `estimateNext` drops implausible gaps before taking a
 * median, because one mis-log would drag the estimate; a chart of what you
 * actually recorded should show what you actually recorded, including the day
 * you logged by mistake, or there is no way to see it and fix it.
 */
export function CycleLengthChart({ cycle }: { cycle: CycleState }) {
  const entries = sortedEntries(cycle);
  const all = gaps(entries);
  const series = all.slice(-MAX_GAPS_PLOTTED);

  if (series.length < MIN_GAPS_TO_PLOT) {
    return (
      <p className="surface p-4 text-[0.85rem] text-muted-foreground sm:p-5">
        Once you have logged three period starts, the gaps between them are drawn here. There
        {all.length === 1 ? " is 1 gap" : ` are ${all.length} gaps`} so far.
      </p>
    );
  }

  const low = Math.min(...series);
  const high = Math.max(...series);
  // A flat run would otherwise divide by zero and collapse every point onto
  // one edge; two days of headroom keeps a steady line readable as steady.
  const from = low - 2;
  const span = Math.max(high + 2 - from, 1);

  const inner = { w: VIEW.w - VIEW.pad * 2, h: VIEW.h - VIEW.pad * 2 };
  const x = (i: number) =>
    VIEW.pad + (series.length === 1 ? inner.w / 2 : (i / (series.length - 1)) * inner.w);
  const y = (days: number) => VIEW.pad + inner.h - ((days - from) / span) * inner.h;

  const points = series.map((days, i) => `${x(i)},${y(days)}`).join(" ");
  /*
   * The end points are anchored inward so neither runs off the edge of the box.
   * A point on a line is a shape and not a number: without the figures printed
   * on it the only way to read a value is the range in the caption, which
   * leaves a sighted reader with less than the aria-label already gives a
   * screen reader.
   */
  // Percentages, so the labels sit over the line at any width. The end points
  // are pulled inward so neither runs off the edge of the card.
  const at = (i: number) => ({
    left: `${(x(i) / VIEW.w) * 100}%`,
    transform: i === 0 ? "none" : i === series.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
  });
  // The start date each gap was measured to, so a point can be placed in time.
  // Drawn inside the same box as the points, so the two cannot drift apart.
  const dates = entries.slice(-series.length).map((entry) => formatDayShort(entry.startDate));

  return (
    <div className="surface p-4 sm:p-5">
      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Your last ${series.length} recorded cycle lengths, in days: ${series.join(", ")}.`}
          className="block h-[150px] w-full"
        >
          {[0, 0.5, 1].map((line) => (
            <line
              key={line}
              x1={0}
              x2={VIEW.w}
              y1={VIEW.pad + inner.h * line}
              y2={VIEW.pad + inner.h * line}
              className="stroke-border"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <polyline
            points={points}
            fill="none"
            className="stroke-primary"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/*
          The points and their figures live outside the viewBox. The box is
          stretched to the card's width, which would draw every circle as an
          ellipse and shrink every number; out here a dot stays round and a
          label stays legible, and both read the same x() the line does, so
          they cannot drift off it.
        */}
        {series.map((days, i) => (
          <span key={`p${i}`}>
            <span
              data-point={days}
              style={{ left: `${(x(i) / VIEW.w) * 100}%`, top: `${(y(days) / VIEW.h) * 100}%` }}
              className={cn(
                "absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary",
                i === series.length - 1 ? "bg-primary" : "bg-background",
              )}
            />
            <span
              style={{ ...at(i), top: `${(y(days) / VIEW.h) * 100}%` }}
              className="tnum absolute -mt-6 text-[11px] text-muted-foreground"
            >
              {days}
            </span>
          </span>
        ))}
      </div>

      <div className="relative mt-1 h-4">
        {dates.map((date, i) => (
          <span
            key={`d${i}`}
            style={at(i)}
            className="tnum absolute top-0 text-[10px] whitespace-nowrap text-muted-foreground"
          >
            {date}
          </span>
        ))}
      </div>

      <p className="mt-3 max-w-prose text-[0.85rem] leading-relaxed text-muted-foreground">
        Each point is the number of days between two period starts you logged. Drawn from{" "}
        {all.length} recorded {all.length === 1 ? "gap" : "gaps"}
        {all.length > series.length ? `, the last ${series.length} shown` : ""}. Between{" "}
        <span className="tnum">{low}</span> and <span className="tnum">{high}</span> days.
      </p>
    </div>
  );
}
