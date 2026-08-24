import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Lock } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { useClaro } from "@/lib/claro-store";
import {
  CLARO_REVIEW_DATE,
  GUIDE_NOTICE,
  GUIDE_SOURCES,
  PHASE_CARDS,
  SUPPORTIVE_PROMPTS,
  SUPPORT_NOTE,
  sourcesFor,
  type GuideSource,
  type PhaseCard,
} from "@/lib/cycle-guide";
import { CYCLE_LENGTH_NOTE } from "@/lib/cycle";
import { notesInPhase, summariseNote } from "@/lib/cycle-timeline";
import { formatDayDate, formatDayShort } from "@/lib/dates";
import type { CycleState, ISODate } from "@/lib/types";

export const Route = createFileRoute("/cycle-guide")({
  component: () => (
    <AppShell>
      <CycleGuide />
    </AppShell>
  ),
  head: () => ({ meta: [{ title: "Understanding your menstrual cycle: Claro" }] }),
});

/**
 * The learning page.
 *
 * It explains what the phases are and, just as deliberately, what a calendar
 * cannot tell anyone. Nothing on this page changes a plan, a habit, a goal, a
 * focus session or a sound: there is not a single write on it apart from
 * following a link away.
 */
export function CycleGuide() {
  const { today, cycle } = useClaro();

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header className="border-b border-border pb-5">
        <Link to="/cycle" className="btn btn-sm btn-quiet gap-1.5">
          <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
          Back to Cycle notes
        </Link>

        <h1 className="display mt-4 text-[2.2rem] leading-[1.1] sm:text-[2.7rem]">
          Understanding your menstrual cycle
        </h1>
        <p className="mt-2 max-w-prose text-[1rem] leading-relaxed text-muted-foreground">
          A guide to estimated cycle phases, your own notes, and questions you may want to explore.
        </p>

        <p className="mt-4 rounded-md border border-border bg-muted/50 px-3 py-2.5 text-[0.85rem] leading-relaxed">
          {GUIDE_NOTICE}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="eyebrow">Before the phases</h2>
        <div className="surface space-y-3 p-5 text-[0.92rem] leading-relaxed">
          <p>
            Cycles differ between people, and they differ between one cycle and the next for the
            same person. There is no single correct length. Claro does not treat 28 days as the
            standard, because for a great many people it is not.
          </p>
          <p>{CYCLE_LENGTH_NOTE}</p>
          <p>
            Everything Claro shows you is worked out from the dates you entered. It is a calendar
            estimate, not a measurement of hormones, and it cannot see inside your body. Where an
            estimate and your own experience disagree, your own notes are the more relevant record.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-baseline gap-2.5">
          <h2 className="eyebrow">The four phases</h2>
          <span className="text-[11px] text-muted-foreground">general education</span>
        </div>
        <div className="space-y-4">
          {PHASE_CARDS.map((card) => (
            <PhaseArticle key={card.id} card={card} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="eyebrow">What feels supportive for you?</h2>
          <span className="text-[11px] text-muted-foreground">your answers, not Claro's</span>
        </div>
        <div className="surface p-5">
          <p className="text-[0.9rem] leading-relaxed">
            These are questions to ask yourself, and there is no right answer to any of them. Claro
            does not tell you what to eat, what supplement to take, what exercise to do, or what
            kind of work suits a phase, because it has no basis for any of that.
          </p>
          <ul className="mt-4 space-y-2">
            {SUPPORTIVE_PROMPTS.map((prompt) => (
              <li key={prompt} className="flex items-start gap-2 text-[0.9rem] leading-relaxed">
                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" />
                {prompt}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <PersonalNotes cycle={cycle} todayId={today} />

      <Sources />

      <section className="border-t border-border/70 pt-6">
        <p className="max-w-prose text-[0.88rem] leading-relaxed text-muted-foreground">
          {SUPPORT_NOTE}
        </p>
      </section>
    </div>
  );
}

function PhaseArticle({ card }: { card: PhaseCard }) {
  const sources = sourcesFor(card);

  return (
    <article className="surface p-5">
      <h3 className="display text-[1.4rem] leading-tight">{card.title}</h3>

      <div className="mt-3 space-y-2.5 text-[0.92rem] leading-relaxed">
        {card.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      {/* Every card states the limit of what a calendar can know. */}
      <p className="mt-4 rounded-md bg-muted/60 px-3 py-2 text-[0.82rem] leading-relaxed text-muted-foreground">
        {card.estimateNote}
      </p>

      <p className="mt-3 text-[0.88rem] leading-relaxed">{card.invitation}</p>

      <p className="mt-3 border-t border-border/70 pt-2.5 text-[11px] leading-relaxed text-muted-foreground">
        Written by Claro from:{" "}
        {sources.map((source, i) => (
          <span key={source.id}>
            {i > 0 && "; "}
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {source.organisation}, {source.title}
            </a>
          </span>
        ))}
      </p>
    </article>
  );
}

/**
 * The user's own notes from around this point in past cycles.
 *
 * Shown only once cycle notes are turned on, and only ever as a list of what
 * they wrote. No conclusion is drawn from it and nothing is changed by it.
 */
function PersonalNotes({ cycle, todayId }: { cycle: CycleState; todayId: ISODate }) {
  if (!cycle.settings.enabled) {
    return (
      <section className="space-y-3">
        <h2 className="eyebrow">Your own notes</h2>
        <div className="surface-quiet p-5">
          <p className="text-[0.9rem] leading-relaxed text-muted-foreground">
            Cycle notes are turned off, so nothing of yours is shown here.
          </p>
          <Link to="/cycle" className="btn btn-sm btn-quiet mt-3">
            Open Cycle notes
          </Link>
        </div>
      </section>
    );
  }

  const notes = notesInPhase(cycle, todayId);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2.5">
        <h2 className="eyebrow flex items-center gap-1.5">
          <Lock aria-hidden className="h-3 w-3" />
          Your own notes
        </h2>
        <span className="text-[11px] text-muted-foreground">private, on this device</span>
      </div>

      <div className="surface p-5">
        {notes.length === 0 ? (
          <p className="text-[0.9rem] leading-relaxed text-muted-foreground">
            Nothing recorded around this estimated point in your past cycles yet.
          </p>
        ) : (
          <>
            <p className="text-[0.9rem] leading-relaxed">
              Here are notes you recorded around this estimated point in past cycles.
            </p>
            <ul className="mt-3 divide-y divide-subtle">
              {notes.map((note) => (
                <li key={note.dayId} className="py-2">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span className="tnum text-[0.85rem]">{formatDayShort(note.dayId)}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {summariseNote(note)}
                    </span>
                  </div>
                  {note.note.trim() !== "" && (
                    <p className="mt-0.5 text-[0.85rem] leading-relaxed">{note.note}</p>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              You may choose to consider these notes while planning. Claro will not change your
              day, week, quarter, habits, goals, focus or sound because of them.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function Sources() {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2.5">
        <h2 className="eyebrow">Sources</h2>
        <span className="text-[11px] text-muted-foreground">
          Claro reviewed on {formatDayDate(CLARO_REVIEW_DATE)}
        </span>
      </div>

      <ul className="paper-panel divide-y divide-subtle px-4">
        {GUIDE_SOURCES.map((source) => (
          <SourceRow key={source.id} source={source} />
        ))}
      </ul>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Summaries above are written in Claro's own words rather than copied from these pages. Dates
        are recorded as each source states them. Where a source names no author, none is shown
        rather than one being supplied.
      </p>
    </section>
  );
}

function SourceRow({ source }: { source: GuideSource }) {
  return (
    <li className="py-3">
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer noopener"
        className="group inline-flex items-baseline gap-1.5 text-[0.9rem] leading-snug underline-offset-2 hover:underline"
      >
        {source.title}
        <ExternalLink aria-hidden className="h-3 w-3 shrink-0 translate-y-0.5" />
      </a>

      <dl className="mt-1.5 grid gap-x-4 gap-y-0.5 text-[11px] leading-relaxed text-muted-foreground sm:grid-cols-2">
        <div className="flex gap-1.5">
          <dt className="shrink-0">Organisation:</dt>
          <dd>{source.organisation}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="shrink-0">Author:</dt>
          <dd>{source.author ?? "None named on the source"}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="shrink-0">Published or reviewed:</dt>
          <dd>{source.published ?? "None stated on the source"}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="shrink-0">Type:</dt>
          <dd>{source.type}</dd>
        </div>
        {source.credentials && (
          <div className="flex gap-1.5 sm:col-span-2">
            <dt className="shrink-0">Credentials:</dt>
            <dd>{source.credentials}</dd>
          </div>
        )}
        <div className="flex gap-1.5 sm:col-span-2">
          <dt className="shrink-0">Claro review date:</dt>
          <dd className="tnum">{formatDayDate(source.reviewed)}</dd>
        </div>
      </dl>
    </li>
  );
}
