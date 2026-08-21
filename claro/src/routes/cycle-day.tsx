import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Lock } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { DayEvening } from "@/components/cycle/day/DayEvening";
import { DayForecast } from "@/components/cycle/day/DayForecast";
import { DayGuide } from "@/components/cycle/day/DayGuide";
import { DayLog } from "@/components/cycle/day/DayLog";
import { DayRecalibrate } from "@/components/cycle/day/DayRecalibrate";
import { useNow } from "@/hooks/use-now";
import { useClaro } from "@/lib/claro-store";
import { addPeriod, checkInOn, endPeriod, ongoingPeriod } from "@/lib/cycle";
import { isEveningDone, isLogged, type PeriodAnswer } from "@/lib/cycle-log";
import { shiftDayId } from "@/lib/dates";
import { newId } from "@/lib/id";
import { changesSince, snapshotNow } from "@/lib/cycle-recalibration";

/** The end-of-day check-in is offered from six, not demanded at any hour. */
const EVENING_HOUR = 18;

type View = "log" | "guide" | "forecast" | "evening";

const VIEWS: View[] = ["log", "guide", "forecast", "evening"];

export const Route = createFileRoute("/cycle-day")({
  // A genuinely optional key, so `search` stays optional on every Link here.
  validateSearch: (search: Record<string, unknown>): { view?: View } =>
    typeof search.view === "string" && VIEWS.includes(search.view as View)
      ? { view: search.view as View }
      : {},
  component: () => (
    <AppShell>
      <CycleDay />
    </AppShell>
  ),
  head: () => ({ meta: [{ title: "Cycle today: Claro" }] }),
});

/**
 * The daily cycle flow, on one route: log, then what your own notes show, with
 * the seven-day view and the end-of-day check-in reachable from it.
 *
 * The view is a search param rather than four routes, so each screen is
 * linkable and browser-back is the way out, and the nav stays four items.
 *
 * Nothing in this flow writes to a priority, a habit, a goal, a schedule, a
 * focus session or a sound. It reads planning data to show the user their own
 * first priority, and that is the whole of its contact with the plan.
 */
export function CycleDay() {
  const {
    today,
    cycle,
    day,
    writeCycleCheckIn,
    acknowledgeCycleEstimate,
    setCycleEntries,
    setCycleEnabled,
  } = useClaro();
  const { view } = Route.useSearch();
  const navigate = useNavigate();
  const now = useNow(60_000);
  const note = checkInOn(cycle, today);

  /*
   * Decided once, on arrival. Deriving it on every render would throw the user
   * off the log screen the instant they tapped their first control, because the
   * day would then count as logged. Moving on is what "log it" is for.
   */
  const [landing] = useState<View>(() => (isLogged(note) ? "guide" : "log"));

  const go = (next: View) => navigate({ to: "/cycle-day", search: { view: next } });

  /**
   * The period answer from the first step of the log.
   *
   * It goes through the same `addPeriod` and `endPeriod` rules as the calendar,
   * so a duplicate or an overlap is refused here exactly as it is there. A
   * refusal is silent on this screen by design: the flow is three taps, and
   * "that date is already logged" is not a thing to stop somebody for. The
   * cycle calendar is where a conflict gets explained and resolved.
   */
  const logPeriod = (answer: PeriodAnswer) => {
    if (answer.kind === "none") return;

    if (answer.kind === "ended") {
      const open = ongoingPeriod(cycle);
      if (!open) return;
      const closed = endPeriod(cycle, open.id, today, today);
      if (closed.ok) setCycleEntries(closed.entries);
      return;
    }

    const startDate = shiftDayId(today, -answer.daysAgo);
    const added = addPeriod(cycle, { startDate, endDate: null }, newId(), new Date(), today);
    if (added.ok) setCycleEntries(added.entries);
  };

  if (!cycle.settings.enabled) return <NotOn onEnable={() => setCycleEnabled(true, new Date())} />;

  const changes = changesSince(cycle);

  // The estimate moved, so it is reported before anything else and exactly once.
  if (changes.length > 0 && view !== "forecast" && view !== "evening") {
    return (
      <Frame>
        <DayRecalibrate
          changes={changes}
          onAcknowledge={() => acknowledgeCycleEstimate(snapshotNow(cycle, new Date()))}
          onOpenNotes={() => navigate({ to: "/cycle" })}
        />
      </Frame>
    );
  }

  const resolved: View = view ?? landing;
  const eveningReady =
    now !== null && now.getHours() >= EVENING_HOUR && isLogged(note) && !isEveningDone(note);

  return (
    <Frame>
      {resolved === "log" && (
        <DayLog
          cycle={cycle}
          todayId={today}
          note={note}
          onWrite={(patch) => writeCycleCheckIn(today, patch, new Date())}
          onPeriod={logPeriod}
          onDone={() => go("guide")}
        />
      )}

      {resolved === "guide" && (
        <DayGuide
          cycle={cycle}
          todayId={today}
          day={day(today)}
          eveningReady={eveningReady}
          onForecast={() => go("forecast")}
          onEvening={() => go("evening")}
        />
      )}

      {resolved === "forecast" && (
        <DayForecast
          cycle={cycle}
          todayId={today}
          priorityFor={(dayId) => day(dayId).priority1}
          onBack={() => go("guide")}
        />
      )}

      {resolved === "evening" && (
        <DayEvening
          note={note}
          onWrite={(patch) => writeCycleCheckIn(today, patch, new Date())}
          onDone={() => go("guide")}
        />
      )}
    </Frame>
  );
}

/** One narrow column, because this flow is designed for a phone first. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[26rem] px-1 pb-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link to="/cycle" aria-label="Back to cycle notes" className="btn btn-sm btn-icon btn-ghost">
          <ArrowLeft aria-hidden className="h-4 w-4" />
        </Link>
        <span className="text-[11px] lowercase text-muted-foreground">cycle</span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Lock aria-hidden className="h-3 w-3" />
          private
        </span>
      </div>
      {children}
    </div>
  );
}

/** Consent first, here as everywhere else that touches cycle data. */
function NotOn({ onEnable }: { onEnable: () => void }) {
  return (
    <div className="mx-auto w-full max-w-[26rem] px-1 py-8 text-center">
      <h1 className="display text-[1.6rem] leading-snug">Cycle notes are off</h1>
      <p className="mt-3 text-[0.9rem] leading-relaxed text-muted-foreground">
        Turn them on and Claro will keep a private record of what you log, on this device. It gives
        no medical, fertility or health advice, and it changes none of your plans.
      </p>
      <button type="button" onClick={onEnable} className="btn btn-primary mt-6">
        Turn on cycle notes
      </button>
    </div>
  );
}
