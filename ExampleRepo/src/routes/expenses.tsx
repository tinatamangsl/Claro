import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useHearth } from "@/lib/hearth-context";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Receipt, Plus, Settings2, TrendingUp, Wallet, Scale,
  Camera, Trash2, ChevronDown, ChevronUp, Users,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ExpenseDialog } from "@/components/ExpenseDialog";

export const Route = createFileRoute("/expenses")({
  component: () => <AppShell><ExpensesPage /></AppShell>,
  head: () => ({ meta: [{ title: "Expenses — HearthHub" }] }),
});

// ─── Types ────────────────────────────────────────────────────────────────────

type Scope = "week" | "month" | "3m" | "year" | "all";

const SCOPES: { id: Scope; label: string }[] = [
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
  { id: "3m", label: "Last 3 Months" },
  { id: "year", label: "This Year" },
  { id: "all", label: "All Time" },
];

type Expense = {
  id: string;
  amount: number;
  currency: string;
  category: string;
  merchant: string | null;
  note: string | null;
  expense_date: string;
  paid_by_member: string;
  receipt_path: string | null;
  source: string;
  created_at: string;
};

type Member = {
  id: string;
  display_name: string;
  avatar_emoji: string;
  color: string;
};

type Weight = { member_id: string; weight: number };

