import { useClaro } from "@/lib/claro-store";
import { formatDayId, formatDayShort, quarterRange } from "@/lib/dates";
import type { QuarterId } from "@/lib/types";
import { selfLoveLockIn } from "@/lib/initiatives";

/**
 * The offer to lay an initiative down, on the page initiatives are read from.
 *
 * It exists because the alternative is thirty-five dated entries typed by
 * hand. Claro has no recurrence, so "every Friday until 30 November" has to
 * become nine ordinary actions on nine ordinary days, and a person should not
 * be the one doing that nine times over.
 *
 * **What it writes is not special.** Every line it creates is an ordinary
 * action, block or habit on a real day, editable and deletable like anything
 * else, and it carries no machinery that keeps them in step afterwards.
 * Pressing it twice changes nothing, which is what lets it stay a plain
 * button rather than a decision.
 */
export function SetUpInitiative({
  todayId,
  quarterId,
}: {
  todayId: string;
  quarterId: QuarterId;
}) {
  const { state, applyInitiativeSeed, recordUndo } = useClaro();
  const seed = selfLoveLockIn();

  const already = Object.values(state.initiatives ?? {}).some((i) => i.name === seed.name);
  // Offered until the stretch is over. After that it is history, not a plan.
  if (already || todayId > seed.to) return null;

  /*
   * Only on the quarter the stretch would actually live in. Offered on every
   * quarter, pressing it here would create something that appears somewhere
   * else, and the page you pressed it on would go blank.
   */
  const span = quarterRange(quarterId);
  const inThisQuarter =
    seed.from <= formatDayId(span.end) && seed.to >= formatDayId(span.start);
  if (!inThisQuarter) return null;

  return (
    <section className="card-dashed p-5">
      <h2 className="eyebrow">{seed.name}</h2>
      <p className="mt-2 max-w-prose text-[0.88rem] leading-relaxed text-muted-foreground">
        Two months, {formatDayShort(seed.from)} to {formatDayShort(seed.to)}. Setting it up writes
        the run club, content days, Substack blocks and weekly reviews onto their own days, and
        sets the targets on run, lift and evening wind-down. Everything it makes is an ordinary
        entry you can change or delete.
      </p>
      <button
        type="button"
        onClick={() => {
          recordUndo("Initiative set up");
          applyInitiativeSeed(seed, new Date());
        }}
        className="btn btn-sm btn-primary mt-4"
      >
        Set up {seed.name}
      </button>
    </section>
  );
}
