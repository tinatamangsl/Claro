import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Loader2, Receipt, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useHearth } from "@/lib/hearth-context";
import { useServerFn } from "@tanstack/react-start";
import { parseReceipt, type ParsedReceipt } from "@/lib/receipts.functions";
import { useQueryClient } from "@tanstack/react-query";

const EXPENSE_CATEGORIES = [
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

type Mode = "choose" | "manual" | "photo";

const TASK_TO_EXPENSE_CATEGORY: Record<string, string> = {
  chore: "household",
  errand: "other",
  repair: "repairs",
  admin: "bills",
  other: "other",
};

export function ExpenseDialog({ open, onClose, initialLinkedTaskId, initialTaskData }: {
  open: boolean;
  onClose: () => void;
  initialLinkedTaskId?: string;
  initialTaskData?: { title: string; category: string };
}) {
  const { user, activeHouseholdId, activeMembership } = useHearth();
  const qc = useQueryClient();
  const parse = useServerFn(parseReceipt);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("choose");
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState(initialTaskData?.title ?? "");
  const [category, setCategory] = useState<string>(
    initialTaskData ? (TASK_TO_EXPENSE_CATEGORY[initialTaskData.category] ?? "other") : "groceries"
  );
  const [currency, setCurrency] = useState<string>("GBP");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);

  // Linking to tasks + shopping items
  const [openTasks, setOpenTasks] = useState<{ id: string; title: string }[]>([]);
  const [openItems, setOpenItems] = useState<{ id: string; name: string; quantity: string | null }[]>([]);
  const [linkedTaskId, setLinkedTaskId] = useState<string>(initialLinkedTaskId ?? "");
  const [linkedItemIds, setLinkedItemIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !activeHouseholdId) return;
    let cancelled = false;
    (async () => {
      const [t, s] = await Promise.all([
        supabase
          .from("tasks")
          .select("id,title")
          .eq("household_id", activeHouseholdId)
          .neq("status", "done")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("shopping_items")
          .select("id,name,quantity")
          .eq("household_id", activeHouseholdId)
          .eq("checked", false)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      if (cancelled) return;
      setOpenTasks((t.data ?? []) as { id: string; title: string }[]);
      setOpenItems((s.data ?? []) as { id: string; name: string; quantity: string | null }[]);
    })();
    return () => { cancelled = true; };
  }, [open, activeHouseholdId]);

  function pickFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10 MB");
      return;
    }
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
    setMode("photo");
    void scan(file);
  }

  async function scan(file: File) {
    setScanning(true);
    try {
      const base64 = await fileToBase64(file);
      const result: ParsedReceipt = await parse({ data: { imageBase64: base64, mimeType: file.type } });
      if (result.total != null) setAmount(String(result.total));
      if (result.merchant) setMerchant(result.merchant);
      if (result.currency && CURRENCIES.includes(result.currency as (typeof CURRENCIES)[number])) {
        setCurrency(result.currency);
      }
      if (result.date) setDate(result.date);
      if (result.category && EXPENSE_CATEGORIES.some((c) => c.id === result.category)) {
        setCategory(result.category);
      }
      if (result.items?.length) {
        setNote(result.items.slice(0, 8).map((it) => it.name).join(", "));
      }
      if (result.total == null && !result.merchant) {
        toast.warning("Couldn't read this receipt — fill it in manually below.");
      } else {
        toast.success("Receipt scanned");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Receipt scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function save() {
    if (!user || !activeHouseholdId || !activeMembership) return;
    const n = Number(amount);
    if (!isFinite(n) || n <= 0) return toast.error("Enter a valid amount");
    setSaving(true);

    let receipt_path: string | null = null;
    try {
      if (imageFile) {
        const ext = imageFile.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `${activeHouseholdId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("receipts")
          .upload(path, imageFile, { contentType: imageFile.type, upsert: false });
        if (upErr) throw upErr;
        receipt_path = path;
      }

      const { error } = await supabase.from("expenses").insert({
        household_id: activeHouseholdId,
        amount: n,
        currency,
        category,
        merchant: merchant.trim() || null,
        note: note.trim() || null,
        expense_date: date,
        paid_by_member: activeMembership.id,
        paid_by_user: user.id,
        receipt_path,
        source: imageFile ? "receipt" : "manual",
      });
      if (error) throw error;

      // Link to task → mark done (and claim it for the payer if unassigned)
      if (linkedTaskId) {
        const { data: existing } = await supabase
          .from("tasks")
          .select("assigned_to")
          .eq("id", linkedTaskId)
          .maybeSingle();
        const { error: tErr } = await supabase
          .from("tasks")
          .update({
            status: "done",
            completed_at: new Date().toISOString(),
            assigned_to: existing?.assigned_to ?? activeMembership.id,
          })
          .eq("id", linkedTaskId)
          .eq("household_id", activeHouseholdId);
        if (tErr) console.error(tErr);
      }

      // Link to shopping items → check them off
      if (linkedItemIds.length) {
        const { error: sErr } = await supabase
          .from("shopping_items")
          .update({
            checked: true,
            checked_at: new Date().toISOString(),
            checked_by_member: activeMembership.id,
          })
          .in("id", linkedItemIds)
          .eq("household_id", activeHouseholdId);
        if (sErr) console.error(sErr);
      }

      toast.success("Expense logged 💛");
      qc.invalidateQueries({ queryKey: ["expenses", activeHouseholdId] });
      qc.invalidateQueries({ queryKey: ["tasks", activeHouseholdId] });
      qc.invalidateQueries({ queryKey: ["record-expenses", activeHouseholdId] });
      qc.invalidateQueries({ queryKey: ["record-tasks", activeHouseholdId] });
      qc.invalidateQueries({ queryKey: ["record-shop", activeHouseholdId] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save expense");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50"
          />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border bg-background p-5 pb-8 shadow-2xl md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:rounded-3xl"
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-border md:hidden" />
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <Receipt className="h-5 w-5" /> Log expense
              </h2>
              <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            {mode === "choose" && (
              <div className="grid grid-cols-2 gap-3">
                <ChooserButton
                  onClick={() => cameraInput.current?.click()}
                  icon={<Camera className="h-6 w-6" />}
                  label="Scan receipt"
                  hint="Camera + AI"
                  primary
                />
                <ChooserButton
                  onClick={() => setMode("manual")}
                  icon={<Sparkles className="h-6 w-6" />}
                  label="Enter manually"
                  hint="Type it in"
                />
                <button
                  onClick={() => fileInput.current?.click()}
                  className="col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 py-3 text-sm font-semibold text-muted-foreground hover:bg-muted"
                >
                  <Upload className="h-4 w-4" /> or upload an image
                </button>
              </div>
            )}

            {(mode === "manual" || mode === "photo") && (
              <div className="space-y-3">
                {mode === "photo" && imagePreview && (
                  <div className="relative overflow-hidden rounded-2xl border border-border">
                    <img src={imagePreview} alt="Receipt" className="max-h-56 w-full object-cover" />
                    {scanning && (
                      <div className="absolute inset-0 grid place-items-center bg-background/85 backdrop-blur-sm">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <Loader2 className="h-4 w-4 animate-spin" /> Reading receipt…
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => { setImageFile(null); setImagePreview(null); setMode("choose"); }}
                      className="absolute right-2 top-2 rounded-full bg-background/90 p-1.5 text-foreground hover:bg-background"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <div>
                    <Label>Amount</Label>
                    <input
                      type="number" inputMode="decimal" step="0.01" min="0"
                      value={amount} onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00" autoFocus={mode === "manual"}
                      className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-lg font-bold outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div>
                    <Label>Currency</Label>
                    <select
                      value={currency} onChange={(e) => setCurrency(e.target.value)}
                      className="rounded-2xl border border-border bg-background px-3 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <Label>Merchant</Label>
                  <input
                    value={merchant} onChange={(e) => setMerchant(e.target.value)}
                    placeholder="e.g. Trader Joe's" maxLength={120}
                    className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Category</Label>
                    <select
                      value={category} onChange={(e) => setCategory(e.target.value)}
                      className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Date</Label>
                    <input
                      type="date" value={date} onChange={(e) => setDate(e.target.value)}
                      className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                </div>

                <div>
                  <Label>Note (optional)</Label>
                  <textarea
                    value={note} onChange={(e) => setNote(e.target.value)}
                    rows={2} maxLength={500}
                    placeholder="Items, splits, etc."
                    className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                {(openTasks.length > 0 || openItems.length > 0) && (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-3 space-y-3">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Link to (optional)
                    </div>

                    {openTasks.length > 0 && (
                      <div>
                        <Label>Task — will be marked done</Label>
                        <select
                          value={linkedTaskId}
                          onChange={(e) => setLinkedTaskId(e.target.value)}
                          className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                        >
                          <option value="">— None —</option>
                          {openTasks.map((t) => (
                            <option key={t.id} value={t.id}>{t.title}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {openItems.length > 0 && (
                      <div>
                        <Label>Shopping items — will be checked off</Label>
                        <div className="max-h-40 overflow-y-auto rounded-2xl border border-border bg-background p-2 space-y-1">
                          {openItems.map((it) => {
                            const checked = linkedItemIds.includes(it.id);
                            return (
                              <label
                                key={it.id}
                                className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-muted"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) =>
                                    setLinkedItemIds((prev) =>
                                      e.target.checked
                                        ? [...prev, it.id]
                                        : prev.filter((x) => x !== it.id),
                                    )
                                  }
                                  className="h-4 w-4 rounded accent-primary"
                                />
                                <span className="flex-1 truncate">{it.name}</span>
                                {it.quantity && (
                                  <span className="text-xs text-muted-foreground">{it.quantity}</span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                        {linkedItemIds.length > 0 && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {linkedItemIds.length} item{linkedItemIds.length === 1 ? "" : "s"} selected
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}


                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setMode("choose")}
                    className="rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted"
                  >
                    Back
                  </button>
                  <button
                    onClick={save}
                    disabled={saving || scanning || !amount}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save expense
                  </button>
                </div>
              </div>
            )}

            <input
              ref={cameraInput} type="file" accept="image/*" capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])}
            />
            <input
              ref={fileInput} type="file" accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{children}</div>;
}

function ChooserButton({
  onClick, icon, label, hint, primary,
}: { onClick: () => void; icon: React.ReactNode; label: string; hint: string; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`group flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition ${
        primary
          ? "border-primary/30 bg-primary/10 hover:bg-primary/15"
          : "border-border bg-card hover:bg-muted"
      }`}
    >
      <div className={`grid h-11 w-11 place-items-center rounded-xl ${primary ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
        {icon}
      </div>
      <div className="mt-1 font-bold">{label}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </button>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      // strip data URL prefix
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export { EXPENSE_CATEGORIES };
