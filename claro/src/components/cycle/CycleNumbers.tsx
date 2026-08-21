import { useState } from "react";

import {
  CYCLE_LENGTH_NOTE,
  clampStatedCycleLength,
  durationHistory,
  estimateNext,
  formatWeeksAndDays,
} from "@/lib/cycle";
import { NO_JUDGEMENT_NOTE } from "@/lib/cycle-guide";
import { positionOn } from "@/lib/cycle-timeline";
import { formatDayDate } from "@/lib/dates";
import {
  MAX_STATED_CYCLE_DAYS,
  MIN_STATED_CYCLE_DAYS,
  type CycleState,
  type ISODate,
} from "@/lib/types";

type Props = {
  cycle: CycleState;
  todayId: ISODate;
  onSetLength: (days: number | null) => void;
};

/**
 * The numbers, worked out from the user's own dates.
 *
 * Deliberately the only calculators here. The apps this page takes its shape
 * from offer ovulation, fertile window, implantation, HCG, pregnancy test and
 * due date calculators; every one of those is a fertility or pregnancy
 * prediction, which a calendar cannot support and Claro will not imply. What is
 * left is arithmetic anyone can check: how long your cycles run, how long your
 * periods lasted, when the next one is estimated, and which cycle day a date
 * falls on.
 */
export function CycleNumbers({ cycle, todayId, onSetLength }: Props) {
  const estimate = estimateNext(cycle);
  const durations = durationHistory(cycle);
  const [lookup, setLookup] = useState<ISODate>(todayId);
  const asked = positionOn(cycle, lookup);

  return (
    <div className="surface p-5">
      <dl className="grid gap-4 sm:grid-cols-3">
        <Figure
          label="Your usual cycle length"
          value={estimate ? formatWeeksAndDays(estimate.typicalGap) : "Not yet"}
          note={
            !estimate
              ? "Log a period start, then tell Claro roughly how long your cycle runs."
              : estimate.source === "logged"
                ? `${estimate.typicalGap} days, the median of ${estimate.basedOn} recorded ${estimate.basedOn === 1 ? "gap" : "gaps"}.`
                : `${estimate.typicalGap} days, the figure you entered. Your own logged gaps take over once there are three starts.`
          }
        />
        <Figure
          label="How long your periods lasted"
          value={durations ? `${durations.min} to ${durations.max} days` : "Not yet"}
          note={
            durations
              ? `Your last one lasted ${durations.last} ${durations.last === 1 ? "day" : "days"}, across ${durations.of} recorded.`
              : "Add an end date to a period and this appears."
          }
        />
        <Figure
          label="Next period, estimated"
          value={estimate ? formatDayDate(estimate.nextStart) : "Not yet"}
          note={
            estimate
              ? "An estimate from your own dates. Cycles vary."
              : "Needs a little more history first."
          }
        />
      </dl>

      <CycleLengthField
        stated={cycle.settings.cycleLength}
        usingStated={estimate?.source === "stated"}
        onSet={onSetLength}
      />

      {/* The one lookup worth having: which cycle day a date falls on. */}
      <div className="mt-5 border-t border-border/70 pt-4">
        <label className="flex flex-wrap items-end gap-3">
          <span className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground">
              Which cycle day is a date?
            </span>
            <input
              type="date"
              value={lookup}
              aria-label="Look up the cycle day for a date"
              onChange={(e) => setLookup(e.target.value)}
              className="tnum rounded-md border border-border bg-card px-2.5 py-1.5 text-[0.88rem]"
            />
          </span>
          <span className="pb-1.5 text-[0.9rem]">
            {asked ? (
              <>
                <span className="tnum font-medium">Day {asked.day}</span>
                <span className="text-muted-foreground"> of about {asked.ofAbout}</span>
              </>
            ) : (
              <span className="text-muted-foreground">
                Not enough logged dates to count from.
              </span>
            )}
          </span>
        </label>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        {CYCLE_LENGTH_NOTE} {NO_JUDGEMENT_NOTE}
      </p>
    </div>
  );
}

/**
 * The length the user says their cycle usually runs.
 *
 * It exists so the calendar can show something on day one instead of asking
 * somebody to log three periods before it is any use. It is their figure, said
 * to be theirs, and it steps aside the moment their real gaps can answer
 * better. Weeks are offered because that is how people say it out loud; days
 * remain what is stored.
 */
function CycleLengthField({
  stated,
  usingStated,
  onSet,
}: {
  stated: number | null;
  usingStated: boolean;
  onSet: (days: number | null) => void;
}) {
  const [text, setText] = useState(stated === null ? "" : String(stated));

  const commit = () => {
    if (text.trim() === "") {
      onSet(null);
      return;
    }
    const days = clampStatedCycleLength(Number(text));
    onSet(days);
    setText(days === null ? "" : String(days));
  };

  const weeks = stated === null ? null : formatWeeksAndDays(stated);

  return (
    <div className="mt-5 border-t border-border/70 pt-4">
      <label className="flex flex-wrap items-end gap-3">
        <span className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">
            How long is your cycle usually?
          </span>
          <span className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={MIN_STATED_CYCLE_DAYS}
              max={MAX_STATED_CYCLE_DAYS}
              value={text}
              placeholder="28"
              aria-label="Your usual cycle length in days"
              onChange={(e) => setText(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                }
              }}
              className="tnum w-20 rounded-md border border-border bg-card px-2.5 py-1.5 text-[0.88rem]"
            />
            <span className="text-[0.85rem] text-muted-foreground">days</span>
          </span>
        </span>

        <span className="pb-1.5 text-[0.85rem] text-muted-foreground">
          {weeks ? `That is ${weeks}.` : `Between ${MIN_STATED_CYCLE_DAYS} and ${MAX_STATED_CYCLE_DAYS} days.`}
        </span>
      </label>

      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        {usingStated
          ? "The calendar is using this figure until you have logged three starts, then it switches to the median of your own gaps."
          : "Used only until your own logged gaps can answer better. Leave it empty to rely on your dates alone."}
      </p>
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className="tnum mt-0.5 text-[1.05rem] leading-tight font-medium">{value}</dd>
      <dd className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{note}</dd>
    </div>
  );
}
