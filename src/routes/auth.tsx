import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useHearth } from "@/lib/hearth-context";
import { toast } from "sonner";
import { motion } from "framer-motion";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({ meta: [{ title: "Sign in — HearthHub" }] }),
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useHearth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const redirectUrl = `${window.location.origin}/`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectUrl, data: { full_name: name } },
        });
        if (error) throw error;
        toast.success("Welcome to HearthHub! Check your inbox to confirm your email.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
        navigate({ to: "/" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-primary/10 p-12 md:flex">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-2xl">🏡</div>
          <span className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>HearthHub</span>
        </Link>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <h2 className="text-4xl leading-tight">
            "Honestly — it's the only thing we all <em className="text-primary">actually</em> open every day."
          </h2>
          <p className="mt-4 text-muted-foreground">— Every family using HearthHub, hopefully.</p>
        </motion.div>
        <div className="flex gap-2 text-2xl">🍞 🌿 🧺 ✨</div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="paper-card w-full max-w-md p-8">
          <h1 className="text-3xl">{mode === "signup" ? "Create your hearth" : "Welcome Back"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signup" ? "One account, all your homes." : "Sign in to your households."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <Field label="Your name">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={1} placeholder="Alex" />
              </Field>
            )}
            <Field label="Email">
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@home.com" />
            </Field>
            <Field label="Password">
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="At least 6 characters" />
            </Field>
            <button disabled={busy} className="w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {busy ? "…" : mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>

          <button onClick={() => setMode(mode === "signup" ? "signin" : "signup")} className="mt-5 w-full text-center text-sm text-muted-foreground hover:text-foreground">
            {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
        </div>
      </div>

      <style>{`
        .input {
          width: 100%;
          background: var(--color-background);
          border: 1px solid var(--color-border);
          padding: 0.7rem 1rem;
          border-radius: 0.85rem;
          font-size: 0.95rem;
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 4px color-mix(in oklab, var(--color-primary) 18%, transparent); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
