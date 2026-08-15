import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useHearth } from "@/lib/hearth-context";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Copy, Users, Receipt } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/home")({
  component: () => <AppShell><HomeDashboard /></AppShell>,
  head: () => ({ meta: [{ title: "Home — HearthHub" }] }),
});

function HomeDashboard() {
  const { activeMembership, memberships, activeHouseholdId } = useHearth();
  const hid = activeHouseholdId!;

  const { data: members = [] } = useQuery({
    queryKey: ["members", hid],
    queryFn: async () => {
      const { data, error } = await supabase.from("household_members").select("*").eq("household_id", hid);
      if (error) throw error;
      return data;
    },
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", hid],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").eq("household_id", hid).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const me = activeMembership!;
  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";

  const openTasks = tasks.filter((t) => t.status !== "done");
  const upForGrabs = openTasks.filter((t) => !t.assigned_to);
  const doneThisWeek = tasks.filter((t) => t.status === "done" && t.completed_at && new Date(t.completed_at).getTime() > Date.now() - 7 * 86400000);

  const copyInvite = async () => {
    await navigator.clipboard.writeText(me.household.invite_code);
    toast.success("Invite code copied");
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="paper-card p-6 md:p-8" style={{ borderTop: `5px solid ${me.household.accent_color}` }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{greeting}, {me.display_name} —</p>
            <h1 className="mt-1 text-3xl md:text-4xl">
              You're in <span className="text-3xl">{me.household.emoji}</span> {me.household.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {members.length} {members.length === 1 ? "member" : "members"} · {openTasks.length} open {openTasks.length === 1 ? "task" : "tasks"}
            </p>
          </div>
          <button onClick={copyInvite} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted">
            <Copy className="h-4 w-4" /> Invite code: <span className="font-mono">{me.household.invite_code}</span>
          </button>
        </div>
      </motion.div>

      <div className="grid gap-5 md:grid-cols-3">
        <Stat label="Open tasks" value={openTasks.length} accent="primary" />
        <Stat label="Up for grabs" value={upForGrabs.length} accent="highlight" search={{ filter: "unassigned" }} />
        <Stat label="Done this week" value={doneThisWeek.length} accent="secondary" search={{ filter: "done-week" }} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="paper-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xl">Today on the board</h2>
            <Link to="/tasks" className="text-sm font-semibold text-primary hover:underline">Open tasks →</Link>
          </div>
          <div className="mt-4 space-y-2">
            {openTasks.slice(0, 5).map((t) => {
              const assignee = members.find((m) => m.id === t.assigned_to);
              return (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/50 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{t.title}</div>
                    <div className="text-xs text-muted-foreground capitalize">{t.category} · {t.priority}</div>
                  </div>
                  {assignee ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: `color-mix(in oklab, ${assignee.color} 18%, transparent)`, color: assignee.color }}>
                      <span>{assignee.avatar_emoji}</span> {assignee.display_name}
                    </span>
                  ) : (
                    <span className="rounded-full bg-highlight/20 px-2.5 py-1 text-xs font-semibold text-highlight-foreground">Up for grabs</span>
                  )}
                  <Link
                    to="/shopping"
                    search={{ logExpense: true, taskId: t.id, taskTitle: t.title, taskCategory: t.category } as never}
                    className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    title="Log expense for this task"
                  >
                    <Receipt className="h-3.5 w-3.5" />
                  </Link>
                </div>
              );
            })}
            {openTasks.length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                ✨ Nothing on the board. Either you're heroes, or someone needs to add a task.
              </div>
            )}
          </div>
        </div>

        <div className="paper-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl">Who's home</h2>
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-4 space-y-3">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full text-lg" style={{ background: `color-mix(in oklab, ${m.color} 24%, transparent)` }}>
                  {m.avatar_emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{m.display_name}</div>
                  <div className="text-xs capitalize text-muted-foreground">{m.role}{m.is_admin ? " · admin" : ""}</div>
                </div>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {memberships.length > 1 && (
        <div className="paper-card p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your other homes</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {memberships.filter((m) => m.household_id !== hid).map((m) => (
              <Link key={m.id} to="/picker" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted">
                <span>{m.household.emoji}</span> {m.household.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent, search }: { label: string; value: number; accent: "primary" | "highlight" | "secondary"; search?: Record<string, unknown> }) {
  const colorVar = accent === "primary" ? "var(--color-primary)" : accent === "highlight" ? "var(--color-highlight)" : "var(--color-secondary)";
  return (
    <motion.div whileHover={{ y: -2 }} className="relative paper-card p-5 cursor-pointer">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-end gap-2">
        <div className="text-5xl" style={{ fontFamily: "var(--font-display)", color: colorVar }}>{value}</div>
      </div>
      <Link to="/tasks" search={(search ?? {}) as never} className="absolute inset-0 rounded-[inherit]" aria-label={`View ${label}`} />
    </motion.div>
  );
}
