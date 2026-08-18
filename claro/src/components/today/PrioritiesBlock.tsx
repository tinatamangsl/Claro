import { CheckToggle } from "@/components/CheckToggle";
import { EditableText } from "@/components/EditableText";
import { cn } from "@/lib/utils";
import { DOMAIN_META, DOMAINS, type Day, type Domain, type Priority, type Week } from "@/lib/types";

type Props = {
  day: Day;
  week: Week;
  onPatch: (key: "priority1" | "priority2", patch: Partial<Priority>) => void;
};

/** Today's Focus. Priority 1 must visually dominate everything else on the screen. */
export function PrioritiesBlock({ day, week, onPatch }: Props) {
  return (
    <section>
      <h2 className="eyebrow">Today's Focus</h2>
      <div className="mt-3 space-y-3">
        <PriorityCard
          rank={1}
          priority={day.priority1}
          week={week}
          onPatch={(patch) => onPatch("priority1", patch)}
        />
        <PriorityCard
          rank={2}
          priority={day.priority2}
          week={week}
          onPatch={(patch) => onPatch("priority2", patch)}
        />
      </div>
    </section>
  );
}

function PriorityCard({
  rank,
  priority,
  week,
  onPatch,
}: {
  rank: 1 | 2;
  priority: Priority;
  week: Week;
  onPatch: (patch: Partial<Priority>) => void;
}) {
  const primary = rank === 1;

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        primary ? "surface-raised p-5 sm:p-6" : "surface p-4 sm:p-5",
      )}
    >
      {primary && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-gold" />}

      <div className="flex items-start gap-3.5">
        <div className="flex items-center gap-3 pt-1">
          <span
            className={cn(
              "tnum select-none display leading-none text-muted-foreground/50",
              primary ? "text-2xl" : "text-lg",
            )}
          >
            {rank}
          </span>
          <CheckToggle
            checked={priority.done}
            onChange={() => onPatch({ done: !priority.done })}
            label={`Complete priority ${rank}`}
            size={primary ? "lg" : "md"}
          />
        </div>

        <div className="min-w-0 flex-1">
          <EditableText
            value={priority.text}
            onCommit={(text) => onPatch({ text })}
            ariaLabel={`Priority ${rank}`}
            placeholder={
              primary ? "The most important thing today…" : "A second priority (optional)"
            }
            className={cn(
              "-ml-2 display leading-tight tracking-tight",
              primary ? "text-[1.6rem] sm:text-[1.85rem]" : "text-[1.2rem]",
              priority.done && "strike-done text-muted-foreground",
            )}
          />
          <LinkPicker priority={priority} week={week} onPatch={onPatch} rank={rank} />
        </div>
      </div>
    </div>
  );
}

/** Optionally ties a priority to one of this week's goals, making the ladder explicit. */
function LinkPicker({
  priority,
  week,
  onPatch,
  rank,
}: {
  priority: Priority;
  week: Week;
  onPatch: (patch: Partial<Priority>) => void;
  rank: number;
}) {
  const linkedGoal = priority.link ? week[priority.link].goal : "";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 pl-0.5">
      <label className="sr-only" htmlFor={`priority-${rank}-link`}>
        Link priority {rank} to a weekly goal
      </label>
      <select
        id={`priority-${rank}-link`}
        value={priority.link ?? ""}
        onChange={(e) => onPatch({ link: (e.target.value || null) as Domain | null })}
        className={cn("field-select", priority.link && "field-select-active")}
      >
        <option value="">Not linked</option>
        {DOMAINS.map((domain) => (
          <option key={domain} value={domain}>
            {DOMAIN_META[domain].label} goal
          </option>
        ))}
      </select>

      {priority.link && (
        <span className="truncate text-[11px] text-muted-foreground">
          {linkedGoal ? `↳ ${linkedGoal}` : "↳ no goal set for this week yet"}
        </span>
      )}
    </div>
  );
}
