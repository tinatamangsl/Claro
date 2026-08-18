import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useClaro } from "@/lib/claro-store";
import { cn } from "@/lib/utils";

/** The whole of Claro's navigation. Three places, in hierarchy order reversed for daily use. */
const NAV = [
  { to: "/today", label: "Today" },
  { to: "/week", label: "Week" },
  { to: "/quarter", label: "Quarter" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { ready, saveStatus } = useClaro();
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-6 px-5 sm:px-8">
          <Link to="/today" className="flex items-baseline gap-2" aria-label="Claro home">
            <span className="display text-[1.35rem] leading-none tracking-tight">
              Claro
            </span>
            <span
              aria-hidden
              className="hidden h-1 w-1 rounded-full bg-gold sm:block"
            />
          </Link>

          <nav className="flex items-center gap-1" aria-label="Main">
            {NAV.map((item) => {
              const active = path === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn("nav-link", active && "nav-link-active")}
                >
                  {item.label}
                  {active && (
                    <span className="absolute inset-x-3 -bottom-[5px] h-[2px] rounded-full bg-gold" />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="hidden w-[7.5rem] justify-end sm:flex">
            <SaveIndicator ready={ready} status={saveStatus} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-24 pt-8 sm:px-8 sm:pt-12">
        {ready ? children : <BootSkeleton />}
      </main>
    </div>
  );
}

function SaveIndicator({ ready, status }: { ready: boolean; status: string }) {
  if (!ready) return null;
  if (status === "error") {
    return <span className="text-[11px] text-destructive">Couldn't save</span>;
  }
  return (
    <span className="text-[11px] text-muted-foreground">
      {status === "saved" ? "All changes saved" : "Saved locally"}
    </span>
  );
}

/**
 * Rendered on the server and on the client's first pass, before localStorage is
 * readable. Deliberately contains no data — only fixed-size placeholders — so the
 * markup is byte-identical across hydration.
 */
function BootSkeleton() {
  return (
    <div className="animate-pulse space-y-8" aria-hidden>
      <div className="space-y-3">
        <div className="skeleton h-2.5 w-24" />
        <div className="skeleton h-10 w-72 max-w-full" />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="skeleton h-44" />
        <div className="skeleton h-44" />
      </div>
      <div className="skeleton h-32" />
    </div>
  );
}
