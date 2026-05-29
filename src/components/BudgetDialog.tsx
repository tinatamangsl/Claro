import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useHearth } from "@/lib/hearth-context";
import { useQueryClient } from "@tanstack/react-query";

export const BUDGET_CATEGORIES = [
  { id: "groceries", label: "Groceries", emoji: "🛒" },
  { id: "household", label: "Household", emoji: "🧻" },
  { id: "pharmacy", label: "Pharmacy", emoji: "💊" },
  { id: "bills", label: "Bills", emoji: "🧾" },
  { id: "repairs", label: "Repairs", emoji: "🔧" },
  { id: "subscriptions", label: "Subscriptions", emoji: "🔁" },
  { id: "restaurant", label: "Restaurant", emoji: "🍽️" },
  { id: "transport", label: "Transport", emoji: "🚗" },
  { id: "other", label: "Other", emoji: "✨" },
] as const;

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "INR", "BRL", "MXN", "CHF"] as const;

function monthStart(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

type BudgetRow = {
  id: string;
  category: string | null;
  amount: number;
  currency: string;
};

export function BudgetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, activeHouseholdId, activeMembership } = useHearth();
  const qc = useQueryClient();

  const [currency, setCurrency] = useState<string>("GBP");
  const [overall, setOverall] = useState<string>("");
  const [perCat, setPerCat] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const month = useMemo(() => monthStart(), []);
  const monthLabel = useMemo(
    () => new Date(month).toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    [month]
  );

  useEffect(() => {
    if (!open || !activeHouseholdId) return;
    let active = true;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("household_budgets")
        .select("id,category,amount,currency")
        .eq("household_id", activeHouseholdId)
        .eq("month", month);
      if (!active) return;
      if (error) {
        toast.error("Couldn't load budgets");
      } else {
        const rows = (data ?? []) as BudgetRow[];
        // Pick the currency from the most-used row, else default GBP
        const curCounts = new Map<string, number>();
        rows.forEach((r) => curCounts.set(r.currency, (curCounts.get(r.currency) ?? 0) + 1));
        const preferred = [...curCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "GBP";
        setCurrency(preferred);
        const sameCur = rows.filter((r) => r.currency === preferred);
        const ov = sameCur.find((r) => r.category === null);
        setOverall(ov ? String(ov.amount) : "");
        const cats: Record<string, string> = {};
        sameCur.filter((r) => r.category).forEach((r) => {
          cats[r.category as string] = String(r.amount);
        });
        setPerCat(cats);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [open, activeHouseholdId, month]);

  const handleSave = async () => {
    if (!activeHouseholdId || !activeMembership || !user) return;
    setSaving(true);
    try {
      // Build rows to upsert + rows to delete (those cleared)
      const toUpsert: Array<{
        household_id: string;
        month: string;
        category: string | null;
        amount: number;
        currency: string;
        created_by_user: string;
        created_by_member: string;
      }> = [];

      const ovNum = overall.trim() ? Number(overall) : null;
      if (ovNum !== null && (!Number.isFinite(ovNum) || ovNum < 0)) {
        toast.error("Overall budget must be a positive number");
        setSaving(false);
        return;
      }
      if (ovNum && ovNum > 0) {
        toUpsert.push({
          household_id: activeHouseholdId,
          month,
          category: null,
          amount: ovNum,
          currency,
          created_by_user: user.id,
          created_by_member: activeMembership.id,
        });
      }

      for (const c of BUDGET_CATEGORIES) {
        const raw = (perCat[c.id] ?? "").trim();
        if (!raw) continue;
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) {
          toast.error(`${c.label} budget must be a positive number`);
          setSaving(false);
          return;
        }
        if (n > 0) {
          toUpsert.push({
            household_id: activeHouseholdId,
            month,
            category: c.id,
            amount: n,
            currency,
            created_by_user: user.id,
            created_by_member: activeMembership.id,
          });
        }
      }

      // Delete all existing budgets for this month, then re-insert.
      // (Partial unique indexes can't be used as upsert conflict targets in PostgREST.)
      const { error: delErr } = await supabase
        .from("household_budgets")
        .delete()
        .eq("household_id", activeHouseholdId)
        .eq("month", month);
      if (delErr) throw new Error(delErr.message);

      if (toUpsert.length > 0) {
        const { error } = await supabase
          .from("household_budgets")
          .insert(toUpsert);
        if (error) throw new Error(error.message);
      }

      qc.invalidateQueries({ queryKey: ["record-budgets", activeHouseholdId] });
      toast.success(`Budget saved for ${monthLabel}`);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || "Couldn't save budget");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-primary/10 p-2 text-primary">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Monthly budget</h2>
                  <p className="text-xs text-muted-foreground">{monthLabel}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                      Currency
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                      Overall monthly budget (optional)
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={overall}
                      onChange={(e) => setOverall(e.target.value)}
                      placeholder="e.g. 1500"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Tracks against all expenses logged this month in {currency}.
                    </p>
                  </div>

                  <div>
                    <div className="mb-1 text-xs font-semibold text-muted-foreground">
                      Per-category caps (optional)
                    </div>
                    <div className="space-y-2">
                      {BUDGET_CATEGORIES.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2"
                        >
                          <span className="text-base">{c.emoji}</span>
                          <span className="flex-1 text-sm font-medium">{c.label}</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={perCat[c.id] ?? ""}
                            onChange={(e) =>
                              setPerCat((p) => ({ ...p, [c.id]: e.target.value }))
                            }
                            placeholder="—"
                            className="w-28 rounded-lg border border-border bg-card px-2 py-1 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-primary/40"
                          />
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Leave a row blank to remove that cap. Caps apply to this month only.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <button
                onClick={onClose}
                className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || loading}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:opacity-90 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save budget
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
