import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useHearth } from "@/lib/hearth-context";
import { motion } from "framer-motion";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const navigate = useNavigate();
  const { loading, user, memberships, profile, activeHouseholdId } = useHearth();

  useEffect(() => {
    if (loading) return;
    if (!user) return; // show landing
    if (memberships.length === 0) {
      navigate({ to: "/onboarding" });
      return;
    }
    if (activeHouseholdId) {
      navigate({ to: "/home" });
      return;
    }
    if (memberships.length > 1 && !profile?.default_household_id) {
      navigate({ to: "/picker" });
      return;
    }
    // fallback
    navigate({ to: "/home" });
  }, [loading, user, memberships, profile, activeHouseholdId, navigate]);

  if (loading) return <div className="min-h-screen" />;

  if (!user) return <Landing onStart={() => navigate({ to: "/auth" })} />;
  return <div className="min-h-screen" />;
}

function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-2xl">🏡</div>
          <span className="text-xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>HearthHub</span>
        </div>
        <button onClick={onStart} className="rounded-full bg-foreground/90 px-5 py-2 text-sm font-semibold text-background">
          Sign in
        </button>
      </header>

      <section className="mx-auto max-w-5xl px-6 pb-24 pt-14 text-center">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-semibold text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-secondary" /> A cozy place for your whole household
          </span>
          <h1 className="mt-6 text-5xl leading-[1.05] md:text-7xl">
            Run your home <span className="italic text-primary">together</span>,<br /> not in a million group chats.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground md:text-lg">
            HearthHub is the warm kitchen bulletin board, reimagined. Tasks, shopping, expenses and schedules — shared across every home you belong to.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button onClick={onStart} className="pin-shadow rounded-full bg-primary px-7 py-3.5 text-base font-semibold text-primary-foreground transition-transform hover:scale-[1.03]">
              Start your hearth
            </button>
            <a href="#features" className="rounded-full border border-border bg-card/70 px-7 py-3.5 text-base font-semibold">
              How it works
            </a>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.7 }}
          id="features"
          className="mx-auto mt-20 grid max-w-5xl gap-5 md:grid-cols-3"
        >
          {[
            { e: "🧺", t: "Tasks & chores", d: "Up-for-grabs jobs, kanban view, recurring trash days. Everyone pitches in." },
            { e: "🛒", t: "Shared lists", d: "Groceries the whole house can edit, with receipts that flow into expenses." },
            { e: "🏡", t: "Multiple homes", d: "Belong to your parents' place AND your uni flat. Switch like walking through a door." },
          ].map((f) => (
            <div key={f.t} className="paper-card p-6 text-left">
              <div className="text-3xl">{f.e}</div>
              <h3 className="mt-3 text-xl">{f.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </motion.div>
      </section>

      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        Built with care for families. Phase 1: Auth, households, and tasks.
      </footer>
    </div>
  );
}
