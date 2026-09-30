import { useClaro } from "@/lib/claro-store";
import { formatDayShort, weekDayIds, weekOfDay } from "@/lib/dates";
import {
  averageSleep,
  daysOf,
  logOutcome,
  promisesIn,
} from "@/lib/initiatives";
import { countCompletions } from "@/lib/habits";
import { cn } from "@/lib/utils";
import type { Initiative } from "@/lib/types";

/**
 * The initiative over its whole stretch, as counts.
 *
 * **A row of numbers, not a chart.** Promises kept per week is seven or nine
 * figures, and seven figures read faster as figures than as a line somebody
 * has to interpret. A line also invites a trend, and a trend invites a verdict
 * about whether the line is going the right way.
 */
export function InitiativeMonthCard({ initiative }: { initiative: Initiative }) {
  const { state } = useClaro();

  const days = daysOf(initiative);

  /*
   * Grouped by ISO week, which is how the practices are targeted, so a column
   * here means the same stretch the weekly target was set against.
   */
  const weeks = [...new Set(days.map(weekOfDay))].map((weekId) => {
    const inWeek = weekDayIds(weekId).filter((id) => days.includes(id));
    return { weekId, ...promisesIn(state, initiative, inWeek) };
  });

  const named = (wanted: string) =>
    initiative.habitIds
      .map((id) => state.habits[id])
      .find((habit) => habit && habit.name.trim().toLowerCase() === wanted);

  const kept = (wanted: string) => {
    const habit = named(wanted);
    return habit ? countCompletions(state.habitCompletions, habit.id, days) : null;
  };

  const sleep = averageSleep(state, days);
  const drafts = initiative.outcomes
    .map((snapshot) => snapshot.values.find((v) => v.label === "Substack drafts published")?.value)
    .filter((v): v is number => v != null);

  return (
    <section className="surface-quiet p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="eyebrow">{initiative.name}</h2>
        <span className="tnum text-[10px] text-muted-foreground">
          {formatDayShort(initiative.from)} to {formatDayShort(initiative.to)}
        </span>
      </div>

      <div className="mt-4">
        <h3 className="eyebrow text-[9px]">Promises kept, week by week</h3>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {weeks.map((week) => (
            <div key={week.weekId} className="min-w-[2.5rem]">
              <div className="tnum display text-[1.15rem] leading-none">
                {week.due === null ? week.kept : `${week.kept}/${week.due}`}
              </div>
              <div className="tnum mt-1 text-[9px] text-muted-foreground">
                w{Number(week.weekId.split("-W")[1])}
              </div>
            </div>
          ))}
        </div>
      </div>

      <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-3 border-t border-border/70 pt-4">
        <Count label="Lifts" value={kept("lift")} />
        <Count label="Runs" value={kept("run")} />
        <Count label="Wind-downs" value={kept("evening wind-down")} />
        <Count label="Slept" value={sleep} suffix=" of 5" />
        <Count
          label="Drafts shipped"
          value={drafts.length ? Math.max(...drafts) : null}
        />
      </dl>

      <OutcomeNumbers initiative={initiative} />
    </section>
  );
}

function Count({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: number | null;
  suffix?: string;
}) {
  return (
    <div>
      <dt className="eyebrow text-[9px]">{label}</dt>
      <dd className="tnum mt-0.5 display text-[1.25rem] leading-none">
        {value === null ? <span className="text-[0.85rem] text-muted-foreground">·</span> : `${value}${suffix}`}
      </dd>
    </div>
  );
}

/**
 * The outcome numbers, in their own section under everything else.
 *
 * **Deliberately no target, no goal line and no bar.** These are counts of
 * things other people did: followers, replies, whether a draft went out. The
 * practices above are the part anybody can keep a promise about, and putting a
 * progress bar under a follower count would quietly make the wrong half of
 * this page the scoreboard.
 */
function OutcomeNumbers({ initiative }: { initiative: Initiative }) {
  const { updateInitiative } = useClaro();
  if (initiative.outcomes.length === 0) return null;

  return (
    <div className="mt-5 border-t border-border/70 pt-4">
      <div className="flex items-baseline gap-2.5">
        <h3 className="eyebrow text-[9px]">Outcome numbers</h3>
        <span className="text-[10px] text-muted-foreground">logged, not targeted</span>
      </div>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[22rem] border-collapse text-[0.82rem]">
          <thead>
            <tr>
              <th scope="col" className="py-1 pr-3 text-left font-normal text-muted-foreground">
                <span className="sr-only">Number</span>
              </th>
              {initiative.outcomes.map((snapshot) => (
                <th
                  key={snapshot.id}
                  scope="col"
                  className="tnum py-1 pl-3 text-right font-normal text-muted-foreground"
                >
                  {formatDayShort(snapshot.dayId)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(initiative.outcomes[0]?.values ?? []).map((row, index) => (
              <tr key={row.label} className={cn(index > 0 && "border-t border-subtle")}>
                <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                  {row.label}
                </th>
                {initiative.outcomes.map((snapshot) => {
                  const cell = snapshot.values[index];
                  return (
                    <td key={snapshot.id} className="py-1.5 pl-3 text-right">
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={`${row.label} on ${formatDayShort(snapshot.dayId)}`}
                        value={cell?.value ?? ""}
                        placeholder="·"
                        onChange={(event) => {
                          const raw = event.target.value.trim();
                          const parsed = raw === "" ? null : Number(raw);
                          if (parsed !== null && !Number.isFinite(parsed)) return;
                          updateInitiative(initiative.id, (i) =>
                            logOutcome(i, snapshot.dayId, cell.id, parsed),
                          );
                        }}
                        className="tnum w-16 rounded bg-transparent px-1 py-0.5 text-right outline-none placeholder:text-muted-foreground focus:bg-muted"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
