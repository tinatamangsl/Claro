import { Check, Timer, X } from "lucide-react";
import { useState } from "react";

import { AddItem } from "@/components/AddItem";
import { formatHourLabel } from "@/lib/dates";
import {
  PLAN_333_TARGETS,
  maintenanceOf,
  meaningfulProject,
  planProgress,
  tasksOf,
} from "@/lib/plan333";
import { cn } from "@/lib/utils";
import type { Day } from "@/lib/types";

type Props = {
  day: Day;
  onStart: () => void;
  onClear: () => void;
  onSetHours: (hours: number) => void;
  onAddTask: (text: string) => void;
  onAddMaintenance: (text: string) => void;
  onSchedule: (fromTime: string) => void;
  onFocus: () => void;
};

const HOUR_CHOICES = [1, 1.5, 2, 3, 4];
const START_CHOICES = ["07:00", "09:00", "10:00", "13:00", "14:00"];

/**
 * The 3-3-3 Method, offered as one recognised way to shape a day.
 *
 * The framework is not Claro's: it is credited where it is introduced. What the
 * flow does is write into the day's existing records, so nothing is duplicated
 * and the ordinary Today page stays the single place the work lives.
 *
 * An unfinished plan is a normal outcome. There is no score, no reward and no
 * language that treats a partial day as a failure.
 */
export function Plan333({
  day,
  onStart,
  onClear,
  onSetHours,
  onAddTask,
  onAddMaintenance,
  onSchedule,
  onFocus,
}: Props) {
  const [scheduling, setScheduling] = useState(false);
  const plan = day.plan333;

  if (!plan) {
    return (
      <section className="card-dashed px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h2 className="eyebrow">Plan with the 3-3-3 Method</h2>
            <p className="mt-1 max-w-prose text-[0.85rem] leading-relaxed text-muted-foreground">
              A widely used framework, popularised by Oliver Burkeman: one meaningful project
              for a stretch of focused work, three shorter tasks, and three maintenance
              activities. Shape it around your actual day.
            </p>
          </div>
          <button type="button" onClick={onStart} className="btn btn-sm btn-quiet shrink-0">
            Start a 3-3-3 day
          </button>
        </div>
      </section>
    );
  }

  const progress = planProgress(day);
  const project = meaningfulProject(day).trim();
  const tasks = tasksOf(day);
  const maintenance = maintenanceOf(day);

  return (
    <section className="surface px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-2">
          <h2 className="eyebrow">Your 3-3-3 day</h2>
          <span className="text-[10px] text-muted-foreground">
            a recognised framework, adapted to you
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <X aria-hidden className="h-3 w-3" />
          Put the plan away
        </button>
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <Area
          heading="One meaningful project"
          filled={progress.hasProject}
          count={progress.hasProject ? "Set" : "Not set yet"}
        >
          {project ? (
            <p className="text-[0.85rem] leading-snug">{project}</p>
          ) : (
            <p className="text-[0.8rem] leading-snug text-muted-foreground">
              Write it into priority 1 above.
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">Time for it</span>
            {HOUR_CHOICES.map((hours) => (
              <button
                key={hours}
                type="button"
                aria-pressed={plan.focusHours === hours}
                onClick={() => onSetHours(hours)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                  plan.focusHours === hours
                    ? "border-gold bg-gold/15 text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/40",
                )}
              >
                {hours}h
              </button>
            ))}
          </div>
        </Area>

        <Area
          heading="Three shorter tasks"
          filled={tasks.length >= PLAN_333_TARGETS.tasks}
          count={`${tasks.length} of ${PLAN_333_TARGETS.tasks}`}
        >
          <ul className="space-y-0.5">
            {tasks.slice(0, 4).map((task) => (
              <li key={task.id} className="text-[0.8rem] leading-snug text-muted-foreground">
                {task.text}
              </li>
            ))}
          </ul>
          <AddItem
            label="Add a task"
            placeholder="Something that takes minutes, not hours"
            className="mt-1 text-[0.8rem]"
            onAdd={onAddTask}
          />
        </Area>

        <Area
          heading="Three maintenance activities"
          filled={maintenance.length >= PLAN_333_TARGETS.maintenance}
          count={`${maintenance.length} of ${PLAN_333_TARGETS.maintenance}`}
        >
          <ul className="space-y-0.5">
            {maintenance.slice(0, 4).map((item) => (
              <li key={item.id} className="text-[0.8rem] leading-snug text-muted-foreground">
                {item.text}
              </li>
            ))}
          </ul>
          <AddItem
            label="Add a maintenance job"
            placeholder="The things that keep life running"
            className="mt-1 text-[0.8rem]"
            onAdd={onAddMaintenance}
          />
        </Area>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
        {scheduling ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Block it out from</span>
            {START_CHOICES.map((time) => (
              <button
                key={time}
                type="button"
                onClick={() => {
                  onSchedule(time);
                  setScheduling(false);
                }}
                className="btn btn-sm btn-quiet"
              >
                {formatHourLabel(time)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setScheduling(false)}
              className="btn btn-sm btn-ghost"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setScheduling(true)}
              disabled={!project}
              className="btn btn-sm btn-quiet disabled:opacity-45"
            >
              Block out the schedule
            </button>
            <button
              type="button"
              onClick={onFocus}
              disabled={!project}
              className="btn btn-sm btn-primary gap-1.5 disabled:opacity-45"
            >
              <Timer aria-hidden className="h-3.5 w-3.5" />
              Focus on the project
            </button>
          </>
        )}

        <span className="ml-auto text-[10px] text-muted-foreground">
          {progress.complete
            ? "All three areas have something in them."
            : "Fill in what is useful. A partial plan is fine."}
        </span>
      </div>
    </section>
  );
}

function Area({
  heading,
  filled,
  count,
  children,
}: {
  heading: string;
  filled: boolean;
  count: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[0.8rem] font-medium tracking-tight">{heading}</h3>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 text-[10px]",
            filled ? "text-positive" : "text-muted-foreground",
          )}
        >
          {filled && <Check aria-hidden className="h-3 w-3" />}
          {count}
        </span>
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
