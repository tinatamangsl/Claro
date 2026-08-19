import { ChevronRight } from "lucide-react";

import type { Crumb } from "@/lib/calendar";
import { cn } from "@/lib/utils";

/**
 * The drill path, year down to day. Every level is a real destination, and the
 * two innermost leave Calendar for Week and Today, which is where planning and
 * execution actually live.
 */
export function Breadcrumbs({
  crumbs,
  current,
  onGo,
}: {
  crumbs: Crumb[];
  current: Crumb["view"];
  onGo: (view: Crumb["view"]) => void;
}) {
  return (
    <nav aria-label="Calendar drill path">
      <ol className="flex flex-wrap items-center gap-x-0.5 gap-y-1">
        {crumbs.map((crumb, index) => {
          const active = crumb.view === current;
          return (
            <li key={crumb.view} className="flex items-center gap-0.5">
              {index > 0 && (
                <ChevronRight aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground/50" />
              )}
              <button
                type="button"
                onClick={() => onGo(crumb.view)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[0.8rem] transition-colors",
                  active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {crumb.label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
