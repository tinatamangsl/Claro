import { CheckToggle } from "@/components/CheckToggle";
import { EditableText } from "@/components/EditableText";
import { cn } from "@/lib/utils";
import { DOMAIN_META, DOMAINS, type Day, type Domain, type Priority, type Week } from "@/lib/types";

type Props = {
  day: Day;
  week: Week;
  onPatch: (key: "priority1" | "priority2", patch: Partial<Priority>) => void;
};

/**
 * The day's two priorities, written as entries on the page that contains them —
 * not as cards. Priority 1 must dominate everything else on the screen, which
 * it does by size and by the gold mark, never by a heavier box.
 */
export function PrioritiesBlock({ day, week, onPatch }: Props) {
  return (
    <div className="mt-5 space-y-5">
      <PriorityEntry
        rank={1}
        priority={day.priority1}
        week={week}
        onPatch={(patch) => onPatch("priority1", patch)}
      />
      <div aria-hidden className="h-px bg-border/70" />
      <PriorityEntry
        rank={2}
        priority={day.priority2}
        week={week}
        onPatch={(patch) => onPatch("priority2", patch)}
      />
    </div>
  );
}

function PriorityEntry({
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
    <div className="flex items-start gap-3.5">
      <div className="flex items-center gap-3 pt-1">
        <span
          aria-hidden
          className={cn(
            "tnum display select-none leading-none",
            primary ? "text-2xl text-gold" : "text-lg text-muted-foreground/60",
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
            "-ml-2 display",
            primary ? "text-[1.75rem] sm:text-[2.1rem]" : "text-[1.25rem]",
            priority.done && "strike-done text-muted-foreground",
          )}
        />
        <LinkPicker priority={priority} week={week} onPatch={onPatch} rank={rank} />
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
