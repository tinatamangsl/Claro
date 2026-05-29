import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useHearth } from "@/lib/hearth-context";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Check, ShoppingCart, Sparkles, Receipt, Camera } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { ExpenseDialog, EXPENSE_CATEGORIES } from "@/components/ExpenseDialog";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/shopping")({
  validateSearch: (search: Record<string, unknown>) => ({
    logExpense: search.logExpense === true || search.logExpense === "true",
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
    taskTitle: typeof search.taskTitle === "string" ? search.taskTitle : undefined,
    taskCategory: typeof search.taskCategory === "string" ? search.taskCategory : undefined,
  }),
  component: () => <AppShell><ShoppingPage /></AppShell>,
  head: () => ({ meta: [{ title: "Shopping — HearthHub" }] }),
});

type Item = {
  id: string;
  household_id: string;
  name: string;
  quantity: string | null;
  category: string;
  note: string | null;
  checked: boolean;
  checked_at: string | null;
  checked_by_member: string | null;
  added_by_member: string;
  added_by_user: string;
  created_at: string;
};

const CATEGORIES = [
  { id: "produce", label: "Produce", emoji: "🥬" },
  { id: "dairy", label: "Dairy", emoji: "🥛" },
  { id: "meat", label: "Meat & Fish", emoji: "🍗" },
  { id: "bakery", label: "Bakery", emoji: "🥖" },
  { id: "pantry", label: "Pantry", emoji: "🥫" },
  { id: "frozen", label: "Frozen", emoji: "🧊" },
  { id: "drinks", label: "Drinks", emoji: "🧃" },
  { id: "household", label: "Household", emoji: "🧻" },
  { id: "other", label: "Other", emoji: "🛒" },
] as const;

function catMeta(id: string) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

