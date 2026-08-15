import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useHearth } from "@/lib/hearth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, LayoutGrid, List as ListIcon, Hand, Check, X, Receipt, RefreshCw, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/tasks")({
  validateSearch: (search: Record<string, unknown>) => ({
    filter: search.filter as "mine" | "unassigned" | "done-week" | undefined,
  }),
  component: () => <AppShell><TasksPage /></AppShell>,
  head: () => ({ meta: [{ title: "Tasks — HearthHub" }] }),
});

type RecurrenceType = "daily" | "weekly" | "biweekly" | "monthly";

type Comment = {
  id: string;
  body: string;
  created_at: string;
  member_id: string;
  task_id: string;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  category: "chore" | "errand" | "repair" | "admin" | "other";
  priority: "low" | "medium" | "high";
  status: "open" | "in_progress" | "done";
  due_date: string | null;
  assigned_to: string | null;
  created_by: string;
  household_id: string;
  completed_at: string | null;
  recurrence_type: RecurrenceType | null;
};

type Member = {
  id: string;
  display_name: string;
  avatar_emoji: string;
  color: string;
  user_id: string;
};

const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
};

function nextDueDate(currentDue: string | null, recurrenceType: RecurrenceType): string {
  const base = currentDue ? new Date(currentDue) : new Date();
  const next = new Date(base);
  switch (recurrenceType) {
    case "daily": next.setDate(next.getDate() + 1); break;
    case "weekly": next.setDate(next.getDate() + 7); break;
    case "biweekly": next.setDate(next.getDate() + 14); break;
    case "monthly": next.setMonth(next.getMonth() + 1); break;
  }
  return next.toISOString().split("T")[0];
}

