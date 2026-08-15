import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  title: string;
  hint?: string;
  /** e.g. "2/3" — shown right-aligned against the eyebrow. */
  counter?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
};

export function Section({ title, hint, counter, children, className, action }: Props) {
  return (
    <section className={cn(className)}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="eyebrow">{title}</h2>
          {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
        </div>
        {counter && <span className="eyebrow tnum">{counter}</span>}
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
