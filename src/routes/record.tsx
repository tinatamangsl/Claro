import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useHearth } from "@/lib/hearth-context";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  History, Search, ListChecks, ShoppingCart, Flame, Award, Clock, TrendingUp,
  Sparkles, Filter, CheckCircle2, ChevronDown, Receipt, Wallet, Target, Pencil, Trophy, Plus,
} from "lucide-react";
import { motion } from "framer-motion";
import { BudgetDialog, BUDGET_CATEGORIES } from "@/components/BudgetDialog";

export const Route = createFileRoute("/record")({
  component: () => <AppShell><RecordPage /></AppShell>,
  head: () => ({ meta: [{ title: "The Record — HearthHub" }] }),
});

type Scope = "week" | "month" | "3m" | "year" | "all";
const SCOPES: { id: Scope; label: string }[] = [
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
  { id: "3m", label: "Last 3 Months" },
  { id: "year", label: "This Year" },
  { id: "all", label: "All Time" },
];

function scopeStart(scope: Scope): Date | null {
  const now = new Date();
  if (scope === "all") return null;
  const d = new Date(now);
  if (scope === "week") {
    const day = (d.getDay() + 6) % 7; // Monday start
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day);
    return d;
  }
  if (scope === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (scope === "3m") { const x = new Date(now); x.setMonth(x.getMonth() - 3); return x; }
  if (scope === "year") return new Date(now.getFullYear(), 0, 1);
  return null;
}

type Member = {
  id: string;
  user_id: string;
  display_name: string;
  avatar_emoji: string;
  color: string;
  role: string;
};

type Task = {
  id: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  due_date: string | null;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
};

type ShopItem = {
  id: string;
  name: string;
  category: string;
  quantity: string | null;
  checked: boolean;
  checked_at: string | null;
  checked_by_member: string | null;
  added_by_member: string;
  created_at: string;
};

type Expense = {
  id: string;
  amount: number;
  currency: string;
  category: string;
  merchant: string | null;
  note: string | null;
  expense_date: string;
  paid_by_member: string;
  source: string;
  created_at: string;
};

type FeedEntry =
  | { kind: "task"; id: string; at: string; memberId: string | null; title: string; category: string; priority: string; onTime: boolean | null }
  | { kind: "shop"; id: string; at: string; memberId: string | null; title: string; category: string; quantity: string | null }
  | { kind: "expense"; id: string; at: string; memberId: string | null; title: string; category: string; amount: number; currency: string };

const CAT_EMOJI: Record<string, string> = {
  chore: "🧹", errand: "🛍️", repair: "🔧", admin: "📋", other: "✨",
  produce: "🥬", dairy: "🥛", meat: "🍗", bakery: "🥖", pantry: "🥫",
  frozen: "🧊", drinks: "🧃", household: "🧻",
  groceries: "🛒", pharmacy: "💊", bills: "🧾", repairs: "🔧",
  subscriptions: "🔁", restaurant: "🍽️", transport: "🚗",
};

function fmtMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function relTime(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function computeStreak(dates: string[]): number {
  // dates: ISO strings of completed actions. Returns consecutive days ending today or yesterday.
  if (dates.length === 0) return 0;
  const days = new Set(dates.map((d) => new Date(d).toISOString().slice(0, 10)));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Allow streak to count if today or yesterday has an entry
  let cursor = new Date(today);
  if (!days.has(cursor.toISOString().slice(0, 10))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(cursor.toISOString().slice(0, 10))) return 0;
  }
  let count = 0;
  while (days.has(cursor.toISOString().slice(0, 10))) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

function RecordPage() {
  const { activeHouseholdId, activeMembership } = useHearth();
  const hid = activeHouseholdId!;
  const [scope, setScope] = useState<Scope>("month");
  const [memberFilter, setMemberFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "task" | "shop" | "expense">("all");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);

  const start = scopeStart(scope);
  const startIso = start?.toISOString() ?? null;

  const { data: members = [] } = useQuery({
    queryKey: ["record-members", hid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("household_members")
        .select("id,user_id,display_name,avatar_emoji,color,role")
        .eq("household_id", hid);
      if (error) throw error;
      return data as Member[];
    },
  });

  const { data: tasksAll = [] } = useQuery({
    queryKey: ["record-tasks", hid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id,title,category,priority,status,due_date,assigned_to,created_by,created_at,completed_at")
        .eq("household_id", hid)
        .eq("status", "done")
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as Task[];
    },
  });

  const { data: shopAll = [] } = useQuery({
    queryKey: ["record-shop", hid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopping_items")
        .select("id,name,category,quantity,checked,checked_at,checked_by_member,added_by_member,created_at")
        .eq("household_id", hid)
        .eq("checked", true)
        .not("checked_at", "is", null)
        .order("checked_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as ShopItem[];
    },
  });

  const { data: expensesAll = [] } = useQuery({
    queryKey: ["record-expenses", hid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id,amount,currency,category,merchant,note,expense_date,paid_by_member,source,created_at")
        .eq("household_id", hid)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []).map((e) => ({ ...e, amount: Number(e.amount) })) as Expense[];
    },
  });

  const { data: createdTasksAll = [] } = useQuery({
    queryKey: ["record-tasks-created", hid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id,created_by,created_at")
        .eq("household_id", hid)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data as { id: string; created_by: string; created_at: string }[];
    },
  });

  // Budgets for current calendar month
  const currentMonthStart = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  }, []);
  const { data: budgets = [] } = useQuery({
    queryKey: ["record-budgets", hid, currentMonthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("household_budgets")
        .select("id,category,amount,currency,month")
        .eq("household_id", hid)
        .eq("month", currentMonthStart);
      if (error) throw error;
      return (data ?? []).map((b) => ({ ...b, amount: Number(b.amount) })) as Array<{
        id: string; category: string | null; amount: number; currency: string; month: string;
      }>;
    },
  });





  const memberMap = useMemo(() => {
    const m = new Map<string, Member>();
    members.forEach((x) => m.set(x.id, x));
    return m;
  }, [members]);

  // Scope filter
  const tasks = useMemo(
    () => tasksAll.filter((t) => t.completed_at && (!startIso || t.completed_at >= startIso)),
    [tasksAll, startIso]
  );
  const createdTasks = useMemo(
    () => createdTasksAll.filter((t) => !startIso || t.created_at >= startIso),
    [createdTasksAll, startIso]
  );
  const shops = useMemo(
    () => shopAll.filter((s) => s.checked_at && (!startIso || s.checked_at >= startIso)),
    [shopAll, startIso]
  );
  const expenses = useMemo(
    () => expensesAll.filter((e) => !startIso || e.created_at >= startIso),
    [expensesAll, startIso]
  );

  // Build feed
  const feed = useMemo<FeedEntry[]>(() => {
    const entries: FeedEntry[] = [];
    for (const t of tasks) {
      const onTime = t.due_date && t.completed_at ? new Date(t.completed_at) <= new Date(t.due_date + "T23:59:59") : null;
      entries.push({
        kind: "task",
        id: t.id,
        at: t.completed_at!,
        memberId: t.assigned_to,
        title: t.title,
        category: t.category,
        priority: t.priority,
        onTime,
      });
    }
    for (const s of shops) {
      entries.push({
        kind: "shop",
        id: s.id,
        at: s.checked_at!,
        memberId: s.checked_by_member ?? s.added_by_member,
        title: s.name,
        category: s.category,
        quantity: s.quantity,
      });
    }
    for (const x of expenses) {
      entries.push({
        kind: "expense",
        id: x.id,
        at: x.created_at,
        memberId: x.paid_by_member,
        title: x.merchant || x.note || "Expense",
        category: x.category,
        amount: x.amount,
        currency: x.currency,
      });
    }
    entries.sort((a, b) => (a.at < b.at ? 1 : -1));
    return entries;
  }, [tasks, shops, expenses]);

  const filteredFeed = useMemo(() => {
    const q = search.trim().toLowerCase();
    return feed.filter((e) => {
      if (typeFilter !== "all" && e.kind !== typeFilter) return false;
      if (memberFilter !== "all" && e.memberId !== memberFilter) return false;
      if (q && !e.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [feed, typeFilter, memberFilter, search]);

  // Group feed by day
  const grouped = useMemo(() => {
    const map = new Map<string, FeedEntry[]>();
    for (const e of filteredFeed) {
      const day = new Date(e.at).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
      (map.get(day) ?? map.set(day, []).get(day)!).push(e);
    }
    return Array.from(map.entries());
  }, [filteredFeed]);

  // Hero numbers
  const onTime = tasks.filter((t) => t.due_date && t.completed_at && new Date(t.completed_at) <= new Date(t.due_date + "T23:59:59")).length;
  const withDue = tasks.filter((t) => !!t.due_date).length;
  const onTimePct = withDue ? Math.round((onTime / withDue) * 100) : null;

  // Spending: group by currency (most common shown in hero)
  const spend = useMemo(() => {
    const byCurrency = new Map<string, number>();
    const byCategory = new Map<string, { amount: number; currency: string }>();
    for (const e of expenses) {
      byCurrency.set(e.currency, (byCurrency.get(e.currency) ?? 0) + e.amount);
      const key = e.category;
      const prev = byCategory.get(key);
      // category totals are bucketed by the dominant currency for that category
      if (!prev) byCategory.set(key, { amount: e.amount, currency: e.currency });
      else byCategory.set(key, { amount: prev.amount + e.amount, currency: prev.currency });
    }
    const sortedCurrencies = [...byCurrency.entries()].sort((a, b) => b[1] - a[1]);
    const primary = sortedCurrencies[0] ?? null;
    const categories = [...byCategory.entries()]
      .map(([cat, v]) => ({ category: cat, ...v }))
      .sort((a, b) => b.amount - a.amount);
    return {
      count: expenses.length,
      byCurrency: sortedCurrencies,
      primary,
      categories,
    };
  }, [expenses]);

  // Budget tracking: scoped to the CURRENT calendar month regardless of `scope`.
  const budgetTracking = useMemo(() => {
    if (budgets.length === 0) return null;
    const monthStartTs = new Date(currentMonthStart + "T00:00:00").getTime();
    const monthEnd = new Date(currentMonthStart + "T00:00:00");
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    const monthEndTs = monthEnd.getTime();
    const totalByCur = new Map<string, number>();
    const byCatCur = new Map<string, number>();
    for (const e of expensesAll) {
      const t = new Date(e.created_at).getTime();
      if (t < monthStartTs || t >= monthEndTs) continue;
      totalByCur.set(e.currency, (totalByCur.get(e.currency) ?? 0) + e.amount);
      byCatCur.set(`${e.currency}|${e.category}`, (byCatCur.get(`${e.currency}|${e.category}`) ?? 0) + e.amount);
    }
    const overall = budgets
      .filter((b) => b.category === null)
      .map((b) => ({ currency: b.currency, limit: b.amount, spent: totalByCur.get(b.currency) ?? 0 }));
    const byCategory = budgets
      .filter((b) => b.category !== null)
      .map((b) => ({
        category: b.category as string,
        currency: b.currency,
        limit: b.amount,
        spent: byCatCur.get(`${b.currency}|${b.category}`) ?? 0,
      }))
      .sort((a, b) => (b.spent / (b.limit || 1)) - (a.spent / (a.limit || 1)));
    return { overall, byCategory };
  }, [budgets, expensesAll, currentMonthStart]);



  // Per-member stats
  const memberStats = useMemo(() => {
    return members.map((m) => {
      const tasksCreated = createdTasks.filter((t) => t.created_by === m.user_id).length;
      const mTasks = tasks.filter((t) => t.assigned_to === m.id);
      const claimed = tasks.filter((t) => {
        // approximation of "up for grabs": claimed by someone other than creator
        if (t.assigned_to !== m.id) return false;
        const assignee = memberMap.get(m.id);
        return assignee && assignee.user_id !== t.created_by;
      }).length;
      const onTimeM = mTasks.filter((t) => t.due_date && t.completed_at && new Date(t.completed_at) <= new Date(t.due_date + "T23:59:59")).length;
      const withDueM = mTasks.filter((t) => !!t.due_date).length;
      const catCount: Record<string, number> = {};
      mTasks.forEach((t) => { catCount[t.category] = (catCount[t.category] ?? 0) + 1; });
      const topCat = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0];
      const avgMs = mTasks
        .filter((t) => t.completed_at && t.created_at)
        .reduce((sum, t, _, arr) => sum + (new Date(t.completed_at!).getTime() - new Date(t.created_at).getTime()) / arr.length, 0);
      const avgHours = avgMs ? Math.round(avgMs / 3600000) : null;
      const mShops = shops.filter((s) => (s.checked_by_member ?? s.added_by_member) === m.id);
      const mExpenses = expenses.filter((x) => x.paid_by_member === m.id);
      const spentByCurrency = new Map<string, number>();
      mExpenses.forEach((x) => spentByCurrency.set(x.currency, (spentByCurrency.get(x.currency) ?? 0) + x.amount));
      const topSpend = [...spentByCurrency.entries()].sort((a, b) => b[1] - a[1])[0];
      // Streak: use ALL tasks (not scoped) so streak reflects reality
      const completedDates = [
        ...tasksAll.filter((t) => t.assigned_to === m.id && t.completed_at).map((t) => t.completed_at!),
        ...shopAll.filter((s) => (s.checked_by_member ?? s.added_by_member) === m.id && s.checked_at).map((s) => s.checked_at!),
      ];
      const streak = computeStreak(completedDates);
      return {
        member: m,
        tasksDone: mTasks.length,
        tasksCreated,
        itemsBought: mShops.length,
        expenseCount: mExpenses.length,
        spent: topSpend ? { amount: topSpend[1], currency: topSpend[0] } : null,
        onTimePct: withDueM ? Math.round((onTimeM / withDueM) * 100) : null,
        topCategory: topCat ? topCat[0] : null,
        topCount: topCat ? topCat[1] : 0,
        claimedCount: claimed,
        avgHours,
        streak,
      };
    }).sort((a, b) => (b.tasksDone + b.itemsBought + b.expenseCount) - (a.tasksDone + a.itemsBought + a.expenseCount));
  }, [members, tasks, shops, expenses, tasksAll, shopAll, memberMap, createdTasks]);

  const creationLeaderboard = useMemo(
    () => [...memberStats].sort((a, b) => b.tasksCreated - a.tasksCreated).filter((s) => s.tasksCreated > 0),
    [memberStats]
  );

  const dishwasherKing = memberStats.find((s) => s.topCategory === "chore" && s.topCount >= 3);


  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-3xl">
          <History className="h-7 w-7" /> The Record
        </h1>
        <p className="text-sm text-muted-foreground">
          Everything {activeMembership?.household.name} has done together.
        </p>
      </div>

      {/* Scope toggle */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            onClick={() => setScope(s.id)}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
              scope === s.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Hero stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <HeroStat icon={<ListChecks />} label="Tasks done" value={tasks.length} accent="bg-primary/10 text-primary" />
        <HeroStat icon={<ShoppingCart />} label="Items bought" value={shops.length} accent="bg-secondary text-foreground" />
        <HeroStat
          icon={<Wallet />}
          label="Spent"
          value={spend.primary ? fmtMoney(spend.primary[1], spend.primary[0]) : "—"}
          sub={
            spend.count === 0
              ? "no expenses logged"
              : spend.byCurrency.length > 1
                ? `${spend.count} expenses · +${spend.byCurrency.length - 1} more currenc${spend.byCurrency.length - 1 === 1 ? "y" : "ies"}`
                : `${spend.count} expense${spend.count === 1 ? "" : "s"}`
          }
          accent="bg-highlight/20 text-highlight-foreground"
        />
        <HeroStat icon={<Clock />} label="On time" value={onTimePct == null ? "—" : `${onTimePct}%`} accent="bg-accent/40 text-foreground" sub={withDue ? `${onTime}/${withDue} with due dates` : "no due dates set"} />
        <HeroStat icon={<TrendingUp />} label="Active members" value={memberStats.filter((m) => m.tasksDone + m.itemsBought + m.expenseCount > 0).length} sub={`of ${members.length}`} accent="bg-muted text-foreground" />
      </div>

      {/* Monthly budget */}
      <section className="paper-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Target className="h-5 w-5" /> Monthly budget
          </h2>
          <button
            onClick={() => setBudgetOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted"
          >
            <Pencil className="h-3.5 w-3.5" />
            {budgetTracking ? "Edit" : "Set budget"}
          </button>
        </div>
        {!budgetTracking ? (
          <p className="text-sm text-muted-foreground">
            No budget set for {new Date(currentMonthStart).toLocaleDateString(undefined, { month: "long", year: "numeric" })} yet. Set one to see how the household is tracking.
          </p>
        ) : (
          <div className="space-y-4">
            {budgetTracking.overall.length > 0 && (
              <div className="space-y-2">
                {budgetTracking.overall.map((o) => (
                  <BudgetBar
                    key={`ov-${o.currency}`}
                    label="Overall"
                    spent={o.spent}
                    limit={o.limit}
                    currency={o.currency}
                    emphasis
                  />
                ))}
              </div>
            )}
            {budgetTracking.byCategory.length > 0 && (
              <div className="space-y-2">
                {budgetTracking.byCategory.map((c) => {
                  const meta = BUDGET_CATEGORIES.find((b) => b.id === c.category);
                  return (
                    <BudgetBar
                      key={`${c.currency}-${c.category}`}
                      label={`${meta?.emoji ?? "✨"} ${meta?.label ?? c.category}`}
                      spent={c.spent}
                      limit={c.limit}
                      currency={c.currency}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Spending breakdown */}
      {spend.categories.length > 0 && (
        <section className="paper-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Receipt className="h-5 w-5" /> Where the money went
            </h2>
            {spend.byCurrency.length > 1 && (
              <div className="text-[11px] text-muted-foreground">
                {spend.byCurrency.map(([c, a]) => `${fmtMoney(a, c)}`).join(" · ")}
              </div>
            )}
          </div>
          <div className="space-y-2">
            {spend.categories.slice(0, 6).map((c) => {
              const max = spend.categories[0].amount || 1;
              const pct = Math.max(4, Math.round((c.amount / max) * 100));
              return (
                <div key={c.category}>
                  <div className="mb-1 flex items-center justify-between text-xs font-semibold">
                    <span className="capitalize">
                      {CAT_EMOJI[c.category] ?? "✨"} {c.category}
                    </span>
                    <span className="tabular-nums">{fmtMoney(c.amount, c.currency)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Task Creator Leaderboard */}
      {creationLeaderboard.length > 0 && (
        <TaskCreatorLeaderboard leaderboard={creationLeaderboard} scope={scope} />
      )}

      {/* Highlight line */}
      {dishwasherKing && (
        <div className="paper-card flex items-center gap-3 px-4 py-3">
          <Sparkles className="h-5 w-5 text-highlight" />
          <p className="text-sm">
            <span className="font-bold">{dishwasherKing.member.display_name}</span> is the household's chore champion —{" "}
            <span className="font-bold">{dishwasherKing.topCount}</span> chores in this period.
          </p>
        </div>
      )}

      {/* Per-member */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">By the people who did it</h2>
        {memberStats.length === 0 ? (
          <EmptyCard>No members yet.</EmptyCard>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {memberStats.map((s) => (
              <MemberCard key={s.member.id} s={s} />
            ))}
          </div>
        )}
      </section>

      {/* Activity feed */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Activity</h2>
          <div className="flex flex-1 items-center gap-2 md:max-w-md">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full rounded-full border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted"
            >
              <Filter className="h-3.5 w-3.5" /> Filter
              <ChevronDown className={`h-3.5 w-3.5 transition ${showFilters ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="paper-card flex flex-wrap items-center gap-3 p-3 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Who:</span>
              <FilterPill active={memberFilter === "all"} onClick={() => setMemberFilter("all")}>Everyone</FilterPill>
              {members.map((m) => (
                <FilterPill key={m.id} active={memberFilter === m.id} onClick={() => setMemberFilter(m.id)}>
                  <span>{m.avatar_emoji}</span> {m.display_name}
                </FilterPill>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Type:</span>
              <FilterPill active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>All</FilterPill>
              <FilterPill active={typeFilter === "task"} onClick={() => setTypeFilter("task")}>Tasks</FilterPill>
              <FilterPill active={typeFilter === "shop"} onClick={() => setTypeFilter("shop")}>Shopping</FilterPill>
              <FilterPill active={typeFilter === "expense"} onClick={() => setTypeFilter("expense")}>Expenses</FilterPill>
            </div>
          </div>
        )}

        {filteredFeed.length === 0 ? (
          <EmptyCard>
            {feed.length === 0
              ? "Nothing yet in this period — be the first to check something off!"
              : "Nothing matches those filters."}
          </EmptyCard>
        ) : (
          <div className="space-y-5">
            {grouped.map(([day, entries]) => (
              <div key={day}>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{day}</h3>
                <div className="paper-card overflow-hidden">
                  {entries.map((e, i) => (
                    <FeedRow key={`${e.kind}-${e.id}`} e={e} member={e.memberId ? memberMap.get(e.memberId) : undefined} last={i === entries.length - 1} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <BudgetDialog open={budgetOpen} onClose={() => setBudgetOpen(false)} />
    </div>
  );
}

function BudgetBar({
  label,
  spent,
  limit,
  currency,
  emphasis,
}: {
  label: string;
  spent: number;
  limit: number;
  currency: string;
  emphasis?: boolean;
}) {
  const ratio = limit > 0 ? spent / limit : 0;
  const pct = Math.min(100, Math.round(ratio * 100));
  const over = spent > limit;
  const remaining = limit - spent;
  const color = over ? "bg-destructive" : ratio >= 0.85 ? "bg-highlight" : "bg-primary";
  return (
    <div>
      <div className={`mb-1 flex items-center justify-between gap-2 ${emphasis ? "text-sm font-bold" : "text-xs font-semibold"}`}>
        <span className="truncate capitalize">{label}</span>
        <span className="tabular-nums whitespace-nowrap">
          {fmtMoney(spent, currency)}{" "}
          <span className="text-muted-foreground font-normal">/ {fmtMoney(limit, currency)}</span>
        </span>
      </div>
      <div className={`overflow-hidden rounded-full bg-muted ${emphasis ? "h-2.5" : "h-1.5"}`}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(over ? 100 : 4, pct)}%` }} />
      </div>
      <div className={`mt-1 flex items-center justify-between text-[11px] ${over ? "text-destructive" : "text-muted-foreground"}`}>
        <span>{pct}% used</span>
        <span className="tabular-nums">
          {over ? `${fmtMoney(spent - limit, currency)} over` : `${fmtMoney(remaining, currency)} left`}
        </span>
      </div>
    </div>
  );
}

function HeroStat({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: number | string; sub?: string; accent: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="paper-card p-4"
    >
      <div className={`mb-2 inline-grid h-9 w-9 place-items-center rounded-xl ${accent}`}>
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      </div>
      <div className="text-2xl font-extrabold leading-none">{value}</div>
      <div className="mt-1 text-xs font-semibold text-muted-foreground">{label}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </motion.div>
  );
}

function MemberCard({ s }: { s: ReturnType<typeof useMemberStatsType> }) {
  const m = s.member;
  const total = s.tasksDone + s.itemsBought + s.expenseCount;
  return (
    <div className="paper-card p-4">
      <div className="flex items-center gap-3">
        <div
          className="grid h-12 w-12 place-items-center rounded-2xl text-2xl"
          style={{ background: `${m.color}22`, border: `2px solid ${m.color}55` }}
        >
          {m.avatar_emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="truncate font-bold">{m.display_name}</div>
          <div className="text-xs capitalize text-muted-foreground">{m.role}</div>
        </div>
        {s.streak > 0 && (
          <div className="inline-flex items-center gap-1 rounded-full bg-highlight/20 px-2 py-1 text-xs font-bold text-highlight-foreground" title="Current streak">
            <Flame className="h-3.5 w-3.5" /> {s.streak}d
          </div>
        )}
      </div>
      {total === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nothing yet in this period.</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            <Stat n={s.tasksCreated} label="created" />
            <Stat n={s.tasksDone} label="done" />
            <Stat n={s.itemsBought} label="items" />
            <Stat n={s.onTimePct == null ? "—" : `${s.onTimePct}%`} label="on time" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            {s.topCategory && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 font-semibold">
                {CAT_EMOJI[s.topCategory] ?? "✨"} Most: {s.topCategory} ({s.topCount})
              </span>
            )}
            {s.claimedCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 font-semibold text-primary">
                <Award className="h-3 w-3" /> Stepped up {s.claimedCount}×
              </span>
            )}
            {s.avgHours != null && s.avgHours > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 font-semibold">
                <Clock className="h-3 w-3" /> ~{s.avgHours < 24 ? `${s.avgHours}h` : `${Math.round(s.avgHours / 24)}d`} avg
              </span>
            )}
            {s.spent && (
              <span className="inline-flex items-center gap-1 rounded-full bg-highlight/20 px-2 py-1 font-semibold text-highlight-foreground">
                <Wallet className="h-3 w-3" /> {fmtMoney(s.spent.amount, s.spent.currency)}
                {s.expenseCount > 0 && <span className="opacity-70">· {s.expenseCount}</span>}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="rounded-xl bg-muted/60 p-2">
      <div className="text-lg font-extrabold leading-none">{n}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function FeedRow({ e, member, last }: { e: FeedEntry; member?: Member; last: boolean }) {
  const verb = e.kind === "task" ? "completed" : e.kind === "shop" ? "bought" : "paid for";
  return (
    <div className={`flex items-start gap-3 px-4 py-3 ${last ? "" : "border-b border-border/40"}`}>
      <div
        className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-base"
        style={member ? { background: `${member.color}22`, border: `2px solid ${member.color}55` } : undefined}
      >
        {member?.avatar_emoji ?? "👤"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
          <span className="font-bold">{member?.display_name ?? "Someone"}</span>
          <span className="text-muted-foreground">{verb}</span>
          <span className="font-semibold">{e.title}</span>
          {e.kind === "shop" && e.quantity && (
            <span className="text-xs text-muted-foreground">· {e.quantity}</span>
          )}
          {e.kind === "expense" && (
            <span className="text-sm font-bold tabular-nums text-highlight-foreground">
              {fmtMoney(e.amount, e.currency)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5">
            {CAT_EMOJI[e.category] ?? "•"} {e.category}
          </span>
          {e.kind === "task" && e.priority === "high" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 font-semibold text-destructive">high</span>
          )}
          {e.kind === "task" && e.onTime === true && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
              <CheckCircle2 className="h-3 w-3" /> on time
            </span>
          )}
          {e.kind === "task" && e.onTime === false && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5">late</span>
          )}
          <span>· {relTime(e.at)}</span>
        </div>
      </div>
      <div className="shrink-0 text-muted-foreground">
        {e.kind === "task" ? <ListChecks className="h-4 w-4" /> : e.kind === "shop" ? <ShoppingCart className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
      </div>
    </div>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="paper-card p-8 text-center">
      <Sparkles className="mx-auto h-7 w-7 text-muted-foreground" />
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

const SCOPE_LABELS: Record<Scope, string> = {
  week: "this week", month: "this month", "3m": "last 3 months", year: "this year", all: "all time",
};

const MEDALS = ["🥇", "🥈", "🥉"];

function TaskCreatorLeaderboard({
  leaderboard,
  scope,
}: {
  leaderboard: { member: Member; tasksCreated: number }[];
  scope: Scope;
}) {
  const max = leaderboard[0]?.tasksCreated ?? 1;
  const leader = leaderboard[0];

  return (
    <section className="paper-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Trophy className="h-5 w-5 text-highlight-foreground" /> Task Creator Leaderboard
        </h2>
        <span className="text-xs text-muted-foreground capitalize">{SCOPE_LABELS[scope]}</span>
      </div>

      {leader && (
        <div className="flex items-center gap-3 rounded-2xl bg-primary/8 p-3 ring-1 ring-primary/20">
          <span className="text-2xl">🥇</span>
          <div
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-2xl"
            style={{ background: `${leader.member.color}22`, border: `2px solid ${leader.member.color}55` }}
          >
            {leader.member.avatar_emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold">{leader.member.display_name}</div>
            <div className="text-xs text-muted-foreground">
              Added <span className="font-bold text-foreground">{leader.tasksCreated}</span> task{leader.tasksCreated === 1 ? "" : "s"} — keeping the household organised!
            </div>
          </div>
          <Plus className="h-5 w-5 text-primary" />
        </div>
      )}

      <div className="space-y-2">
        {leaderboard.map((s, i) => {
          const pct = Math.max(6, Math.round((s.tasksCreated / max) * 100));
          return (
            <div key={s.member.id} className="flex items-center gap-3">
              <span className="w-6 shrink-0 text-center text-sm font-bold text-muted-foreground">
                {MEDALS[i] ?? `${i + 1}`}
              </span>
              <div
                className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-lg"
                style={{ background: `${s.member.color}22`, border: `2px solid ${s.member.color}44` }}
              >
                {s.member.avatar_emoji}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-semibold truncate">{s.member.display_name}</span>
                  <span className="ml-2 shrink-0 text-sm font-extrabold tabular-nums">{s.tasksCreated}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Add tasks to climb the leaderboard and keep your household running smoothly ✨
      </p>
    </section>
  );
}

// Type helper so MemberCard props stay in sync with the inline memo above
function useMemberStatsType() {
  return {} as {
    member: Member;
    tasksDone: number;
    tasksCreated: number;
    itemsBought: number;
    expenseCount: number;
    spent: { amount: number; currency: string } | null;
    onTimePct: number | null;
    topCategory: string | null;
    topCount: number;
    claimedCount: number;
    avgHours: number | null;
    streak: number;
  };
}
