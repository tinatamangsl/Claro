/**
 * The 3-3-3 Method.
 *
 * This is an existing planning framework in wide use, popularised by Oliver
 * Burkeman: one meaningful project for a stretch of focused work, three shorter
 * tasks, and three maintenance activities that keep things running. Claro did
 * not invent it, and presents it as one recognised way to shape a day rather
 * than as a Claro prompt.
 *
 * Nothing here duplicates data. The plan writes into the day's existing
 * priorities and action buckets, and progress is read back out of them, so a
 * user who edits the day normally is still working on the same records.
 *
 * The shape is a starting point, not a rule: the hours are adjustable, a
 * partial plan is a perfectly good plan, and nothing scores or scolds.
 */

import { newId } from "./id";
import { writePriority } from "./priorities";
import {
  PLAN_333_DEFAULT_HOURS,
  isPrioritySet,
  type ActionItem,
  type Bucket,
  type Day,
  type ISODate,
} from "./types";

/** Which bucket each part of the framework lands in. */
export const TASK_BUCKET: Bucket = "task";
export const MAINTENANCE_BUCKET: Bucket = "quickTick";

export const PLAN_333_TARGETS = { tasks: 3, maintenance: 3 };

export function isPlanned(day: Day): boolean {
  return day.plan333 !== null;
}

/** Marks the day as planned this way. Existing work is left exactly as it is. */
export function startPlan(
  day: Day,
  now: Date,
  focusHours = PLAN_333_DEFAULT_HOURS,
): Day {
  if (day.plan333) return day;
  return { ...day, plan333: { startedAt: now.toISOString(), focusHours } };
}

/** Adjusts the intended hours. Any positive number is allowed. */
export function setFocusHours(day: Day, focusHours: number): Day {
  if (!day.plan333) return day;
  const hours = Math.min(12, Math.max(0.5, focusHours));
  if (hours === day.plan333.focusHours) return day;
  return { ...day, plan333: { ...day.plan333, focusHours: hours } };
}

/** Leaves the plan behind without touching a single piece of the day's work. */
export function clearPlan(day: Day): Day {
  return day.plan333 ? { ...day, plan333: null } : day;
}

/**
 * The meaningful project is priority 1: the day already has a slot for the one
 * thing that matters most, and a second home for it would be a second truth.
 */
export function setMeaningfulProject(day: Day, text: string, now: Date): Day {
  return { ...day, priority1: writePriority(day.priority1, { text }, day.id, now) };
}

export function meaningfulProject(day: Day): string {
  return day.priority1.text;
}

function addAction(day: Day, text: string, bucket: Bucket, now: Date): Day {
  const trimmed = text.trim();
  if (!trimmed) return day;

  const action: ActionItem = {
    id: newId(),
    text: trimmed,
    bucket,
    done: false,
    createdAt: now.toISOString(),
    originDayId: day.id,
    carriedTo: null,
  };
  return { ...day, actions: [...day.actions, action] };
}

export function addTask(day: Day, text: string, now: Date): Day {
  return addAction(day, text, TASK_BUCKET, now);
}

export function addMaintenance(day: Day, text: string, now: Date): Day {
  return addAction(day, text, MAINTENANCE_BUCKET, now);
}

export function tasksOf(day: Day): ActionItem[] {
  return day.actions.filter((a) => a.bucket === TASK_BUCKET);
}

export function maintenanceOf(day: Day): ActionItem[] {
  return day.actions.filter((a) => a.bucket === MAINTENANCE_BUCKET);
}

export type PlanProgress = {
  hasProject: boolean;
  tasks: number;
  maintenance: number;
  /** True when all three parts have something in them. Never a score. */
  complete: boolean;
};

/**
 * What the day currently holds, read from the real records. A day with fewer
 * than three of anything is simply a day with fewer than three of it.
 */
export function planProgress(day: Day): PlanProgress {
  const hasProject = isPrioritySet(day.priority1);
  const tasks = tasksOf(day).length;
  const maintenance = maintenanceOf(day).length;

  return {
    hasProject,
    tasks,
    maintenance,
    complete:
      hasProject &&
      tasks >= PLAN_333_TARGETS.tasks &&
      maintenance >= PLAN_333_TARGETS.maintenance,
  };
}

/** Minutes for a focus block on the meaningful project, from the chosen hours. */
export function focusBlockMs(day: Day): number {
  const hours = day.plan333?.focusHours ?? PLAN_333_DEFAULT_HOURS;
  return Math.round(hours * 60) * 60_000;
}

/**
 * The hour slots a plan's focus block would occupy, starting from `fromTime`.
 * Returned rather than written, so the caller can show them before committing.
 */
export function focusSlots(day: Day, fromTime: string): string[] {
  const hours = day.plan333?.focusHours ?? PLAN_333_DEFAULT_HOURS;
  const start = Number(fromTime.split(":")[0]);
  const count = Math.max(1, Math.round(hours));

  const slots: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const hour = start + i;
    if (hour > 22) break;
    slots.push(`${String(hour).padStart(2, "0")}:00`);
  }
  return slots;
}

/**
 * Blocks the schedule out for the meaningful project. Occupied hours are left
 * alone: the plan never overwrites something the user already wrote.
 */
export function scheduleFocusBlock(day: Day, fromTime: string): Day {
  const project = meaningfulProject(day).trim();
  if (!project) return day;

  const taken = new Set(day.scheduleItems.map((item) => item.time));
  const free = focusSlots(day, fromTime).filter((time) => !taken.has(time));
  if (free.length === 0) return day;

  return {
    ...day,
    scheduleItems: [
      ...day.scheduleItems,
      ...free.map((time) => ({ id: newId(), time, text: project })),
    ],
  };
}
