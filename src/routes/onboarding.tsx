import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useHearth } from "@/lib/hearth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({ component: Onboarding });

const EMOJIS = ["🏡","🌿","🍞","🌻","🪴","🐈","🌙","🔥","☕","🧺"];
const COLORS = ["#E07856","#8BA888","#E4B363","#A36F4F","#6E8B9E","#C8748A"];

function Onboarding() {
  const navigate = useNavigate();
  const { user, loading, memberships, refresh } = useHearth();
  const [tab, setTab] = useState<"create" | "join">("create");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  // Create form
  const [hName, setHName] = useState("");
  const [hEmoji, setHEmoji] = useState("🏡");
  const [hColor, setHColor] = useState(COLORS[0]);
  const [dName, setDName] = useState("");
  const [role, setRole] = useState<"parent" | "adult" | "teen" | "kid">("adult");

  // Join form
  const [code, setCode] = useState("");
  const [jName, setJName] = useState("");
  const [jRole, setJRole] = useState<"parent" | "adult" | "teen" | "kid">("adult");

  const [busy, setBusy] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const { data: h, error } = await supabase.rpc("create_household_with_owner", {
        _name: hName,
        _emoji: hEmoji,
        _accent_color: hColor,
        _display_name: dName || user.email?.split("@")[0] || "Me",
        _role: role,
      });
      if (error) throw error;
      const created = Array.isArray(h) ? h[0] : h;
      toast.success(`Welcome to ${created?.name ?? "your home"}!`);
      await refresh();
      navigate({ to: "/home" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create household");
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const { data: h, error } = await supabase.rpc("join_household_by_code", {
        _code: code.trim().toUpperCase(),
        _display_name: jName || user.email?.split("@")[0] || "Me",
        _role: jRole,
        _avatar_emoji: "🙂",
        _color: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
      if (error) {
        const msg = error.message || "";
        if (msg.includes("invalid_invite_code")) toast.error("That invite code doesn't match a household");
        else if (msg.includes("already_member")) toast.error("You're already in this household");
        else throw error;
        return;
      }
      const joined = Array.isArray(h) ? h[0] : h;
      toast.success(`Joined ${joined?.name ?? "household"}!`);
      await refresh();
      navigate({ to: "/home" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't join household");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
      <div className="paper-card mt-4 p-8">
        <h1 className="text-3xl">
          {memberships.length === 0 ? "Let's set up your first home" : "Add another household"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create one for your household, or join an existing one with an invite code.
        </p>

        <div className="mt-6 inline-flex rounded-full bg-muted p-1">
          <button onClick={() => setTab("create")} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === "create" ? "bg-card shadow" : "text-muted-foreground"}`}>Create</button>
          <button onClick={() => setTab("join")} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === "join" ? "bg-card shadow" : "text-muted-foreground"}`}>Join</button>
        </div>

        {tab === "create" ? (
          <form onSubmit={handleCreate} className="mt-6 space-y-5">
            <div>
              <Label>Household name</Label>
              <input className="input" value={hName} onChange={(e) => setHName(e.target.value)} required minLength={1} maxLength={60} placeholder="Parents' Home" />
            </div>
            <div>
              <Label>Pick an emoji</Label>
              <div className="flex flex-wrap gap-2">
                {EMOJIS.map((e) => (
                  <button type="button" key={e} onClick={() => setHEmoji(e)}
                    className={`grid h-12 w-12 place-items-center rounded-2xl text-2xl transition ${hEmoji === e ? "bg-primary/15 ring-2 ring-primary" : "bg-muted"}`}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Accent color</Label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button type="button" key={c} onClick={() => setHColor(c)}
                    style={{ background: c }}
                    className={`h-10 w-10 rounded-full transition ${hColor === c ? "ring-4 ring-offset-2 ring-foreground/30 ring-offset-card" : ""}`} />
                ))}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Your name in this home</Label>
                <input className="input" value={dName} onChange={(e) => setDName(e.target.value)} placeholder="Mom, Dad, Alex…" />
              </div>
              <div>
                <Label>Your role</Label>
                <select className="input" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
                  <option value="parent">Parent</option>
                  <option value="adult">Adult</option>
                  <option value="teen">Teen</option>
                  <option value="kid">Kid</option>
                </select>
              </div>
            </div>
            <button disabled={busy} className="w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {busy ? "Creating…" : "Create household"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="mt-6 space-y-5">
            <div>
              <Label>Invite code</Label>
              <input className="input text-center text-2xl tracking-[0.5em] uppercase" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} required placeholder="ABC123" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Your name in this home</Label>
                <input className="input" value={jName} onChange={(e) => setJName(e.target.value)} placeholder="Alex" />
              </div>
              <div>
                <Label>Your role</Label>
                <select className="input" value={jRole} onChange={(e) => setJRole(e.target.value as typeof jRole)}>
                  <option value="parent">Parent</option>
                  <option value="adult">Adult</option>
                  <option value="teen">Teen</option>
                  <option value="kid">Kid</option>
                </select>
              </div>
            </div>
            <button disabled={busy} className="w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {busy ? "Joining…" : "Join household"}
            </button>
          </form>
        )}
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

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</span>;
}
