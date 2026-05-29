import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useHearth } from "@/lib/hearth-context";
import { supabase } from "@/integrations/supabase/client";
import { Star, Copy, LogOut, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  component: () => <AppShell><SettingsPage /></AppShell>,
  head: () => ({ meta: [{ title: "Settings — HearthHub" }] }),
});

function SettingsPage() {
  const { user, profile, memberships, setDefaultHousehold, setActiveHousehold, refresh, signOut } = useHearth();
  const navigate = useNavigate();

  const leave = async (membershipId: string, hName: string) => {
    if (!confirm(`Leave ${hName}? You won't see its tasks anymore.`)) return;
    const { error } = await supabase.from("household_members").delete().eq("id", membershipId);
    if (error) return toast.error(error.message);
    toast.success(`Left ${hName}`);
    await refresh();
  };

  const del = async (hid: string, hName: string) => {
    if (!confirm(`Delete ${hName}? This removes all its data for everyone.`)) return;
    const { error } = await supabase.from("households").delete().eq("id", hid);
    if (error) return toast.error(error.message);
    toast.success("Household deleted");
    await refresh();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Settings</h1>

      <div className="paper-card p-6">
        <h2 className="text-xl">You</h2>
        <p className="mt-1 text-sm text-muted-foreground">{profile?.full_name} · {user?.email}</p>
        <button onClick={async () => { await signOut(); navigate({ to: "/" }); }} className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>

      <div className="paper-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl">Households</h2>
            <p className="mt-1 text-sm text-muted-foreground">Star one to make it your default home on app open.</p>
          </div>
          <Link to="/onboarding" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Add
          </Link>
        </div>

        <div className="mt-4 space-y-3">
          {memberships.map((m) => {
            const isDefault = profile?.default_household_id === m.household_id;
            const isAdmin = m.is_admin;
            return (
              <div key={m.id} className="rounded-2xl border border-border/70 p-4" style={{ borderLeft: `5px solid ${m.household.accent_color}` }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{m.household.emoji}</span>
                    <div>
                      <div className="text-lg font-bold">{m.household.name}</div>
                      <div className="text-xs text-muted-foreground capitalize">You are {m.display_name} · {m.role}{isAdmin ? " · admin" : ""}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => { setActiveHousehold(m.household_id); navigate({ to: "/home" }); }} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                      Open
                    </button>
                    <button onClick={() => setDefaultHousehold(isDefault ? null : m.household_id)} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${isDefault ? "bg-highlight/30 text-highlight-foreground" : "border border-border bg-card hover:bg-muted"}`}>
                      <Star className={`h-3.5 w-3.5 ${isDefault ? "fill-highlight text-highlight" : ""}`} />
                      {isDefault ? "Default" : "Set default"}
                    </button>
                    <button onClick={() => { navigator.clipboard.writeText(m.household.invite_code); toast.success("Invite code copied"); }} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted font-mono">
                      <Copy className="h-3.5 w-3.5" /> {m.household.invite_code}
                    </button>
                    <button onClick={() => leave(m.id, m.household.name)} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-destructive">
                      <LogOut className="h-3.5 w-3.5" /> Leave
                    </button>
                    {isAdmin && (
                      <button onClick={() => del(m.household_id, m.household.name)} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {memberships.length === 0 && <p className="text-sm text-muted-foreground">You're not in any households yet.</p>}
        </div>
      </div>

      <div className="paper-card p-6">
        <h2 className="text-xl">Coming in the next phase</h2>
        <p className="mt-1 text-sm text-muted-foreground">Shopping lists, shared expenses, calendar, announcements, document vault, emergency info, wishlists, meal planning, and analytics will arrive in upcoming releases. The household plumbing is ready for them.</p>
      </div>
    </div>
  );
}
