import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown, ChevronRight, ExternalLink, Lock } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { PHASE_ORDINALS, PhaseRing, RING_PHASES } from "@/components/cycle/PhaseRing";
import { useClaro } from "@/lib/claro-store";
import { useDebouncedField } from "@/hooks/use-debounced-field";
import {
  CLARO_REVIEW_DATE,
  ESTIMATE_BAND,
  GUIDE_NOTICE,
  GUIDE_PROMPTS,
  GUIDE_SOURCES,
  MYTHS,
  PHASE_CARDS,
  PROMPTS_INTRO,
  SUPPORT_NOTE,
  sourcesFor,
  type GuidePrompt,
  type GuideSource,
  type PhaseCard,
} from "@/lib/cycle-guide";
import { cn } from "@/lib/utils";
import { CYCLE_LENGTH_NOTE } from "@/lib/cycle";
import { notesInPhase, summariseNote } from "@/lib/cycle-timeline";
import { formatDayDate, formatDayShort } from "@/lib/dates";
import type { CycleState, ISODate } from "@/lib/types";

export const Route = createFileRoute("/cycle-guide")({
  component: () => (
    // The same width as /cycle. These two link to each other constantly, and
    // chrome that changes size between them is the most visible kind of
    // incoherence there is.
    <AppShell wide>
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
    <div className="space-y-14">
      <header>
        <p className="eyebrow flex items-center gap-2">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
          Claro · Learn
        </p>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div>
            <h1 className="display text-[2.2rem] leading-[1.1] sm:text-[2.8rem]">
              Four phases. Tap one.
            </h1>
            <p className="mt-2 max-w-prose text-[1rem] leading-relaxed text-muted-foreground">
              No two cycles match, not even your own. Here is what each stretch is, in plain words.
            </p>
          </div>
          <Link
            to="/cycle"
            className="flex shrink-0 items-center gap-1.5 text-[0.9rem] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
            Back to Cycle
          </Link>
        </div>
      </header>

      <PhaseExplorer />

      <Myths />

      <Prompts answers={cycle.guideAnswers} />

      <PersonalNotes cycle={cycle} todayId={today} />

      <Sources />

      <section className="border-t border-border/70 pt-6 space-y-3">
        <p className="max-w-prose text-[0.88rem] leading-relaxed text-muted-foreground">
          {GUIDE_NOTICE}
        </p>
        <p className="max-w-prose text-[0.88rem] leading-relaxed text-muted-foreground">
          {SUPPORT_NOTE}
        </p>
      </section>
    </div>
  );
}

/**
 * The four phases, one at a time, with the ring for context.
 *
 * One card visible rather than four stacked was the whole point of the
 * redesign: the page was four long articles in a column, which is a document
 * somebody scrolls past rather than a thing they read. The paragraphs are all
 * still here, under "go deeper", along with the sources for each.
 */
function PhaseExplorer() {
  const [index, setIndex] = useState(0);
  const [deeper, setDeeper] = useState(false);
  const card = PHASE_CARDS[index];
  const phase = RING_PHASES[index];

  return (
    <section>
      <h2 className="sr-only">The four phases</h2>

      <div className="grid items-start gap-8 min-[860px]:grid-cols-[minmax(0,1fr)_1.55fr]">
        <PhaseRing
          selected={phase}
          ordinal={PHASE_ORDINALS[index]}
          name={card.short}
          span={card.span}
        />

        <div>
          <div role="tablist" aria-label="Cycle phases" className="flex flex-wrap gap-2">
            {PHASE_CARDS.map((option, i) => (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                onClick={() => {
                  setIndex(i);
                  // A phase somebody has just chosen should open at its summary,
                  // not halfway down the last one's sources.
                  setDeeper(false);
                }}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3.5 py-2 text-[0.85rem] transition-colors",
                  i === index
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  aria-hidden
                  className={cn("h-2 w-2 rounded-full", `phase-key-${RING_PHASES[i]}`)}
                />
                {option.short}
              </button>
            ))}
          </div>

          <article className="surface mt-4 p-5 sm:p-7">
            <p className="display text-[1.3rem] leading-[1.35] sm:text-[1.5rem]">{card.lead}</p>

            <dl className="mt-5">
              {card.facts.map((fact) => (
                <div
                  key={fact.label}
                  className="grid gap-x-5 gap-y-1 border-t border-border/60 py-3.5 sm:grid-cols-[6.5rem_1fr]"
                >
                  <dt className="eyebrow pt-0.5">{fact.label}</dt>
                  <dd className="text-[0.92rem] leading-relaxed">{fact.text}</dd>
                </div>
              ))}
            </dl>

            <button
              type="button"
              onClick={() => setDeeper((open) => !open)}
              aria-expanded={deeper}
              aria-controls={`deeper-${card.id}`}
              className="eyebrow mt-2 flex items-center gap-2 hover:text-foreground"
            >
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
              {deeper ? "Show less" : "Go deeper"}
            </button>

            {deeper && (
              <div id={`deeper-${card.id}`} className="mt-4 border-t border-border/60 pt-4">
                <div className="space-y-2.5 text-[0.92rem] leading-relaxed">
                  {card.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
                <p className="mt-4 rounded-md bg-muted/60 px-3 py-2 text-[0.82rem] leading-relaxed text-muted-foreground">
                  {card.estimateNote}
                </p>
                <p className="mt-3 text-[0.88rem] leading-relaxed text-muted-foreground">
                  {card.invitation}
                </p>
                <CardSources card={card} />
              </div>
            )}
          </article>

          {/*
            The caveat sits under the card rather than inside it. Inside, it
            reads as one more fact about the phase; under, it is a statement
            about the whole explorer, which is what it is.
          */}
          <p className="mt-3 flex items-start gap-2.5 rounded-xl bg-muted/60 px-4 py-3 text-[0.85rem] leading-relaxed text-muted-foreground">
            <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
            {ESTIMATE_BAND}
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * Three sentences somebody has been told, and what is true instead.
 *
 * They flip rather than showing both halves at once, because reading the myth
 * and then deciding you want the answer is the thing that makes it stick, and
 * because a card showing both is just a paragraph with extra borders. Each is a
 * real button: the flip is a disclosure, and `aria-expanded` says so.
 */
function Myths() {
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="display text-[1.6rem] leading-tight sm:text-[1.9rem]">
          Three things worth unlearning
        </h2>
        <span className="eyebrow">Tap to flip</span>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {MYTHS.map((entry, i) => {
          const open = flipped[i] ?? false;
          return (
            <button
              key={entry.myth}
              type="button"
              aria-expanded={open}
              onClick={() => setFlipped((prev: Record<number, boolean>) => ({ ...prev, [i]: !prev[i] }))}
              className={cn(
                // The floor is for the desktop row, where three cards of different
                // lengths have to sit level. Stacked on a phone they size to
                // their own text instead of holding a hole under each one.
                "flex flex-col justify-between gap-6 rounded-2xl p-5 text-left transition-colors sm:min-h-[11rem]",
                open ? "bg-ink text-background" : "bg-muted/70 hover:bg-muted",
              )}
            >
              <p className="display text-[1.15rem] leading-[1.45]">
                {open ? entry.truth : `\u201c${entry.myth}\u201d`}
              </p>
              <span
                className={cn(
                  "eyebrow mt-4",
                  open ? "text-background/60" : "text-muted-foreground",
                )}
              >
                {open ? "Tap to go back" : "Myth"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The five questions, and somewhere to answer them.
 *
 * The page used to print them as a bulleted list, which asks somebody a
 * question and then gives them nowhere to put the answer. Each opens a single
 * plain field, saved as they type and cleared by emptying it.
 */
function Prompts({ answers }: { answers: Record<string, string> }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="rounded-2xl bg-muted/50 p-6 sm:p-9">
      <h2 className="display text-[1.6rem] leading-tight sm:text-[1.9rem]">
        Your answers, not Claro's
      </h2>
      <p className="mt-2 max-w-prose text-[0.95rem] leading-relaxed text-muted-foreground">
        {PROMPTS_INTRO}
      </p>

      <div className="mt-6 space-y-2.5">
        {GUIDE_PROMPTS.map((prompt) => (
          <PromptRow
            key={prompt.id}
            prompt={prompt}
            saved={answers[prompt.id] ?? ""}
            open={open === prompt.id}
            onToggle={() => setOpen((current: string | null) => (current === prompt.id ? null : prompt.id))}
          />
        ))}
      </div>
    </section>
  );
}

function PromptRow({
  prompt,
  saved,
  open,
  onToggle,
}: {
  prompt: GuidePrompt;
  saved: string;
  open: boolean;
  onToggle: () => void;
}) {
  const { writeGuideAnswer } = useClaro();
  const field = useDebouncedField(saved, (text) => writeGuideAnswer(prompt.id, text));

  return (
    <div className="surface overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`prompt-${prompt.id}`}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-[0.95rem]">{prompt.question}</span>
        <span className="flex shrink-0 items-center gap-3">
          {/*
            A dot, not the answer. The row is on a page somebody may be reading
            with another person beside them, and a private note should not be
            legible from a collapsed row.
          */}
          {saved && !open && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />}
          <ChevronRight
            aria-hidden
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200",
              open && "rotate-90",
            )}
          />
        </span>
      </button>

      {open && (
        <div id={`prompt-${prompt.id}`} className="px-5 pb-4">
          <input
            type="text"
            value={field.value}
            onChange={(e) => field.onChange(e.target.value)}
            onBlur={field.onBlur}
            placeholder="A word or two is enough"
            aria-label={prompt.question}
            className="field-plain w-full border-b border-border pb-2 text-[0.95rem]"
          />
          <p className="mt-2 text-[11px] text-muted-foreground">Private, stored on this device.</p>
        </div>
      )}
    </div>
  );
}

function CardSources({ card }: { card: PhaseCard }) {
  const sources = sourcesFor(card);
  if (sources.length === 0) return null;

  return (
    <p className="mt-4 text-[0.8rem] leading-relaxed text-muted-foreground">
      <span className="eyebrow">Sources</span>{" "}
      {sources.map((source, i) => (
        <span key={source.id}>
          {i > 0 && ", "}
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {source.organisation}
          </a>
        </span>
      ))}
    </p>
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

/**
 * Every source, in full, behind one control.
 *
 * Folded rather than cut. The full metadata for seven sources ran to half the
 * page and pushed everything a reader came for above it out of reach, but this
 * is the one page in the app where each claim is tied to a named, dated source,
 * and dropping any of it would be dropping the guarantee. Each phase card names
 * its own sources inline under "go deeper"; this is where the author, the
 * publication date, the kind of evidence and Claro's own review date live.
 *
 * A `<details>`, so the browser's own in-page search still finds a source
 * somebody is looking for whether or not they thought to open it first.
 */
function Sources() {
  return (
    <details className="border-t border-border/70 pt-6">
      <summary className="flex cursor-pointer list-none items-baseline gap-2.5">
        <h2 className="eyebrow">Sources</h2>
        <span className="text-[11px] text-muted-foreground">
          {GUIDE_SOURCES.length} sources, reviewed {formatDayDate(CLARO_REVIEW_DATE)}
        </span>
        <ChevronDown aria-hidden className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
      </summary>

      <ul className="paper-panel mt-4 divide-y divide-subtle px-4">
        {GUIDE_SOURCES.map((source) => (
          <SourceRow key={source.id} source={source} />
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Summaries above are written in Claro's own words rather than copied from these pages. Dates
        are recorded as each source states them. Where a source names no author, none is shown
        rather than one being supplied.
      </p>
    </details>
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
