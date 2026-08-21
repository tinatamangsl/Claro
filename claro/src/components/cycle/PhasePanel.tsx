import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { SUPPORTIVE_PROMPTS } from "@/lib/cycle-guide";
import {
  BAND_LABELS,
  BAND_SHORT,
  CYCLE_BANDS,
  positionOn,
  summariseBand,
  summariseNote,
  notesForBand,
  type CycleBand,
} from "@/lib/cycle-timeline";
import { formatDayShort } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { FEELING_META, type CycleState, type ISODate } from "@/lib/types";

type Props = { cycle: CycleState; todayId: ISODate };

/**
 * Each part of the cycle, as the user's own record of it.
 *
 * This is where a cycle app usually puts "eat protein-rich meals, do gentle
 * movement, avoid heavy work". Claro will not: a calendar estimate cannot tell
 * anyone what their body needs, and a list of foods presented next to a phase
 * reads as instruction however softly it is worded.
 *
 * What replaces it is the one thing that *is* grounded: what this person wrote
 * down last time they were here, and a set of questions they answer for
 * themselves. The physiology lives on the guide page, cited, and stays there.
 */
export function PhasePanel({ cycle, todayId }: Props) {
  const here = positionOn(cycle, todayId);
  const [band, setBand] = useState<CycleBand>(here?.band ?? "early");
  const summary = summariseBand(cycle, band);
  const notes = notesForBand(cycle, band).slice(0, 3);

  return (
    <div className="surface p-5">
      <div className="flex gap-1.5" role="tablist" aria-label="Part of your estimated cycle">
        {CYCLE_BANDS.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={band === option}
            onClick={() => setBand(option)}
            className={cn(
              "flex-1 rounded-lg py-2 text-[0.85rem] transition-colors",
              band === option
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {BAND_SHORT[option]}
            {here?.band === option && <span className="ml-1 text-[10px] opacity-70">now</span>}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <p className="display text-[1.15rem] leading-snug italic">{BAND_LABELS[band]}</p>
        <p className="tnum mt-1 text-[0.82rem] text-muted-foreground">
          {summary.days
            ? `About days ${summary.days.from} to ${summary.days.to} of your own estimated cycle.`
            : "Log a little more history and Claro can work out which days this covers."}
        </p>
      </div>

      {/* What you recorded here before. Counts, never a conclusion. */}
      <div className="mt-4 border-t border-border/70 pt-4">
        <h3 className="eyebrow">What you logged here</h3>
        {summary.notes === 0 ? (
          <p className="mt-1.5 text-[0.88rem] leading-relaxed text-muted-foreground">
            Nothing yet. Notes you write in this part of your cycle collect here.
          </p>
        ) : (
          <>
            <p className="mt-1.5 text-[0.88rem] leading-relaxed">
              {summary.notes} {summary.notes === 1 ? "note" : "notes"} so far
              {summary.commonFeeling
                ? `, most often "${FEELING_META[summary.commonFeeling].label.toLowerCase()}"`
                : ""}
              {summary.lowEnergy > 0
                ? `, with lower energy on ${summary.lowEnergy} of them`
                : ""}
              .
            </p>
            <ul className="mt-2.5 divide-y divide-subtle">
              {notes.map((note) => (
                <li key={note.dayId} className="py-1.5">
                  <span className="tnum text-[11px] text-muted-foreground">
                    {formatDayShort(note.dayId)}
                  </span>{" "}
                  <span className="text-[0.85rem]">
                    {summariseNote(note).toLowerCase() ||
                      (note.feeling ? FEELING_META[note.feeling].label.toLowerCase() : "a note")}
                  </span>
                  {note.note.trim() !== "" && (
                    <p className="mt-0.5 text-[0.85rem] leading-relaxed">{note.note}</p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* The slot where a food and movement plan would go. Questions instead. */}
      <div className="mt-4 border-t border-border/70 pt-4">
        <h3 className="eyebrow">What feels supportive for you?</h3>
        <ul className="mt-2 space-y-1.5">
          {SUPPORTIVE_PROMPTS.map((prompt) => (
            <li key={prompt} className="flex items-start gap-2 text-[0.88rem] leading-relaxed">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" />
              {prompt}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Claro does not tell you what to eat, how to move, or what work to take on. A calendar
          estimate cannot know any of that, and your own notes above are the more useful record.{" "}
          <Link to="/cycle-guide" className="underline underline-offset-2 hover:text-foreground">
            The guide explains the phases, with sources.
          </Link>
        </p>
      </div>
    </div>
  );
}