function ShoppingPage() {
  const { user, activeHouseholdId, activeMembership } = useHearth();
  const { logExpense, taskId, taskTitle, taskCategory } = Route.useSearch();
  const navigate = useNavigate();
  const hasConsumedExpenseParams = useRef(false);
  const [initialExpenseTaskId, setInitialExpenseTaskId] = useState<string | undefined>(undefined);
  const [initialTaskData, setInitialTaskData] = useState<{ title: string; category: string } | undefined>(undefined);
  const [tab, setTab] = useState<"list" | "expenses">("list");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseKey, setExpenseKey] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [adding, setAdding] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeHouseholdId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("shopping_items")
        .select("*")
        .eq("household_id", activeHouseholdId)
        .order("checked", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(500);
      if (cancelled) return;
      if (error) toast.error(error.message);
      setItems((data ?? []) as Item[]);
      setLoading(false);
    })();

    const channel = supabase
      .channel(`shopping:${activeHouseholdId}`, { config: { private: true } })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shopping_items", filter: `household_id=eq.${activeHouseholdId}` },
        (payload) => {
          setItems((prev) => {
            if (payload.eventType === "INSERT") {
              const n = payload.new as Item;
              if (prev.some((x) => x.id === n.id)) return prev;
              return [n, ...prev];
            }
            if (payload.eventType === "UPDATE") {
              const n = payload.new as Item;
              return prev.map((x) => (x.id === n.id ? n : x));
            }
            if (payload.eventType === "DELETE") {
              const o = payload.old as { id: string };
              return prev.filter((x) => x.id !== o.id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [activeHouseholdId]);

  useEffect(() => {
    if (logExpense && !hasConsumedExpenseParams.current) {
      hasConsumedExpenseParams.current = true;
      setExpenseKey((k: number) => k + 1);
      setExpenseOpen(true);
      if (taskId) {
        setInitialExpenseTaskId(taskId);
        if (taskTitle && taskCategory) {
          setInitialTaskData({ title: taskTitle, category: taskCategory });
        }
      }
      navigate({ to: "/shopping", replace: true });
    }
  }, [logExpense, taskId, taskTitle, taskCategory, navigate]);

  const pastItems = useMemo(() => {
    const seen = new Map<string, { name: string; category: string }>();
    for (const it of [...items].reverse()) {
      seen.set(it.name.toLowerCase(), { name: it.name, category: it.category });
    }
    return Array.from(seen.values());
  }, [items]);

  const filteredSuggestions = useMemo(() => {
    const q = name.toLowerCase().trim();
    if (!q) return pastItems.slice(0, 8);
    return pastItems.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 8);
  }, [pastItems, name]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (inputWrapperRef.current && !inputWrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { open, done } = useMemo(() => {
    const o: Item[] = [];
    const d: Item[] = [];
    for (const it of items) (it.checked ? d : o).push(it);
    return { open: o, done: d };
  }, [items]);

  const grouped = useMemo(() => {
    const map: Record<string, Item[]> = {};
    for (const it of open) (map[it.category] ??= []).push(it);
    return CATEGORIES.map((c) => ({ ...c, items: map[c.id] ?? [] })).filter((c) => c.items.length > 0);
  }, [open]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !activeHouseholdId || !activeMembership) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setAdding(true);
    const { error } = await supabase.from("shopping_items").insert({
      household_id: activeHouseholdId,
      name: trimmed,
      quantity: quantity.trim() || null,
      category,
      added_by_member: activeMembership.id,
      added_by_user: user.id,
    });
    setAdding(false);
    if (error) return toast.error(error.message);
    setName("");
    setQuantity("");
  }

  async function toggle(it: Item) {
    if (!activeMembership) return;
    const next = !it.checked;
    const { error } = await supabase
      .from("shopping_items")
      .update({
        checked: next,
        checked_at: next ? new Date().toISOString() : null,
        checked_by_member: next ? activeMembership.id : null,
      })
      .eq("id", it.id);
    if (error) toast.error(error.message);
  }

  async function remove(id: string) {
    const { error } = await supabase.from("shopping_items").delete().eq("id", id);
    if (error) toast.error(error.message);
  }

  async function clearDone() {
    if (!activeHouseholdId) return;
    if (!confirm("Clear all checked items?")) return;
    const { error } = await supabase
      .from("shopping_items")
      .delete()
      .eq("household_id", activeHouseholdId)
      .eq("checked", true);
    if (error) toast.error(error.message);
    else toast.success("Cleared");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl flex items-center gap-2"><ShoppingCart className="h-7 w-7" /> Shopping</h1>
          <p className="text-sm text-muted-foreground">Shared with everyone in {activeMembership?.household.name}.</p>
        </div>
        <button
          onClick={() => { setExpenseKey((k: number) => k + 1); setExpenseOpen(true); }}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm hover:opacity-90"
        >
          <Receipt className="h-4 w-4" /> Log expense
        </button>
      </div>

      <div className="inline-flex rounded-full border border-border bg-card p-1 text-sm font-semibold">
        <button
          onClick={() => setTab("list")}
          className={`rounded-full px-4 py-1.5 transition ${tab === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          List
        </button>
        <button
          onClick={() => setTab("expenses")}
          className={`rounded-full px-4 py-1.5 transition ${tab === "expenses" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Expenses
        </button>
      </div>

      {tab === "list" ? (
        <>
          <div className="flex items-center justify-end">
            {done.length > 0 && (
              <button onClick={clearDone} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                Clear {done.length} done
              </button>
            )}
          </div>

          <form onSubmit={add} className="paper-card p-4">
            <div className="flex flex-col gap-2 md:flex-row">
              <div ref={inputWrapperRef} className="relative flex-1">
                <input
                  value={name}
                  onChange={(e) => { setName(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="Add an item…"
                  maxLength={200}
                  className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                />
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-2xl border border-border bg-background shadow-lg">
                    {filteredSuggestions.map((s) => {
                      const cat = catMeta(s.category);
                      return (
                        <button
                          key={s.name}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setName(s.name);
                            setCategory(s.category);
                            setShowSuggestions(false);
                          }}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted"
                        >
                          <span className="text-base">{cat.emoji}</span>
                          <span className="flex-1 font-medium">{s.name}</span>
                          <span className="text-xs text-muted-foreground">{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Qty (e.g. 2 lb)"
                maxLength={40}
                className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40 md:w-32"
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={adding || !name.trim()}
                className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          </form>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : open.length === 0 && done.length === 0 ? (
            <div className="paper-card p-10 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-lg font-bold">Nothing on the list</p>
              <p className="text-sm text-muted-foreground">Add the first item above — everyone in your household will see it.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map((group) => (
                <section key={group.id} className="paper-card overflow-hidden">
                  <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
                    <span className="text-xl">{group.emoji}</span>
                    <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{group.label}</h2>
                    <span className="ml-auto text-xs text-muted-foreground">{group.items.length}</span>
                  </header>
                  <ul>
                    <AnimatePresence initial={false}>
                      {group.items.map((it) => (
                        <ItemRow key={it.id} item={it} onToggle={toggle} onRemove={remove} />
                      ))}
                    </AnimatePresence>
                  </ul>
                </section>
              ))}

              {done.length > 0 && (
                <section className="paper-card overflow-hidden opacity-75">
                  <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
                    <Check className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Done</h2>
                    <span className="ml-auto text-xs text-muted-foreground">{done.length}</span>
                  </header>
                  <ul>
                    <AnimatePresence initial={false}>
                      {done.map((it) => (
                        <ItemRow key={it.id} item={it} onToggle={toggle} onRemove={remove} />
                      ))}
                    </AnimatePresence>
                  </ul>
                </section>
              )}
            </div>
          )}
        </>
      ) : (
        <ExpensesList onLogExpense={() => setExpenseOpen(true)} />
      )}

      <ExpenseDialog
        key={expenseKey}
        open={expenseOpen}
        onClose={() => { hasConsumedExpenseParams.current = false; setExpenseOpen(false); setInitialExpenseTaskId(undefined); setInitialTaskData(undefined); }}
        initialLinkedTaskId={initialExpenseTaskId}
        initialTaskData={initialTaskData}
      />
    </div>
  );
}

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

type MemberLite = { id: string; display_name: string; avatar_emoji: string; color: string };

function ExpensesList({ onLogExpense }: { onLogExpense: () => void }) {
  const { activeHouseholdId } = useHearth();
  const hid = activeHouseholdId!;

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["expenses", hid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("household_id", hid)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["shopping-members", hid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("household_members")
        .select("id,display_name,avatar_emoji,color")
        .eq("household_id", hid);
      if (error) throw error;
      return (data ?? []) as MemberLite[];
    },
  });
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const currency = expenses[0]?.currency ?? "USD";

  async function remove(id: string, receipt_path: string | null) {
    if (!confirm("Delete this expense?")) return;
    if (receipt_path) await supabase.storage.from("receipts").remove([receipt_path]).catch(() => {});
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Deleted");
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (expenses.length === 0) {
    return (
      <div className="paper-card p-10 text-center">
        <Receipt className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-lg font-bold">No expenses yet</p>
        <p className="text-sm text-muted-foreground">Snap a receipt or enter one manually.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={onLogExpense} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
            <Camera className="h-4 w-4" /> Log first expense
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="paper-card flex items-center justify-between p-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent total</div>
          <div className="text-3xl font-extrabold">{formatMoney(total, currency)}</div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {expenses.length} expense{expenses.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="paper-card overflow-hidden">
        {expenses.map((e, i) => {
          const m = memberMap.get(e.paid_by_member);
          const cat = EXPENSE_CATEGORIES.find((c) => c.id === e.category) ?? EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
          return (
            <div key={e.id} className={`flex items-center gap-3 px-4 py-3 ${i === expenses.length - 1 ? "" : "border-b border-border/40"}`}>
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-muted text-lg">{cat.emoji}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="truncate font-semibold">{e.merchant || cat.label}</span>
                  {e.source === "receipt" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                      <Camera className="h-2.5 w-2.5" /> scanned
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  {m && (
                    <span className="inline-flex items-center gap-1">
                      <span>{m.avatar_emoji}</span> {m.display_name}
                    </span>
                  )}
                  <span>· {new Date(e.expense_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                  {e.note && <span className="truncate">· {e.note}</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="font-extrabold tabular-nums">{formatMoney(Number(e.amount), e.currency)}</div>
              </div>
              <button
                onClick={() => remove(e.id, e.receipt_path)}
                aria-label="Delete"
                className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function ItemRow({ item, onToggle, onRemove }: { item: Item; onToggle: (i: Item) => void; onRemove: (id: string) => void }) {
  const cat = catMeta(item.category);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex items-center gap-3 border-b border-border/40 px-4 py-3 last:border-b-0"
    >
      <button
        onClick={() => onToggle(item)}
        aria-label={item.checked ? "Mark as not bought" : "Mark as bought"}
        className={`grid h-6 w-6 place-items-center rounded-full border-2 transition ${item.checked ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary"}`}
      >
        {item.checked && <Check className="h-3.5 w-3.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className={`truncate text-sm font-semibold ${item.checked ? "line-through text-muted-foreground" : ""}`}>
          {item.name}
          {item.quantity && <span className="ml-2 text-xs font-normal text-muted-foreground">· {item.quantity}</span>}
        </div>
        {!item.checked && (
          <div className="text-[11px] text-muted-foreground sm:hidden">{cat.emoji} {cat.label}</div>
        )}
      </div>
      <button
        onClick={() => onRemove(item.id)}
        aria-label="Remove"
        className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </motion.li>
  );
}
