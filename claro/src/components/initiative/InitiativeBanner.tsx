import { useClaro } from "@/lib/claro-store";
import { formatDayShort } from "@/lib/dates";
import { daysOf, promisesIn } from "@/lib/initiatives";
import { EditableText } from "@/components/EditableText";
import type { Initiative } from "@/lib/types";

/**
 * The initiative, at the top of the quarter it runs inside.
 *
 * Quarter is where direction lives, and an initiative is a direction held for
 * two months, so this is the one place in Claro it is stated in full. It says
 * two things and stops: who the user said they are becoming, and how many
 * promises they have kept so far.
 *
 * **"So far" is the whole framing.** The count runs from the first day to
 * today, not to the end date, because a total against the full two months
 * would read as a score with most of the marks still unearned. There is no
 * progress bar and no percentage for the same reason.
 */
export function InitiativeBanner({
  initiative,
  todayId,
}: {
  initiative: Initiative;
  todayId: string;
}) {
  const { state, updateInitiative } = useClaro();

  const elapsed = daysOf(initiative).filter((id) => id <= todayId);
  const { kept, due } = promisesIn(state, initiative, elapsed);

  return (
    <section className="surface-quiet relative overflow-hidden py-4 pl-6 pr-5 sm:pl-7">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-gold/70" />

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="eyebrow">{initiative.name}</h2>
        <span className="tnum text-[11px] text-muted-foreground">
          {formatDayShort(initiative.from)} to {formatDayShort(initiative.to)}
        </span>
      </div>

      <EditableText
        value={initiative.identity}
        onCommit={(identity) => updateInitiative(initiative.id, (i) => ({ ...i, identity }))}
        multiline
        rows={1}
        ariaLabel="Who I am becoming over these two months"
        placeholder="Who am I becoming over these two months?"
        className="mt-2 -ml-2 display text-[1.35rem] leading-snug"
      />

      {/*
        Before it starts there is nothing to count, and "0 of 0 promises kept"
        reads as a failure on a stretch nobody has had a chance at yet.
      */}
      <p className="tnum mt-2 text-[0.85rem] text-muted-foreground">
        {elapsed.length === 0
          ? `Starts ${formatDayShort(initiative.from)}.`
          : due === null
            ? `${kept} promises kept so far.`
            : `${kept} of ${due} promises kept so far.`}
      </p>
    </section>
  );
}
