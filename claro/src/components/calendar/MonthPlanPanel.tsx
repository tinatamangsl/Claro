import { EditableText } from "@/components/EditableText";
import { formatMonthLong, type MonthId } from "@/lib/calendar";
import type { MonthPlan } from "@/lib/types";

/**
 * A calm monthly intention. Three short pieces of writing and nothing else:
 * this is not a second quarterly plan, and it is deliberately not a task list.
 */
export function MonthPlanPanel({
  monthId,
  plan,
  onWrite,
}: {
  monthId: MonthId;
  plan: MonthPlan;
  onWrite: (patch: Partial<MonthPlan>) => void;
}) {
  const fields: [keyof MonthPlan, string, string][] = [
    ["intention", "Intention for the month", "What do you want this month to be about?"],
    ["mattersThisMonth", "What matters this month", "The few things worth protecting."],
    ["reflection", "Looking back", "Write this at the end, or whenever it helps."],
  ];

  return (
    <section>
      <div className="flex items-baseline gap-2.5">
        <h2 className="eyebrow">Plan this month</h2>
        <span className="text-[11px] text-muted-foreground">
          {formatMonthLong(monthId)}
        </span>
      </div>

      <div className="surface mt-3 space-y-4 p-4">
        {fields.map(([key, label, placeholder]) => (
          <label key={key} className="block">
            <span className="block text-[0.88rem] leading-snug">{label}</span>
            <div className="paper-panel ruled mt-2 px-3 pb-2">
              <EditableText
                value={(plan[key] as string) ?? ""}
                onCommit={(value) => onWrite({ [key]: value } as Partial<MonthPlan>)}
                multiline
                rows={2}
                ariaLabel={label}
                placeholder={placeholder}
                className="ruled-text -ml-2 py-0"
              />
            </div>
          </label>
        ))}
      </div>
    </section>
  );
}
