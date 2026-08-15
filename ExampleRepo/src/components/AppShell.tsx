import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useHearth } from "@/lib/hearth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  Home, ListChecks, ShoppingCart, Receipt, Calendar, MessageSquare,
  FileText, Phone, Gift, History, ChevronDown, Settings, LogOut, Star, Plus, Bell, LayoutGrid
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { loading, user, memberships, activeHouseholdId, activeMembership, setActiveHousehold, profile, setDefaultHousehold, signOut } = useHearth();
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [unread, setUnread] = useState(0);

  // Close the More sheet when navigating
  useEffect(() => { setMoreOpen(false); }, [path]);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    if (memberships.length === 0) { navigate({ to: "/onboarding" }); return; }
    if (!activeHouseholdId) { navigate({ to: "/picker" }); return; }
  }, [loading, user, memberships, activeHouseholdId, navigate]);

  // Unread chat badge: count messages since this member's chat_last_read_at
  useEffect(() => {
    if (!activeHouseholdId || !activeMembership || !user) return;
    let cancelled = false;

    async function recalc() {
      const { data: m } = await supabase
        .from("household_members")
        .select("chat_last_read_at")
        .eq("id", activeMembership!.id)
        .maybeSingle();
      const since = m?.chat_last_read_at ?? new Date(0).toISOString();
      const { count } = await supabase
        .from("household_messages")
        .select("id", { count: "exact", head: true })
        .eq("household_id", activeHouseholdId!)
        .neq("user_id", user!.id)
        .gt("created_at", since);
      if (!cancelled) setUnread(count ?? 0);
    }
    recalc();

    const channel = supabase
      .channel(`unread:${activeHouseholdId}:${user.id}`, { config: { private: true } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "household_messages", filter: `household_id=eq.${activeHouseholdId}` },
        (payload) => {
          const m = payload.new as { user_id: string };
          if (m.user_id === user.id) return;
          if (window.location.pathname === "/chat") return;
          setUnread((n) => n + 1);
        }
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [activeHouseholdId, activeMembership, user]);

  // When viewing chat, mark as read
  useEffect(() => {
    if (path !== "/chat" || !activeMembership) return;
    setUnread(0);
    supabase
      .from("household_members")
      .update({ chat_last_read_at: new Date().toISOString() })
      .eq("id", activeMembership.id)
      .then(() => {});
  }, [path, activeMembership]);

  if (loading || !user || !activeMembership) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Setting the table…</div>;
  }

  const accent = activeMembership.household.accent_color;

  return (
    <div className="min-h-screen pb-24 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <Link to="/home" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-lg">🏡</div>
            <span className="hidden text-lg font-bold sm:block" style={{ fontFamily: "var(--font-display)" }}>HearthHub</span>
          </Link>

          {/* Household switcher */}
          <div className="relative flex-1 md:max-w-sm">
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 rounded-2xl border border-border bg-card/80 px-3 py-2 text-left transition hover:bg-card"
              style={{ borderLeft: `4px solid ${accent}` }}
            >
              <div className="flex items-center gap-2 truncate">
                <span className="text-xl">{activeMembership.household.emoji}</span>
                <div className="truncate">
                  <div className="truncate text-sm font-bold">{activeMembership.household.name}</div>
                  <div className="text-xs text-muted-foreground">You're {activeMembership.display_name}</div>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>

            <AnimatePresence>
              {open && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="paper-card absolute left-0 right-0 top-[110%] z-40 p-2"
                >
                  {memberships.map((m) => (
                    <div key={m.id} className="flex items-center gap-1">
                      <button
                        onClick={() => { setActiveHousehold(m.household_id); setOpen(false); }}
                        className={`flex flex-1 items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-muted ${m.household_id === activeHouseholdId ? "bg-muted/80" : ""}`}
                      >
                        <span className="text-xl">{m.household.emoji}</span>
                        <div className="flex-1 truncate">
                          <div className="truncate text-sm font-semibold">{m.household.name}</div>
                          <div className="text-xs text-muted-foreground capitalize">{m.role}</div>
                        </div>
                      </button>
                      <button
                        onClick={() => setDefaultHousehold(profile?.default_household_id === m.household_id ? null : m.household_id)}
                        title="Set default"
                        className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-highlight"
                      >
                        <Star className={`h-4 w-4 ${profile?.default_household_id === m.household_id ? "fill-highlight text-highlight" : ""}`} />
                      </button>
                    </div>
                  ))}
                  <Link to="/onboarding" onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10">
                    <Plus className="h-4 w-4" /> Add household
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-1">
            <button className="hidden rounded-full p-2 text-muted-foreground hover:bg-muted md:inline-grid" title="Notifications (coming soon)">
              <Bell className="h-5 w-5" />
            </button>
            <Link to="/settings" className="hidden rounded-full p-2 text-muted-foreground hover:bg-muted md:inline-grid">
              <Settings className="h-5 w-5" />
            </Link>
            <button onClick={signOut} className="rounded-full p-2 text-muted-foreground hover:bg-muted" title="Sign out">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Desktop tabs */}
        <nav className="mx-auto hidden max-w-6xl items-center gap-1 px-6 pb-2 md:flex">
          <NavTab to="/home" icon={<Home className="h-4 w-4" />} label="Home" current={path} />
          <NavTab to="/tasks" icon={<ListChecks className="h-4 w-4" />} label="Tasks" current={path} />
          <NavTab to="/shopping" icon={<ShoppingCart className="h-4 w-4" />} label="Shopping" current={path} />
          <NavTab to="/expenses" icon={<Receipt className="h-4 w-4" />} label="Expenses" current={path} />
          <NavTab to="/calendar" icon={<Calendar className="h-4 w-4" />} label="Calendar" current={path} soon />
          <NavTab to="/chat" icon={<MessageSquare className="h-4 w-4" />} label="Chat" current={path} badge={unread} />
          <NavTab to="/docs" icon={<FileText className="h-4 w-4" />} label="Docs" current={path} soon />
          <NavTab to="/emergency" icon={<Phone className="h-4 w-4" />} label="Emergency" current={path} soon />
          <NavTab to="/wishlists" icon={<Gift className="h-4 w-4" />} label="Wishlists" current={path} soon />
          <NavTab to="/record" icon={<History className="h-4 w-4" />} label="Record" current={path} />
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-around px-2 py-2">
          <BottomTab to="/home" icon={<Home className="h-5 w-5" />} label="Home" current={path} />
          <BottomTab to="/tasks" icon={<ListChecks className="h-5 w-5" />} label="Tasks" current={path} />
          <BottomTab to="/shopping" icon={<ShoppingCart className="h-5 w-5" />} label="Shop" current={path} />
          <BottomTab to="/chat" icon={<MessageSquare className="h-5 w-5" />} label="Chat" current={path} badge={unread} />
          <button
            onClick={() => setMoreOpen(true)}
            className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-semibold ${moreOpen ? "text-primary" : "text-muted-foreground"}`}
          >
            <LayoutGrid className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>

      {/* Mobile "More" sheet */}
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMoreOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-3xl border-t border-border bg-background p-5 pb-8 shadow-2xl md:hidden"
            >
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-border" />
              <h2 className="mb-3 text-lg font-bold">All sections</h2>
              <div className="grid grid-cols-3 gap-2">
                <MoreItem to="/home" icon={<Home className="h-5 w-5" />} label="Home" />
                <MoreItem to="/tasks" icon={<ListChecks className="h-5 w-5" />} label="Tasks" />
                <MoreItem to="/shopping" icon={<ShoppingCart className="h-5 w-5" />} label="Shopping" />
                <MoreItem to="/chat" icon={<MessageSquare className="h-5 w-5" />} label="Chat" badge={unread} />
                <MoreItem to="/expenses" icon={<Receipt className="h-5 w-5" />} label="Expenses" />
                <MoreItem to="/calendar" icon={<Calendar className="h-5 w-5" />} label="Calendar" soon />
                <MoreItem to="/docs" icon={<FileText className="h-5 w-5" />} label="Docs" soon />
                <MoreItem to="/emergency" icon={<Phone className="h-5 w-5" />} label="Emergency" soon />
                <MoreItem to="/wishlists" icon={<Gift className="h-5 w-5" />} label="Wishlists" soon />
                <MoreItem to="/record" icon={<History className="h-5 w-5" />} label="Record" />
                <MoreItem to="/settings" icon={<Settings className="h-5 w-5" />} label="Settings" />
              </div>
              <button
                onClick={() => { setMoreOpen(false); signOut().then(() => navigate({ to: "/" })); }}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function MoreItem({ to, icon, label, soon, badge }: { to: string; icon: ReactNode; label: string; soon?: boolean; badge?: number }) {
  const base = "flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-card p-3 text-xs font-semibold";
  if (soon) {
    return (
      <span className={`${base} cursor-not-allowed opacity-50`} title="Coming soon">
        {icon}
        <span>{label}</span>
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Soon</span>
      </span>
    );
  }
  return (
    <Link to={to} className={`${base} relative hover:bg-muted`}>
      <span className="relative">
        {icon}
        {badge && badge > 0 ? (
          <span className="absolute -right-2 -top-1 grid min-w-[16px] place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      <span>{label}</span>
    </Link>
  );
}

function NavTab({ to, icon, label, current, soon, badge }: { to: string; icon: ReactNode; label: string; current: string; soon?: boolean; badge?: number }) {
  const active = current === to;
  const cls = `relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`;
  if (soon) {
    return (
      <span className={`${cls} cursor-not-allowed opacity-50`} title="Coming soon">
        {icon} {label}
      </span>
    );
  }
  return (
    <Link to={to} className={cls}>
      {icon} {label}
      {badge && badge > 0 ? (
        <span className="ml-1 inline-grid min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

function BottomTab({ to, icon, label, current, badge }: { to: string; icon: ReactNode; label: string; current: string; badge?: number }) {
  const active = current === to || (to !== "/home" && current.startsWith(to));
  return (
    <Link to={to} className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-semibold ${active ? "text-primary" : "text-muted-foreground"}`}>
      <span className="relative">
        {icon}
        {badge && badge > 0 ? (
          <span className="absolute -right-2 -top-1 grid min-w-[16px] place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      {label}
    </Link>
  );
}
