import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type Household = {
  id: string;
  name: string;
  emoji: string;
  accent_color: string;
  invite_code: string;
  created_by: string;
};

export type Membership = {
  id: string;
  household_id: string;
  user_id: string;
  display_name: string;
  avatar_emoji: string;
  color: string;
  role: "parent" | "adult" | "teen" | "kid";
  birthday: string | null;
  is_admin: boolean;
  household: Household;
};

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  default_household_id: string | null;
};

type Ctx = {
  loading: boolean;
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  memberships: Membership[];
  activeHouseholdId: string | null;
  activeMembership: Membership | null;
  setActiveHousehold: (id: string | null) => void;
  setDefaultHousehold: (id: string | null) => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const HearthCtx = createContext<Ctx | null>(null);

const ACTIVE_KEY = "hearth.activeHouseholdId";

export function HearthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeHouseholdId, setActiveHouseholdIdState] = useState<string | null>(null);

  const loadAll = useCallback(async (u: User | null) => {
    if (!u) {
      setProfile(null);
      setMemberships([]);
      setActiveHouseholdIdState(null);
      return;
    }
    const [{ data: prof }, { data: mems }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", u.id).maybeSingle(),
      supabase
        .from("household_members")
        .select("*, household:households(*)")
        .eq("user_id", u.id)
        .order("joined_at", { ascending: true }),
    ]);
    setProfile((prof as Profile) ?? null);
    const list = (mems ?? []) as unknown as Membership[];
    setMemberships(list);

    // Pick active household: last-used → default → first available
    const stored = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_KEY) : null;
    const candidates = list.map((m) => m.household_id);
    let active: string | null = null;
    if (stored && candidates.includes(stored)) active = stored;
    else if (prof?.default_household_id && candidates.includes(prof.default_household_id)) active = prof.default_household_id;
    else if (list.length > 0) active = list[0].household_id;
    setActiveHouseholdIdState(active);
    if (active && typeof window !== "undefined") localStorage.setItem(ACTIVE_KEY, active);
  }, []);

  useEffect(() => {
    let mounted = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      if (!mounted) return;
      setLoading(true);
      setSession(sess);
      setUser(sess?.user ?? null);
      // defer DB calls
      setTimeout(() => {
        loadAll(sess?.user ?? null).finally(() => mounted && setLoading(false));
      }, 0);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      loadAll(data.session?.user ?? null).finally(() => mounted && setLoading(false));
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadAll]);

  const setActiveHousehold = useCallback((id: string | null) => {
    setActiveHouseholdIdState(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(ACTIVE_KEY, id);
      else localStorage.removeItem(ACTIVE_KEY);
    }
  }, []);

  const setDefaultHousehold = useCallback(async (id: string | null) => {
    if (!user) return;
    await supabase.from("profiles").update({ default_household_id: id }).eq("id", user.id);
    setProfile((p) => (p ? { ...p, default_household_id: id } : p));
  }, [user]);

  const refresh = useCallback(async () => {
    await loadAll(user);
  }, [user, loadAll]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") localStorage.removeItem(ACTIVE_KEY);
  }, []);

  const activeMembership = memberships.find((m) => m.household_id === activeHouseholdId) ?? null;

  return (
    <HearthCtx.Provider
      value={{
        loading,
        user,
        session,
        profile,
        memberships,
        activeHouseholdId,
        activeMembership,
        setActiveHousehold,
        setDefaultHousehold,
        refresh,
        signOut,
      }}
    >
      {children}
    </HearthCtx.Provider>
  );
}

export function useHearth() {
  const v = useContext(HearthCtx);
  if (!v) throw new Error("useHearth must be used within HearthProvider");
  return v;
}
