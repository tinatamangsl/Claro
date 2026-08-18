import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  eyebrow: string;
  title: ReactNode;
  subtitle?: string;
  onPrev: () => void;
  onNext: () => void;
  prevLabel: string;
  nextLabel: string;
  /** Shown when the user has navigated away from the current period. */
  onToday?: () => void;
  todayLabel?: string;
  /** A link upward in the hierarchy, e.g. Week → its Quarter. */
  parent?: ReactNode;
  className?: string;
};

/**
 * The page header band. The prev/next control sits inside the band and on its
 * baseline rule, so navigation reads as attached to the period it moves —
 * rather than floating in the top-right corner of the page.
 */
export function PeriodHeader({
  eyebrow,
  title,
  subtitle,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  onToday,
  todayLabel,
  parent,
  className,
}: Props) {
  return (
    <header className={cn("border-b border-border pb-5", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="eyebrow">{eyebrow}</span>
            {parent}
          </div>
          <h1 className="display mt-3 text-[2.6rem] sm:text-[3.2rem]">{title}</h1>
          {subtitle && <p className="tnum mt-1.5 text-[0.92rem] text-muted-foreground">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-2">
          {onToday && (
            <button type="button" onClick={onToday} className="btn btn-sm btn-quiet">
              {todayLabel}
            </button>
          )}
          <div className="flex items-center rounded-full border border-border bg-card">
            <NavButton onClick={onPrev} label={prevLabel}>
              <ChevronLeft className="h-4 w-4" />
            </NavButton>
            <span aria-hidden className="h-4 w-px bg-border" />
            <NavButton onClick={onNext} label={nextLabel}>
              <ChevronRight className="h-4 w-4" />
            </NavButton>
          </div>
        </div>
      </div>
    </header>
  );
}

function NavButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="btn btn-icon btn-ghost">
      {children}
    </button>
  );
}
