import type { CycleChange } from "@/lib/cycle-recalibration";

type Props = {
  changes: CycleChange[];
  onAcknowledge: () => void;
  onOpenNotes: () => void;
};

/**
 * What moved in the user's own estimate, said once.
 *
 * The design this came from opened with "Claro has learned something" and
 * closed with "apply to my calendar", promising to prioritise high-stakes work
 * in a predicted window. Claro has learned nothing about anybody: somebody
 * logged more dates, so the median of their own gaps moved. That is what this
 * screen says, and there is nothing to apply because a changed estimate changes
 * a number on a page and not a plan.
 */
export function DayRecalibrate({ changes, onAcknowledge, onOpenNotes }: Props) {
  return (
    <div className="space-y-7">
      <header className="text-center">
        <span aria-hidden className="mx-auto block h-2 w-2 rounded-full bg-primary" />
        <h1 className="display mt-4 text-[1.6rem] leading-snug italic">
          Your estimate has changed.
        </h1>
        <p className="mt-2 text-[0.82rem] leading-relaxed text-muted-foreground">
          Worked out again from the dates you have entered. Nothing in your plans has moved.
        </p>
      </header>

      <div className="space-y-3">
        {changes.map((change) => (
          <article
            key={change.id}
            className="rounded-xl border-l-[3px] border-primary bg-background p-4 shadow-sm"
          >
            <h2 className="text-[0.78rem] font-medium">{change.title}</h2>
            <p className="mt-1.5 text-[0.8rem] leading-[1.7] text-muted-foreground">
              {change.body}
            </p>
          </article>
        ))}
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={onAcknowledge}
          className="h-[52px] w-full rounded-xl bg-foreground text-[0.95rem] font-medium text-background transition-opacity hover:opacity-90"
        >
          got it
        </button>
        <button
          type="button"
          onClick={onOpenNotes}
          className="w-full text-center text-[0.82rem] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          view my full cycle notes →
        </button>
      </div>
    </div>
  );
}
