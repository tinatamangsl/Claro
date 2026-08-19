import { MARK_LABELS } from "@/lib/calendar";

/**
 * What each mark on the month means. Every one is backed by a canonical
 * record, so a mark appears only when the thing it names actually exists.
 */
export function Legend() {
  const items: [keyof typeof MARK_LABELS, string][] = [
    ["habitKept", "h-1.5 w-3 rounded-full bg-positive"],
    ["commitmentCompleted", "h-1.5 w-1.5 rounded-full bg-foreground/45"],
    ["focusRecorded", "h-1.5 w-1.5 rounded-full bg-gold"],
    ["reflectionCaptured", "h-1.5 w-1.5 rounded-full border border-primary"],
  ];

  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground">
      {items.map(([key, dot]) => (
        <span key={key} className="flex items-center gap-1.5">
          <span aria-hidden className={dot} />
          {MARK_LABELS[key]}
        </span>
      ))}
    </p>
  );
}
