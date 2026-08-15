import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useHearth } from "@/lib/hearth-context";
import { motion } from "framer-motion";
import { Star } from "lucide-react";

export const Route = createFileRoute("/picker")({ component: Picker });

function Picker() {
  const navigate = useNavigate();
  const { loading, user, memberships, setActiveHousehold, profile, setDefaultHousehold } = useHearth();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/auth" });
    else if (memberships.length === 0) navigate({ to: "/onboarding" });
  }, [loading, user, memberships, navigate]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <div className="text-center">
        <div className="text-5xl">🏡</div>
        <h1 className="mt-4 text-4xl">Which home are you in today?</h1>
        <p className="mt-2 text-muted-foreground">Pick a household to step into.</p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {memberships.map((m, i) => (
          <motion.button
            key={m.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => { setActiveHousehold(m.household_id); navigate({ to: "/home" }); }}
            className="paper-card group relative overflow-hidden p-6 text-left transition hover:-translate-y-0.5 hover:shadow-xl"
            style={{ borderTop: `4px solid ${m.household.accent_color}` }}
          >
            <div className="flex items-start justify-between">
              <div className="text-4xl">{m.household.emoji}</div>
              <button
                onClick={(e) => { e.stopPropagation(); setDefaultHousehold(profile?.default_household_id === m.household_id ? null : m.household_id); }}
                className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-highlight"
                title="Set as default"
              >
                <Star className={`h-4 w-4 ${profile?.default_household_id === m.household_id ? "fill-highlight text-highlight" : ""}`} />
              </button>
            </div>
            <h3 className="mt-3 text-2xl">{m.household.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              You're <span className="font-semibold capitalize" style={{ color: m.color }}>{m.display_name}</span> · {m.role}
            </p>
          </motion.button>
        ))}

        <Link to="/onboarding" className="paper-card grid place-items-center border-2 border-dashed p-6 text-muted-foreground transition hover:text-foreground">
          <div className="text-center">
            <div className="text-4xl">＋</div>
            <div className="mt-2 text-sm font-semibold">Add a household</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
