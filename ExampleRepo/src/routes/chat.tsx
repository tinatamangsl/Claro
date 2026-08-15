import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useHearth } from "@/lib/hearth-context";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useState } from "react";
import { Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/chat")({
  component: () => <AppShell><ChatPage /></AppShell>,
  head: () => ({ meta: [{ title: "Chat — HearthHub" }] }),
});

type Msg = {
  id: string;
  household_id: string;
  member_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

type Member = {
  id: string;
  user_id: string;
  display_name: string;
  avatar_emoji: string;
  color: string;
};

function ChatPage() {
  const { user, activeHouseholdId, activeMembership } = useHearth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeHouseholdId) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      const [{ data: msgs }, { data: mems }] = await Promise.all([
        supabase
          .from("household_messages")
          .select("*")
          .eq("household_id", activeHouseholdId)
          .order("created_at", { ascending: true })
          .limit(500),
        supabase
          .from("household_members")
          .select("id,user_id,display_name,avatar_emoji,color")
          .eq("household_id", activeHouseholdId),
      ]);
      if (cancelled) return;
      setMessages((msgs ?? []) as Msg[]);
      const map: Record<string, Member> = {};
      (mems ?? []).forEach((m) => (map[m.id] = m as Member));
      setMembers(map);
      setLoading(false);
    })();

    const channel = supabase
      .channel(`household_messages:${activeHouseholdId}`, { config: { private: true } })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "household_messages",
          filter: `household_id=eq.${activeHouseholdId}`,
        },
        (payload) => {
          setMessages((prev) => {
            const m = payload.new as Msg;
            if (prev.some((x) => x.id === m.id)) return prev;
            return [...prev, m];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "household_messages",
          filter: `household_id=eq.${activeHouseholdId}`,
        },
        (payload) => {
          const old = payload.old as { id: string };
          setMessages((prev) => prev.filter((x) => x.id !== old.id));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [activeHouseholdId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || !activeHouseholdId || !activeMembership || !user) return;
    setSending(true);
    const { error } = await supabase.from("household_messages").insert({
      household_id: activeHouseholdId,
      member_id: activeMembership.id,
      user_id: user.id,
      body: text,
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setBody("");
  }

  async function remove(id: string) {
    const { error } = await supabase.from("household_messages").delete().eq("id", id);
    if (error) toast.error(error.message);
  }

  const accent = activeMembership?.household.accent_color ?? "#E07856";

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-4">
        <h1 className="text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          {activeMembership?.household.emoji} Household chat
        </h1>
        <p className="text-sm text-muted-foreground">
          Messages are visible only to members of {activeMembership?.household.name}.
        </p>
      </header>

      <div className="paper-card flex h-[calc(100vh-18rem)] min-h-[420px] flex-col overflow-hidden">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {loading ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">Loading messages…</div>
          ) : messages.length === 0 ? (
            <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
              No messages yet. Say hi 👋
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((m) => {
                const mine = m.user_id === user?.id;
                const author = members[m.member_id];
                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}
                  >
                    <div
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg"
                      style={{ backgroundColor: (author?.color ?? "#ddd") + "33" }}
                      title={author?.display_name}
                    >
                      {author?.avatar_emoji ?? "🙂"}
                    </div>
                    <div className={`group max-w-[75%] ${mine ? "items-end text-right" : ""}`}>
                      <div className="mb-0.5 text-xs text-muted-foreground">
                        {author?.display_name ?? "Member"} ·{" "}
                        {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <div
                        className="inline-block whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm"
                        style={
                          mine
                            ? { backgroundColor: accent, color: "white" }
                            : { backgroundColor: "var(--muted)" }
                        }
                      >
                        {m.body}
                      </div>
                      {mine && (
                        <button
                          onClick={() => remove(m.id)}
                          className="ml-2 text-muted-foreground opacity-0 transition group-hover:opacity-100"
                          title="Delete"
                        >
                          <Trash2 className="inline h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={send} className="flex items-center gap-2 border-t border-border/60 bg-background/60 p-3">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a message…"
            maxLength={2000}
            className="flex-1 rounded-2xl border border-border bg-card px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            type="submit"
            disabled={sending || !body.trim()}
            className="inline-flex items-center gap-1 rounded-2xl px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            style={{ backgroundColor: accent }}
          >
            <Send className="h-4 w-4" /> Send
          </button>
        </form>
      </div>
    </div>
  );
}
