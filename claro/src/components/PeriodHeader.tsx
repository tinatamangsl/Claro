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
    <header className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <span className="eyebrow">{eyebrow}</span>
          {parent}
        </div>
        <h1 className="mt-2.5 text-[2.6rem] leading-[1.05] sm:text-[3.1rem]">{title}</h1>
        {subtitle && (
          <p className="mt-1.5 text-[0.9rem] text-muted-foreground tnum">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {onToday && (
          <button
            type="button"
            onClick={onToday}
            className="btn btn-sm btn-quiet mr-1"
          >
            {todayLabel}
          </button>
        )}
        <NavButton onClick={onPrev} label={prevLabel}>
          <ChevronLeft className="h-4 w-4" />
        </NavButton>
        <NavButton onClick={onNext} label={nextLabel}>
          <ChevronRight className="h-4 w-4" />
        </NavButton>
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
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="btn btn-quiet btn-icon"
    >
      {children}
    </button>
  );
}