type Settlement = { from: Member; to: Member; amount: number; currency: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scopeStart(scope: Scope): string | null {
  if (scope === "all") return null;
  const d = new Date();
  if (scope === "week") d.setDate(d.getDate() - 7);
  else if (scope === "month") d.setMonth(d.getMonth() - 1);
  else if (scope === "3m") d.setMonth(d.getMonth() - 3);
  else if (scope === "year") d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function fmtMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

const CAT_META: Record<string, { label: string; emoji: string }> = {
  groceries:     { label: "Groceries",     emoji: "🛒" },
  household:     { label: "Household",     emoji: "🧻" },
  pharmacy:      { label: "Pharmacy",      emoji: "💊" },
  bills:         { label: "Bills",         emoji: "🧾" },
  repairs:       { label: "Repairs",       emoji: "🔧" },
  subscriptions: { label: "Subscriptions", emoji: "🔁" },
  restaurant:    { label: "Restaurant",    emoji: "🍽️" },
  transport:     { label: "Transport",     emoji: "🚗" },
  other:         { label: "Other",         emoji: "✨" },
};

function catMeta(id: string) {
  return CAT_META[id] ?? { label: id, emoji: "✨" };
}

// Greedy settlement: minimise number of transactions.
function computeSettlements(
  expenses: Expense[],
  members: Member[],
  weightMap: Map<string, number>,
): Settlement[] {
  const totalWeight = [...weightMap.values()].reduce((a, b) => a + b, 0);
  if (totalWeight === 0 || members.length === 0 || expenses.length === 0) return [];

  // Work in primary currency only
  const byCur = new Map<string, number>();
  for (const e of expenses) byCur.set(e.currency, (byCur.get(e.currency) ?? 0) + e.amount);
  const primaryCur = [...byCur.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  const primary = expenses.filter((e) => e.currency === primaryCur);

  const nets = new Map<string, number>(members.map((m) => [m.id, 0]));
  for (const e of primary) {
    nets.set(e.paid_by_member, (nets.get(e.paid_by_member) ?? 0) + e.amount);
    for (const m of members) {
      const w = weightMap.get(m.id) ?? totalWeight / members.length;
      nets.set(m.id, (nets.get(m.id) ?? 0) - e.amount * (w / totalWeight));
    }
  }

  const creditors = [...nets.entries()].filter(([, v]) => v > 0.005).map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v);
  const debtors   = [...nets.entries()].filter(([, v]) => v < -0.005).map(([id, v]) => ({ id, v: -v })).sort((a, b) => b.v - a.v);
  const crAmts = creditors.map((c) => c.v);
  const dtAmts = debtors.map((d) => d.v);
  const result: Settlement[] = [];
  let ci = 0, di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const amt = Math.min(crAmts[ci], dtAmts[di]);
    if (amt > 0.005) {
      const from = members.find((m) => m.id === debtors[di].id);
      const to   = members.find((m) => m.id === creditors[ci].id);
      if (from && to) result.push({ from, to, amount: Math.round(amt * 100) / 100, currency: primaryCur });
    }
    crAmts[ci] -= amt; dtAmts[di] -= amt;
    if (crAmts[ci] < 0.005) ci++;
    if (dtAmts[di] < 0.005) di++;
  }
  return result;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ExpensesPage() {
  const { activeHouseholdId, activeMembership } = useHearth();
  const hid = activeHouseholdId!;
  const qc = useQueryClient();

  const [scope, setScope] = useState<Scope>("month");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseKey, setExpenseKey] = useState(0);
  const [editingWeights, setEditingWeights] = useState(false);
  const [draftWeights, setDraftWeights] = useState<Record<string, string>>({});
  const [showExpenseList, setShowExpenseList] = useState(false);

  const startDate = scopeStart(scope);

  const { data: allExpenses = [] } = useQuery({
    queryKey: ["expenses-page", hid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id,amount,currency,category,merchant,note,expense_date,paid_by_member,receipt_path,source,created_at")
        .eq("household_id", hid)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []).map((e) => ({ ...e, amount: Number(e.amount) })) as Expense[];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["expenses-members", hid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("household_members")
        .select("id,display_name,avatar_emoji,color")
        .eq("household_id", hid);
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const { data: savedWeights = [] } = useQuery({
    queryKey: ["expense-weights", hid],
    queryFn: async () => {
      const { data } = await supabase
        .from("household_expense_weights")
        .select("member_id,weight")
        .eq("household_id", hid);
      return ((data ?? []).map((w) => ({ ...w, weight: Number(w.weight) }))) as Weight[];
    },
  });

  // Scope-filtered expenses
  const expenses = useMemo(
    () => allExpenses.filter((e) => !startDate || e.expense_date >= startDate),
    [allExpenses, startDate],
  );

  // Effective weight map (default = 1 per member = equal split)
  const weightMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of members) {
      const saved = savedWeights.find((w) => w.member_id === m.id);
      map.set(m.id, saved ? saved.weight : 1);
    }
    return map;
  }, [members, savedWeights]);

  const totalWeight = useMemo(
    () => [...weightMap.values()].reduce((a, b) => a + b, 0) || 1,
    [weightMap],
  );

  // Primary currency
  const primaryCurrency = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of expenses) m.set(e.currency, (m.get(e.currency) ?? 0) + e.amount);
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  }, [expenses]);

  const totalSpend = expenses.filter((e) => e.currency === primaryCurrency).reduce((s, e) => s + e.amount, 0);

  // Per-member breakdown
  const memberStats = useMemo(() => {
    return members.map((m) => {
      const mExp = expenses.filter((e) => e.paid_by_member === m.id && e.currency === primaryCurrency);
      const paid = mExp.reduce((s, e) => s + e.amount, 0);
      const w = weightMap.get(m.id) ?? 1;
      const pct = (w / totalWeight) * 100;
      const shouldPay = expenses
        .filter((e) => e.currency === primaryCurrency)
        .reduce((s, e) => s + e.amount * (w / totalWeight), 0);
      const balance = paid - shouldPay;
      const catMap: Record<string, number> = {};
      mExp.forEach((e) => { catMap[e.category] = (catMap[e.category] ?? 0) + e.amount; });
      const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
      return { member: m, paid, shouldPay, balance, pct, count: mExp.length, topCat };
    }).sort((a, b) => b.paid - a.paid);
  }, [members, expenses, weightMap, totalWeight, primaryCurrency]);

  // Settlements
  const settlements = useMemo(
    () => computeSettlements(expenses, members, weightMap),
    [expenses, members, weightMap],
  );

  // Last 6 months time series (uses allExpenses, not scoped)
  const timeSeriesData = useMemo(() => {
    const months: { key: string; label: string; total: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: d.toLocaleDateString(undefined, { month: "short" }), total: 0 });
    }
    for (const e of allExpenses) {
      if (e.currency !== primaryCurrency) continue;
      const key = e.expense_date.slice(0, 7);
      const m = months.find((m) => m.key === key);
      if (m) m.total += e.amount;
    }
    return months;
  }, [allExpenses, primaryCurrency]);

  // Category breakdown for current scope
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      if (e.currency !== primaryCurrency) continue;
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    }
    return [...map.entries()]
      .map(([cat, amount]) => ({ cat, amount, label: `${catMeta(cat).emoji} ${catMeta(cat).label}` }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [expenses, primaryCurrency]);

  // Weight editing
  function startEditWeights() {
    const draft: Record<string, string> = {};
    for (const m of members) draft[m.id] = String(weightMap.get(m.id) ?? 1);
    setDraftWeights(draft);
    setEditingWeights(true);
  }

  async function saveWeights() {
    const upserts = members.map((m) => ({
      household_id: hid,
      member_id: m.id,
      weight: Math.max(0, parseFloat(draftWeights[m.id] ?? "1") || 0),
    }));
    const { error } = await supabase
      .from("household_expense_weights")
      .upsert(upserts, { onConflict: "household_id,member_id" });
    if (error) return toast.error(error.message);
    toast.success("Split weights saved");
    qc.invalidateQueries({ queryKey: ["expense-weights", hid] });
    setEditingWeights(false);
  }

  const draftTotal = editingWeights
    ? members.reduce((s, m) => s + Math.max(0, parseFloat(draftWeights[m.id]) || 0), 0)
    : 0;

  async function deleteExpense(id: string, receiptPath: string | null) {
    if (!confirm("Delete this expense?")) return;
    if (receiptPath) await supabase.storage.from("receipts").remove([receiptPath]).catch(() => {});
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["expenses-page", hid] });
    toast.success("Deleted");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl">
            <Receipt className="h-7 w-7" /> Expenses
          </h1>
          <p className="text-sm text-muted-foreground">
            Track &amp; split spending across {activeMembership?.household.name}.
          </p>
        </div>
        <button
          onClick={() => { setExpenseKey((k) => k + 1); setExpenseOpen(true); }}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Log expense
        </button>
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <HeroStat icon="💸" label="Total spent"     value={fmtMoney(totalSpend, primaryCurrency)} accent="bg-primary/10 text-primary" />
        <HeroStat icon="🧾" label="Expenses"        value={expenses.length} accent="bg-muted text-foreground" />
        <HeroStat icon="👥" label="Contributors"    value={`${memberStats.filter((s) => s.count > 0).length}/${members.length}`} accent="bg-secondary text-foreground" />
        <HeroStat
          icon="📊"
          label="Avg per expense"
          value={expenses.length > 0 ? fmtMoney(totalSpend / expenses.length, primaryCurrency) : "—"}
          accent="bg-highlight/20 text-highlight-foreground"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Spending over time */}
        <section className="paper-card p-4 space-y-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <TrendingUp className="h-4 w-4" /> Spending over time
            </h2>
            <p className="text-[11px] text-muted-foreground">Last 6 months · {primaryCurrency}</p>
          </div>
          <ChartContainer config={{ total: { label: "Spent", color: "var(--color-primary)" } }} className="h-44">
            <AreaChart data={timeSeriesData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--color-primary)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/40" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={44}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area type="monotone" dataKey="total" stroke="var(--color-primary)" strokeWidth={2} fill="url(#areaGrad)" />
            </AreaChart>
          </ChartContainer>
        </section>

        {/* Category breakdown */}
        <section className="paper-card p-4 space-y-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Wallet className="h-4 w-4" /> By category
            </h2>
            <p className="text-[11px] text-muted-foreground">Current period · {primaryCurrency}</p>
          </div>
          {categoryData.length === 0 ? (
            <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
              No expenses in this period
            </div>
          ) : (
            <ChartContainer config={{ amount: { label: "Amount", color: "var(--color-primary)" } }} className="h-44">
              <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border/40" />
                <XAxis
                  type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="amount" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </section>
      </div>

      {/* Per-member spending vs share chart */}
      {members.length > 1 && expenses.length > 0 && (
        <section className="paper-card p-4 space-y-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Users className="h-4 w-4" /> Paid vs fair share — per member
            </h2>
            <p className="text-[11px] text-muted-foreground">Solid = paid · Faded = weighted share</p>
          </div>
          <ChartContainer
            config={{ paid: { label: "Paid", color: "var(--color-primary)" }, shouldPay: { label: "Fair share", color: "var(--color-muted-foreground)" } }}
            className="h-48"
          >
            <BarChart
              data={memberStats.map((s) => ({
                name: `${s.member.avatar_emoji} ${s.member.display_name}`,
                paid: parseFloat(s.paid.toFixed(2)),
                shouldPay: parseFloat(s.shouldPay.toFixed(2)),
              }))}
              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/40" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={44}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="paid"      fill="var(--color-primary)"          radius={[4, 4, 0, 0]} />
              <Bar dataKey="shouldPay" fill="var(--color-primary)" fillOpacity={0.25} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </section>
      )}

      {/* Settlement */}
      <section className="paper-card p-4 space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Scale className="h-5 w-5" /> Who owes who
        </h2>
        {settlements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {expenses.length === 0
              ? "Log some expenses to see the settlement."
              : "🎉 All settled up!"}
          </p>
        ) : (
          <div className="space-y-2">
            {settlements.map((s, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl bg-muted/50 px-4 py-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xl"
                  style={{ background: `${s.from.color}22`, border: `2px solid ${s.from.color}44` }}>
                  {s.from.avatar_emoji}
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <span className="font-bold">{s.from.display_name}</span>
                  <span className="text-muted-foreground"> owes </span>
                  <span className="font-bold">{s.to.display_name}</span>
                </div>
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xl"
                  style={{ background: `${s.to.color}22`, border: `2px solid ${s.to.color}44` }}>
                  {s.to.avatar_emoji}
                </div>
                <span className="text-base font-extrabold tabular-nums text-destructive shrink-0">
                  {fmtMoney(s.amount, s.currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Expense split weights */}
      <section className="paper-card p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Settings2 className="h-5 w-5" /> Split weights
            </h2>
            <p className="text-xs text-muted-foreground">
              How much of household expenses each member is responsible for.
              Enter any relative numbers — they're normalised to percentages automatically.
            </p>
          </div>
          {!editingWeights ? (
            <button
              onClick={startEditWeights}
              className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted"
            >
              Edit
            </button>
          ) : (
            <div className="flex shrink-0 gap-2">
              <button onClick={() => setEditingWeights(false)} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                Cancel
              </button>
              <button onClick={saveWeights} className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                Save
              </button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {members.map((m) => {
            const rawVal = editingWeights
              ? (parseFloat(draftWeights[m.id]) || 0)
              : (weightMap.get(m.id) ?? 1);
            const effectiveTotal = editingWeights ? draftTotal : totalWeight;
            const pct = effectiveTotal > 0 ? (rawVal / effectiveTotal) * 100 : 0;
            return (
              <div key={m.id} className="flex items-center gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xl"
                  style={{ background: `${m.color}22`, border: `2px solid ${m.color}44` }}>
                  {m.avatar_emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between text-xs font-semibold">
                    <span>{m.display_name}</span>
                    <span className="tabular-nums text-muted-foreground">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.max(2, pct)}%`, background: m.color }}
                    />
                  </div>
                </div>
                {editingWeights ? (
                  <input
                    type="number"
                    min="0"
                    max="9999"
                    step="1"
                    value={draftWeights[m.id] ?? ""}
                    onChange={(e) => setDraftWeights((d) => ({ ...d, [m.id]: e.target.value }))}
                    className="w-16 rounded-xl border border-border bg-background px-2 py-1 text-center text-sm outline-none focus:border-primary"
                  />
                ) : (
                  <span className="w-16 text-center text-sm font-bold tabular-nums text-muted-foreground">
                    {rawVal}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {editingWeights && (
          <p className="text-xs text-muted-foreground">
            Total: <span className={`font-bold ${draftTotal === 0 ? "text-destructive" : "text-foreground"}`}>{draftTotal}</span>
            {" "}— e.g. enter 80, 15, 5 for an 80% / 15% / 5% split.
          </p>
        )}
      </section>

      {/* Per-member breakdown */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Per member</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {memberStats.map((s) => (
            <MemberExpenseCard key={s.member.id} s={s} currency={primaryCurrency} />
          ))}
        </div>
      </section>

      {/* Full expense list */}
      <section className="space-y-3">
        <button
          onClick={() => setShowExpenseList((v) => !v)}
          className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left font-bold hover:bg-muted"
        >
          <span>All expenses ({expenses.length})</span>
          {showExpenseList ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showExpenseList && (
          expenses.length === 0 ? (
            <div className="paper-card p-10 text-center">
              <Receipt className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-lg font-bold">No expenses in this period</p>
            </div>
          ) : (
            <div className="paper-card overflow-hidden">
              {expenses.map((e, i) => {
                const member = members.find((m) => m.id === e.paid_by_member);
                const cat = catMeta(e.category);
                return (
                  <div
                    key={e.id}
                    className={`flex items-center gap-3 px-4 py-3 ${i < expenses.length - 1 ? "border-b border-border/40" : ""}`}
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-lg">
                      {cat.emoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold truncate">{e.merchant || cat.label}</span>
                        {e.source === "receipt" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                            <Camera className="h-2.5 w-2.5" /> scanned
                          </span>
                        )}
                        {e.note && <span className="text-xs text-muted-foreground truncate">{e.note}</span>}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        {member && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold"
                            style={{ background: `${member.color}18`, color: member.color }}
                          >
                            {member.avatar_emoji} {member.display_name}
                          </span>
                        )}
                        <span>· {new Date(e.expense_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                        <span className="rounded-full bg-muted px-1.5 py-0.5">{cat.emoji} {cat.label}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-extrabold tabular-nums">{fmtMoney(e.amount, e.currency)}</div>
                    </div>
                    <button
                      onClick={() => deleteExpense(e.id, e.receipt_path)}
                      className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )
        )}
      </section>

      <ExpenseDialog
        key={expenseKey}
        open={expenseOpen}
        onClose={() => {
          setExpenseOpen(false);
          qc.invalidateQueries({ queryKey: ["expenses-page", hid] });
        }}
      />
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function HeroStat({ icon, label, value, sub, accent }: {
  icon: string; label: string; value: string | number; sub?: string; accent: string;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="paper-card p-4">
      <div className={`mb-2 inline-grid h-9 w-9 place-items-center rounded-xl text-lg ${accent}`}>{icon}</div>
      <div className="text-2xl font-extrabold leading-none">{value}</div>
      <div className="mt-1 text-xs font-semibold text-muted-foreground">{label}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </motion.div>
  );
}

function MemberExpenseCard({ s, currency }: {
  s: {
    member: Member;
    paid: number;
    shouldPay: number;
    balance: number;
    pct: number;
    count: number;
    topCat: [string, number] | undefined;
  };
  currency: string;
}) {
  const { member, paid, shouldPay, balance, pct, count, topCat } = s;
  const isOwed = balance > 0.01;
  const owes   = balance < -0.01;

  return (
    <div className="paper-card p-4">
      <div className="flex items-center gap-3">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-2xl"
          style={{ background: `${member.color}22`, border: `2px solid ${member.color}55` }}
        >
          {member.avatar_emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{member.display_name}</div>
          <div className="text-xs text-muted-foreground">
            {pct.toFixed(1)}% of split · {count} expense{count === 1 ? "" : "s"}
          </div>
        </div>
        {isOwed && (
          <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary">
            +{fmtMoney(balance, currency)}
          </span>
        )}
        {owes && (
          <span className="shrink-0 rounded-full bg-destructive/12 px-2.5 py-1 text-xs font-bold text-destructive">
            {fmtMoney(balance, currency)}
          </span>
        )}
        {!isOwed && !owes && count > 0 && (
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            Even ✓
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-muted/60 p-2 text-center">
          <div className="text-base font-extrabold tabular-nums leading-none">{fmtMoney(paid, currency)}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">paid</div>
        </div>
        <div className="rounded-xl bg-muted/60 p-2 text-center">
          <div className="text-base font-extrabold tabular-nums leading-none">{fmtMoney(shouldPay, currency)}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">fair share</div>
        </div>
      </div>

      {topCat && (
        <div className="mt-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">
            {catMeta(topCat[0]).emoji} Most: {catMeta(topCat[0]).label} · {fmtMoney(topCat[1], currency)}
          </span>
        </div>
      )}

      {/* Balance bar */}
      {(paid > 0 || shouldPay > 0) && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
            <span>Paid</span><span>Fair share</span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-muted">
            {/* Fair share marker */}
            {shouldPay > 0 && paid > 0 && (
              <div
                className="absolute top-0 h-full w-0.5 bg-foreground/30 z-10"
                style={{ left: `${Math.min(100, (shouldPay / Math.max(paid, shouldPay)) * 100)}%` }}
              />
            )}
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, shouldPay > 0 ? (paid / Math.max(paid, shouldPay)) * 100 : 100)}%`,
                background: isOwed ? "var(--color-primary)" : owes ? "var(--color-destructive)" : member.color,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
