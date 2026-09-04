import { ChevronDown } from "lucide-react";

import { CYCLE_LENGTH_NOTE } from "@/lib/cycle";
import { NO_JUDGEMENT_NOTE, SUPPORT_NOTE } from "@/lib/cycle-guide";
import { OVULATION_NOTE, PHASE_ESTIMATE_NOTE } from "@/lib/cycle-phases";
import { cn } from "@/lib/utils";

/**
 * Everything Claro promises about cycle data, in one place.
 *
 * It used to be said in fragments under every card: the glance carried eighty
 * words of caveat, the calendar forty more, the log another twenty. Each was
 * true and each was there for a reason, and together they made the page
 * something to read rather than something to use, at forty-three per cent
 * prose against eighteen everywhere else in Claro.
 *
 * Saying it once, in full, and leaving it permanently open to anyone who wants
 * it is stronger than saying a third of it five times. Nothing was dropped: the
 * text below is the same set of commitments, and it stays in the document even
 * when collapsed so it is searchable and reachable by a screen reader.
 */
export function WhatClaroDoes({ className }: { className?: string }) {
  return (
    <details className={cn("group", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
        What Claro does with this, and what it will not do
        <ChevronDown
          aria-hidden
          className="h-3 w-3 transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="mt-2.5 space-y-2 border-l-2 border-border pl-3 text-[11px] leading-relaxed text-muted-foreground">
        {/*
          "On this device, and shared with nobody" was one claim doing two jobs.
          The second half still holds absolutely and is the one that matters:
          nothing here reaches another person. The first half became a setting
          rather than a fact once an account could hold a copy, so it is stated
          as the setting it now is.
        */}
        <p>
          Everything here is worked out from the dates you entered, and shared with nobody else. It
          is an estimate, not medical advice.
        </p>
        <p>
          Your cycle notes stay on this device unless you sign in and choose to sync them. If you
          do, they are stored in your own account, readable only when signed in as you.
        </p>
        <p>{PHASE_ESTIMATE_NOTE}</p>
        <p>{CYCLE_LENGTH_NOTE}</p>
        <p>
          {NO_JUDGEMENT_NOTE} It does not diagnose anything, and it never changes your day, week,
          quarter, habits, goals, focus or sound because of what you log here.
        </p>
        <p>{OVULATION_NOTE}</p>
        <p>{SUPPORT_NOTE}</p>
      </div>
    </details>
  );
}