function TasksPage() {
  const { activeHouseholdId, activeMembership, user } = useHearth();
  const hid = activeHouseholdId!;
  const me = activeMembership!;
  const qc = useQueryClient();
  const { filter } = Route.useSearch();

  const [view, setView] = useState<"board" | "list">("board");
  const [showNew, setShowNew] = useState(false);
  const [memberFilter, setMemberFilter] = useState<string | null>(null);
  const [editingAssignId, setEditingAssignId] = useState<string | null>(null);
  const [threadTask, setThreadTask] = useState<Task | null>(null);

  useEffect(() => {
    if (filter) setView("list");
  }, [filter]);

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", hid],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").eq("household_id", hid).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Task[];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["members", hid],
    queryFn: async () => {
      const { data, error } = await supabase.from("household_members").select("*").eq("household_id", hid);
      if (error) throw error;
      return data as Member[];
    },
  });

  const filteredTasks = useMemo(() => {
    if (filter === "mine") return tasks.filter((t) => t.assigned_to === me.id && t.status !== "done");
    if (filter === "unassigned") return tasks.filter((t) => !t.assigned_to && t.status !== "done");
    if (filter === "done-week") return tasks.filter((t) => t.status === "done" && t.completed_at && new Date(t.completed_at).getTime() > Date.now() - 7 * 86400000);
    return tasks;
  }, [tasks, filter, me.id]);

  const FILTER_LABELS: Record<string, string> = { mine: "My open tasks", unassigned: "Up for grabs", "done-week": "Done this week" };

  const displayTasks = useMemo(() => {
    if (!memberFilter) return filteredTasks;
    return filteredTasks.filter((t) => t.assigned_to === memberFilter);
  }, [filteredTasks, memberFilter]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tasks", hid] });

  const updateStatus = async (t: Task, status: Task["status"]) => {
    const patch: Partial<Task> = { status };
    if (status === "done") patch.completed_at = new Date().toISOString();
    const { error } = await supabase.from("tasks").update(patch).eq("id", t.id);
    if (error) return toast.error(error.message);

    if (status === "done" && t.recurrence_type) {
      const { error: spawnError } = await supabase.from("tasks").insert({
        household_id: t.household_id,
        title: t.title,
        description: t.description,
        category: t.category,
        priority: t.priority,
        due_date: nextDueDate(t.due_date, t.recurrence_type),
        assigned_to: t.assigned_to,
        created_by: user!.id,
        recurrence_type: t.recurrence_type,
      });
      if (spawnError) toast.error("Couldn't create next occurrence: " + spawnError.message);
      else toast.success(`🎉 Done! Next ${RECURRENCE_LABELS[t.recurrence_type].toLowerCase()} task scheduled.`);
    } else if (status === "done") {
      toast.success("🎉 Nice work!");
    }

    invalidate();
  };

  const claim = async (t: Task) => {
    const { error } = await supabase.from("tasks").update({ assigned_to: me.id, status: "in_progress" }).eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("All yours");
    invalidate();
  };

  const reassign = async (t: Task, memberId: string | null) => {
    const patch: Partial<Task> = { assigned_to: memberId };
    if (!memberId) patch.status = "open";
    const { error } = await supabase.from("tasks").update(patch).eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success(memberId ? "Reassigned" : "Back up for grabs");
    invalidate();
  };

  const remove = async (t: Task) => {
    if (!confirm("Delete this task?")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    invalidate();
  };

  const cols: { key: Task["status"]; title: string; emoji: string }[] = [
    { key: "open", title: "Open", emoji: "📋" },
    { key: "in_progress", title: "In progress", emoji: "🛠" },
    { key: "done", title: "Done", emoji: "✅" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl">Tasks &amp; chores</h1>
          <p className="text-sm text-muted-foreground">Everything that needs doing in {me.household.name}.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full bg-muted p-1">
            <button onClick={() => setView("board")} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${view === "board" ? "bg-card shadow" : "text-muted-foreground"}`}>
              <LayoutGrid className="h-4 w-4" /> Board
            </button>
            <button onClick={() => setView("list")} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${view === "list" ? "bg-card shadow" : "text-muted-foreground"}`}>
              <ListIcon className="h-4 w-4" /> List
            </button>
          </div>
          <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> New task
          </button>
        </div>
      </div>

      {filter && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-sm font-semibold text-primary">
            {FILTER_LABELS[filter] ?? filter}
          </span>
          <Link to="/tasks" className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted">
            Clear filter
          </Link>
        </div>
      )}

      {members.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Member:</span>
          <button
            onClick={() => setMemberFilter(null)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${!memberFilter ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
          >
            Everyone
          </button>
          {members.map((m) => (
            <button
              key={m.id}
              onClick={() => setMemberFilter(memberFilter === m.id ? null : m.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${memberFilter === m.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
            >
              <span>{m.avatar_emoji}</span> {m.display_name}{m.id === me.id ? " · me" : ""}
            </button>
          ))}
        </div>
      )}

      {view === "board" ? (
        <div className="grid gap-4 md:grid-cols-3">
          {cols.map((col) => {
            const colTasks = displayTasks.filter((t) => t.status === col.key);
            return (
              <div key={col.key} className="paper-card flex min-h-[200px] flex-col p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-bold">{col.emoji} {col.title}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{colTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {colTasks.map((t) => (
                    <TaskCard key={t.id} task={t} members={members} meId={me.id} onStatus={updateStatus} onClaim={claim} onDelete={remove} onReassign={reassign} onThread={setThreadTask} />
                  ))}
                  {colTasks.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
                      Nothing here yet
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="paper-card divide-y divide-border/70">
          {displayTasks.map((t) => {
            const assignee = members.find((m) => m.id === t.assigned_to);
            const creator = members.find((m) => m.user_id === t.created_by);
            const canEdit = t.assigned_to === me.id || creator?.id === me.id;
            return (
              <div key={t.id} className="flex flex-wrap items-center gap-3 p-4">
                <button
                  onClick={() => updateStatus(t, t.status === "done" ? "open" : "done")}
                  className={`grid h-7 w-7 place-items-center rounded-full border-2 ${t.status === "done" ? "border-secondary bg-secondary text-secondary-foreground" : "border-border"}`}
                >
                  {t.status === "done" && <Check className="h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-semibold ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>{t.title}</div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-muted-foreground capitalize">{t.category} · {t.priority}{t.due_date ? ` · due ${t.due_date}` : ""}{creator ? ` · by ${creator.display_name}` : ""}</span>
                    {t.recurrence_type && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <RefreshCw className="h-2.5 w-2.5" /> {RECURRENCE_LABELS[t.recurrence_type]}
                      </span>
                    )}
                  </div>
                </div>
                {assignee ? (
                  canEdit && editingAssignId === t.id ? (
                    <select
                      autoFocus
                      className="rounded-full border border-primary bg-background px-2.5 py-1 text-xs font-semibold outline-none"
                      defaultValue={t.assigned_to ?? ""}
                      onChange={(e) => { reassign(t, e.target.value || null); setEditingAssignId(null); }}
                      onBlur={() => setEditingAssignId(null)}
                    >
                      <option value="">🙌 Up for grabs</option>
                      {members.map((m) => <option key={m.id} value={m.id}>{m.avatar_emoji} {m.display_name}{m.id === me.id ? " (me)" : ""}</option>)}
                    </select>
                  ) : (
                    <span
                      onClick={canEdit ? () => setEditingAssignId(t.id) : () => toast(`Only ${assignee.display_name} or the creator can change this`)}
                      className="cursor-pointer rounded-full px-2.5 py-1 text-xs font-semibold transition hover:opacity-70"
                      style={{ background: `color-mix(in oklab, ${assignee.color} 18%, transparent)`, color: assignee.color }}
                    >
                      {assignee.avatar_emoji} {assignee.display_name}
                    </span>
                  )
                ) : (
                  <button onClick={() => claim(t)} className="inline-flex items-center gap-1 rounded-full bg-highlight/25 px-2.5 py-1 text-xs font-semibold text-highlight-foreground">
                    <Hand className="h-3 w-3" /> Claim
                  </button>
                )}
                <button onClick={() => setThreadTask(t)} className="rounded-full p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary" title="Discussion thread">
                  <MessageSquare className="h-4 w-4" />
                </button>
                <Link
                  to="/shopping"
                  search={{ logExpense: true, taskId: t.id, taskTitle: t.title, taskCategory: t.category } as never}
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                  title="Log expense for this task"
                >
                  <Receipt className="h-4 w-4" />
                </Link>
                {creator?.id === me.id && (
                  <button onClick={() => remove(t)} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
          {displayTasks.length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">
              {filter || memberFilter ? "No tasks match the current filters." : "No tasks yet — add the first one ✨"}
            </div>
          )}
        </div>
      )}

      <AnimatePresence>{showNew && <NewTaskModal members={members} hid={hid} meId={me.id} onClose={() => setShowNew(false)} onCreated={invalidate} />}</AnimatePresence>
      <AnimatePresence>{threadTask && <TaskThreadModal task={threadTask} members={members} me={me} onClose={() => setThreadTask(null)} />}</AnimatePresence>
    </div>
  );
}

function TaskCard({ task, members, meId, onStatus, onClaim, onDelete, onReassign, onThread }: {
  task: Task; members: Member[]; meId: string;
  onStatus: (t: Task, s: Task["status"]) => void;
  onClaim: (t: Task) => void;
  onDelete: (t: Task) => void;
  onReassign: (t: Task, memberId: string | null) => void;
  onThread: (t: Task) => void;
}) {
  const assignee = members.find((m) => m.id === task.assigned_to);
  const creator = members.find((m) => m.user_id === task.created_by);
  const canEdit = task.assigned_to === meId || creator?.id === meId;
  const [editingAssign, setEditingAssign] = useState(false);
  const priorityRing = task.priority === "high" ? "ring-2 ring-destructive/40" : task.priority === "low" ? "" : "ring-1 ring-highlight/40";
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border border-border/70 bg-background/60 p-3 ${priorityRing}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">{task.title}</div>
          {task.description && <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{task.description}</div>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Tag>{task.category}</Tag>
            <Tag>{task.priority}</Tag>
            {task.due_date && <Tag>📅 {task.due_date}</Tag>}
            {task.recurrence_type && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold text-primary">
                <RefreshCw className="h-2.5 w-2.5" /> {RECURRENCE_LABELS[task.recurrence_type]}
              </span>
            )}
            {creator && (
              <span className="text-[10px] text-muted-foreground">by {creator.avatar_emoji} {creator.display_name}</span>
            )}
          </div>
        </div>
        {creator?.id === meId && (
          <button onClick={() => onDelete(task)} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-destructive">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        {assignee ? (
          canEdit && editingAssign ? (
            <select
              autoFocus
              className="rounded-full border border-primary bg-background px-2 py-0.5 text-[11px] font-semibold outline-none"
              defaultValue={task.assigned_to ?? ""}
              onChange={(e) => { onReassign(task, e.target.value || null); setEditingAssign(false); }}
              onBlur={() => setEditingAssign(false)}
            >
              <option value="">🙌 Up for grabs</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.avatar_emoji} {m.display_name}{m.id === meId ? " (me)" : ""}</option>)}
            </select>
          ) : (
            <span
              onClick={canEdit ? () => setEditingAssign(true) : () => toast(`Only ${assignee.display_name} or the creator can change this`)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition hover:opacity-70"
              style={{ background: `color-mix(in oklab, ${assignee.color} 18%, transparent)`, color: assignee.color }}
            >
              {assignee.avatar_emoji} {assignee.display_name}
            </span>
          )
        ) : (
          <button onClick={() => onClaim(task)} className="inline-flex items-center gap-1 rounded-full bg-highlight/25 px-2 py-0.5 text-[11px] font-semibold text-highlight-foreground hover:bg-highlight/40">
            <Hand className="h-3 w-3" /> Up for grabs
          </button>
        )}
        <div className="flex items-center gap-1">
          <button onClick={() => onThread(task)} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:bg-primary/10 hover:text-primary">
            <MessageSquare className="h-3 w-3" /> Chat
          </button>
          <Link
            to="/shopping"
            search={{ logExpense: true, taskId: task.id, taskTitle: task.title, taskCategory: task.category } as never}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:bg-primary/10 hover:text-primary"
            title="Log expense for this task"
          >
            <Receipt className="h-3 w-3" /> Expense
          </Link>
          {task.status !== "open" && <Mini onClick={() => onStatus(task, "open")}>↺</Mini>}
          {task.status === "open" && <Mini onClick={() => onStatus(task, "in_progress")}>Start</Mini>}
          {task.status !== "done" && <Mini primary onClick={() => onStatus(task, "done")}>Done</Mini>}
        </div>
      </div>
    </motion.div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</span>;
}
function Mini({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${primary ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground hover:bg-card"}`}>
      {children}
    </button>
  );
}

function NewTaskModal({ members, hid, meId, onClose, onCreated }: {
  members: Member[]; hid: string; meId: string; onClose: () => void; onCreated: () => void;
}) {
  const { user } = useHearth();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState<"chore" | "errand" | "repair" | "admin" | "other">("chore");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [recurrence, setRecurrence] = useState<RecurrenceType | "">("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("tasks").insert({
      household_id: hid,
      title,
      description: desc || null,
      category,
      priority,
      due_date: due || null,
      assigned_to: assignee || null,
      created_by: user.id,
      recurrence_type: recurrence || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Added to the board");
    onCreated();
    onClose();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm">
      <motion.form onSubmit={submit} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }}
        className="paper-card w-full max-w-lg space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl">New task</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <input className="input" placeholder="What needs doing?" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} autoFocus />
        <textarea className="input" placeholder="Notes (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} maxLength={500} />
        <div className="grid gap-3 sm:grid-cols-2">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            <option value="chore">🧹 Chore</option>
            <option value="errand">🚗 Errand</option>
            <option value="repair">🔧 Repair</option>
            <option value="admin">📑 Admin</option>
            <option value="other">✨ Other</option>
          </select>
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
            <option value="low">Low priority</option>
            <option value="medium">Medium priority</option>
            <option value="high">High priority</option>
          </select>
          <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">🙌 Up for grabs</option>
            {members.map((m) => (<option key={m.id} value={m.id}>{m.avatar_emoji} {m.display_name}{m.id === meId ? " (me)" : ""}</option>))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <RefreshCw className="mr-1 inline h-3 w-3" /> Repeats
          </label>
          <div className="flex flex-wrap gap-2">
            {(["", "daily", "weekly", "biweekly", "monthly"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRecurrence(r)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${recurrence === r ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
              >
                {r === "" ? "One-time" : RECURRENCE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        <button disabled={busy} className="w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {busy ? "Adding…" : "Add to board"}
        </button>
        <style>{`
          .input { width: 100%; background: var(--color-background); border: 1px solid var(--color-border); padding: 0.6rem 0.9rem; border-radius: 0.75rem; font-size: 0.9rem; outline: none; }
          .input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 4px color-mix(in oklab, var(--color-primary) 18%, transparent); }
        `}</style>
      </motion.form>
    </motion.div>
  );
}

function TaskThreadModal({ task, members, me, onClose }: {
  task: Task; members: Member[]; me: Member; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: comments = [] } = useQuery({
    queryKey: ["task_comments", task.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("task_comments").select("*").eq("task_id", task.id).order("created_at", { ascending: true });
      if (error) throw error;
      return data as Comment[];
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("task_comments").insert({ task_id: task.id, member_id: me.id, body: text.trim() });
    setBusy(false);
    if (error) return toast.error(error.message);
    setText("");
    qc.invalidateQueries({ queryKey: ["task_comments", task.id] });
  };

  const deleteComment = async (commentId: string) => {
    const { error } = await supabase.from("task_comments").delete().eq("id", commentId);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["task_comments", task.id] });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm">
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }}
        className="paper-card flex w-full max-w-lg flex-col" style={{ maxHeight: "80vh" }}>
        <div className="flex items-start justify-between gap-2 p-5 pb-3">
          <div>
            <h2 className="text-lg font-bold">{task.title}</h2>
            <p className="text-xs text-muted-foreground">Discussion thread</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-2">
          {comments.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">No messages yet — start the conversation!</div>
          )}
          {comments.map((c) => {
            const author = members.find((m) => m.id === c.member_id);
            const isMe = c.member_id === me.id;
            return (
              <div key={c.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
                  style={{ background: author ? `color-mix(in oklab, ${author.color} 25%, transparent)` : "var(--color-muted)" }}>
                  {author?.avatar_emoji ?? "?"}
                </div>
                <div className={`group flex max-w-[75%] flex-col gap-0.5 ${isMe ? "items-end" : "items-start"}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-muted-foreground">{isMe ? "You" : author?.display_name}</span>
                    <span className="text-[10px] text-muted-foreground/60">{new Date(c.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className={`rounded-2xl px-3 py-2 text-sm ${isMe ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-muted"}`}>
                    {c.body}
                  </div>
                  {isMe && (
                    <button onClick={() => deleteComment(c.id)} className="hidden text-[10px] text-muted-foreground hover:text-destructive group-hover:block">
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={send} className="flex gap-2 border-t border-border p-4">
          <input
            className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary"
            placeholder="Add a message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" disabled={busy || !text.trim()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
            <Send className="h-4 w-4" />
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}
