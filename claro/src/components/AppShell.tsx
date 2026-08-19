import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { formatQuarterShort, formatWeekNumber, quarterOfDay, weekOfDay } from "@/lib/dates";
import { FocusControl } from "@/components/FocusControl";
import { SoundControl } from "@/components/SoundControl";
import { useClaro } from "@/lib/claro-store";
import { cn } from "@/lib/utils";

/** The whole of Claro's navigation. Three places, in hierarchy order reversed for daily use. */
const NAV = [
  { to: "/today", label: "Today" },
  { to: "/week", label: "Week" },
  { to: "/quarter", label: "Quarter" },
  { to: "/calendar", label: "Calendar" },
] as const;

/**
 * `wide` opens the page out to the two-page spread's rhythm. Header, main and
 * footer all take it together, so the shell never looks misaligned with the
 * content it frames.
 */
export function AppShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const { ready, saveStatus, today } = useClaro();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const page = cn("page", wide && "page-wide");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
        <div className={cn(page, "flex flex-wrap items-center gap-x-6 gap-y-1 py-2.5 sm:h-16 sm:flex-nowrap sm:py-0")}>
          <Link to="/today" className="flex items-center gap-2.5" aria-label="Claro home">
            <span className="roundel" aria-hidden>
              C
            </span>
            <span className="text-[1.1rem] font-semibold tracking-tight">Claro</span>
          </Link>

          {/*
            One nav element at every width: an inline row on desktop, a
            full-width segmented row on mobile. Duplicating it would mean two
            "Main" landmarks for a screen reader.
          */}
          <nav
            aria-label="Main"
            className="order-3 flex w-full items-center gap-1 sm:order-none sm:w-auto sm:flex-1 sm:justify-center"
          >
            {NAV.map((item) => {
              const active = path === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "nav-link flex-1 text-center sm:flex-none",
                    active && "nav-link-active",
                  )}
                >
                  {item.label}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute inset-x-3 -bottom-[3px] h-[2px] rounded-full bg-gold"
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* One focus control and one sound engine, on every route. */}
          <div className="ml-auto flex items-center gap-1 sm:ml-0">
            {ready && (
              <>
                <FocusControl />
                <SoundControl />
              </>
            )}
            <span className="hidden lg:inline">
              <SaveIndicator ready={ready} status={saveStatus} />
            </span>
          </div>
        </div>
      </header>

      <main className={cn(page, "flex-1 pb-14 pt-8 sm:pt-12")}>
        {ready ? children : <BootSkeleton />}
      </main>

      <AppFooter ready={ready} today={today} page={page} />
    </div>
  );
}

function SaveIndicator({ ready, status }: { ready: boolean; status: string }) {
  if (!ready) return null;
  if (status === "error") {
    return <span className="text-[11px] text-destructive">Couldn't save</span>;
  }
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-positive/70" />
      {status === "saved" ? "All changes saved" : "Saved locally"}
    </span>
  );
}

/**
 * Quiet, and useful rather than promotional: it says where you are in the
 * hierarchy and where the data actually lives.
 */
function AppFooter({ ready, today, page }: { ready: boolean; today: string; page: string }) {
  return (
    <footer className="mt-auto border-t border-border/70">
      <div className={cn(page, "flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-5")}>
        <span className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
          <span className="eyebrow">Claro</span>
          <span aria-hidden className="text-muted-foreground/40">
            ·
          </span>
          Quarter → Week → Day
        </span>

        {ready && today && (
          <span className="tnum flex items-center gap-2.5 text-[11px] text-muted-foreground">
            <span>{formatQuarterShort(quarterOfDay(today))}</span>
            <span aria-hidden className="text-muted-foreground/40">
              ·
            </span>
            <span>{formatWeekNumber(weekOfDay(today))}</span>
            <span aria-hidden className="text-muted-foreground/40">
              ·
            </span>
            <span>Stored on this device</span>
          </span>
        )}
      </div>
    </footer>
  );
}

/**
 * Rendered on the server and on the client's first pass, before localStorage is
 * readable. Deliberately contains no data — only fixed-size placeholders — so the
 * markup is byte-identical across hydration.
 */
function BootSkeleton() {
  return (
    <div className="animate-pulse space-y-10" aria-hidden>
      <div className="space-y-3 border-b border-border pb-5">
        <div className="skeleton h-2.5 w-24" />
        <div className="skeleton h-11 w-72 max-w-full" />
      </div>
      <div className="skeleton h-52" />
      <div className="grid gap-5 md:grid-cols-2">
        <div className="skeleton h-64" />
        <div className="skeleton h-64" />
      </div>
    </div>
  );
}
