import { Briefcase, Compass, Heart, Sparkles } from "lucide-react";

import { GOAL_CATEGORY_META, type GoalCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The shared visual treatment for a goal category. Colour is a supporting cue
 * only: every tag also carries an icon and a readable label, so the category
 * survives greyscale, colour blindness and screen readers.
 */
const ICONS: Record<GoalCategory, typeof Compass> = {
  workMain: Compass,
  lifeMain: Heart,
  workSide: Briefcase,
  lifeSide: Sparkles,
};

const TONES: Record<GoalCategory, string> = {
  workMain: "border-gold/45 bg-gold/12 text-foreground",
  lifeMain: "border-primary/40 bg-primary/10 text-foreground",
  workSide: "border-border bg-muted text-muted-foreground",
  lifeSide: "border-border bg-muted text-muted-foreground",
};

export function GoalTag({
  category,
  title,
  short,
  className,
}: {
  category: GoalCategory;
  /** The user's own words, shown after the category label. */
  title?: string;
  short?: boolean;
  className?: string;
}) {
  const meta = GOAL_CATEGORY_META[category];
  const Icon = ICONS[category];

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px]",
        TONES[category],
        className,
      )}
    >
      <Icon aria-hidden className="h-3 w-3 shrink-0" />
      <span className="font-medium">{short ? meta.short : meta.label}</span>
      {title && (
        <>
          <span aria-hidden className="text-muted-foreground/50">
            ·
          </span>
          <span className="truncate text-muted-foreground">{title}</span>
        </>
      )}
    </span>
  );
}
