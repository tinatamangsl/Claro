import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { useClaro } from "./claro-store";
import { supabase, syncAvailable } from "./supabase";
import { pull, push, type SyncToken } from "./sync-client";
import { forUpload, merge, overwriteBackupKey, planSignIn } from "./sync";

/**
 * Sync, as a layer strictly on top of a local-first app.
 *
 * Claro works the same whether or not any of this is switched on. The store is
 * still the source of truth in the browser, still saved to `localStorage` on
 * every change, and still readable offline; this mirrors it to an account and
 * brings it back on another device. Nothing here may block a render, and every
 * failure path leaves the local store untouched.
 *
 * The hydration contract is unchanged: this mounts inside `ClaroProvider` and
 * does nothing at all until the store reports `ready`, so it cannot make the
 * first client render differ from the server's.
 */

export type SyncStatus =
  /** No project configured, or nobody signed in. Purely local, as before. */
  | "off"
  | "signed-out"
  | "syncing"
  | "synced"
  | "error";

type SyncApi = {
  available: boolean;
  session: Session | null;
  status: SyncStatus;
  message: string | null;
  signIn: (email: string) => Promise<{ ok: boolean; message: string }>;
  signOut: () => Promise<void>;
};

const SyncContext = createContext<SyncApi | null>(null);

/**
 * What sync looks like where there is none: off, signed out, and inert.
 *
 * Returned when no provider is above the caller, which happens in the tests
 * that mount one screen on its own and would happen again the first time
 * somebody rendered a component somewhere new. Throwing there would be
 * punishing a component for asking a question it is entitled to ask, and the
 * honest answer is available: no provider means nothing is syncing.
 */
const INERT: SyncApi = {
  available: false,
  session: null,
  status: "off",
  message: null,
  signIn: async () => ({ ok: false, message: "Sync is not set up on this build." }),
  signOut: async () => {},
};

export function useSync(): SyncApi {
  return useContext(SyncContext) ?? INERT;
}

/**
 * Keep a copy of what an incoming snapshot is about to replace.
 *
 * Best effort and deliberately dumb: one key, overwritten each time, holding
 * the last thing this browser had before the account won. Nothing reads it
 * back, and it is not a version history. It exists so that being overwritten
 * by another device is a recoverable situation rather than a deletion, which
 * is the price of resolving conflicts without stopping to ask.
 */
function stashOverwritten(state: unknown) {
  try {
    window.localStorage.setItem(
      overwriteBackupKey,
      JSON.stringify({ at: new Date().toISOString(), state }),
    );
  } catch {
    // A full or unavailable localStorage must not stop a sync.
  }
}

/** How long to wait after a change before mirroring it up. */
const PUSH_DEBOUNCE_MS = 2_000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const { ready, state, replaceState } = useClaro();

  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SyncStatus>(syncAvailable ? "signed-out" : "off");
  const [message, setMessage] = useState<string | null>(null);

  /** The row version this device last saw. Null means "no row yet". */
  const token = useRef<SyncToken | null>(null);
  /** Set once the first sign-in reconciliation has run, so pushes may begin. */
  const reconciled = useRef(false);
  /**
   * Held for the whole of a reconciliation, not just after it succeeds.
   *
   * `reconciled` is only set at the end, so a second run of the effect while
   * the first was still awaiting the network would sail past that guard and
   * start its own pull and insert. Two inserts of the same primary key race,
   * one loses on a duplicate key, and the loser reports a conflict against a
   * table that had nothing in it a moment earlier.
   */
  const reconciling = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Watch the session rather than reading it once: a magic-link return lands
  // back on the page with the session established after the first render.
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        reconciled.current = false;
        token.current = null;
        setStatus("signed-out");
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Reconcile once, on sign-in, before any push is allowed to happen.
  useEffect(() => {
    if (!ready || !session || reconciled.current || reconciling.current) return;
    let cancelled = false;
    reconciling.current = true;

    (async () => {
      setStatus("syncing");
      const result = await pull(session.user.id);
      if (cancelled) return;

      if (!result.ok) {
        setStatus("error");
        setMessage(result.message);
        return;
      }

      token.current = result.row?.token ?? null;
      const plan = planSignIn({ local: state, remote: result.row?.payload ?? null });

      if (plan.action === "pull" && result.row) {
        // Keep what is about to be replaced. Being overwritten by another
        // device should be recoverable, even though nothing reads this back
        // automatically.
        stashOverwritten(state);
        replaceState(merge(state, result.row.payload));
      }

      /*
       * Seed the account, rather than waiting for the next edit to do it.
       *
       * This branch used to fall straight through to "synced", which was a lie
       * with nothing behind it: the push effect below only fires when `state`
       * changes, so signing in and then not touching anything left the account
       * empty while the footer said the writing was safely in it. Somebody
       * could sign in, close the tab, and lose a device believing they had a
       * copy.
       */
      if (plan.action === "push") {
        const seeded = await push(session.user.id, forUpload(state), token.current);
        if (cancelled) return;

        if (!seeded.ok) {
          if (seeded.reason === "conflict") {
            // Another device seeded the account first. Take what it wrote.
            const fresh = await pull(session.user.id);
            if (fresh.ok && fresh.row) {
              token.current = fresh.row.token;
              stashOverwritten(state);
              replaceState(merge(state, fresh.row.payload));
              reconciled.current = true;
              setStatus("synced");
              return;
            }
            setStatus("error");
            setMessage("Your account changed while this was loading.");
            return;
          }
          setStatus("error");
          setMessage(seeded.message);
          return;
        }
        token.current = seeded.token;
      }

      reconciled.current = true;
      setMessage(null);
      setStatus("synced");
    })().finally(() => {
      reconciling.current = false;
    });

    return () => {
      cancelled = true;
    };
  }, [ready, session?.user.id]);

  // Mirror every change up, debounced, once reconciliation has settled.
  useEffect(() => {
    if (!ready || !session || !reconciled.current) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);

    pushTimer.current = setTimeout(async () => {
      setStatus("syncing");
      const result = await push(session.user.id, forUpload(state), token.current);

      if (result.ok) {
        token.current = result.token;
        setStatus("synced");
        return;
      }
      if (result.reason === "conflict") {
        /*
         * Another device wrote between this one's last read and this write.
         * Take theirs and carry on rather than stopping to ask: the account is
         * the copy every device agrees with, so preferring it converges. What
         * this device was about to send is stashed first.
         */
        const fresh = await pull(session.user.id);
        if (fresh.ok && fresh.row) {
          token.current = fresh.row.token;
          stashOverwritten(state);
          replaceState(merge(state, fresh.row.payload));
          setStatus("synced");
          return;
        }
        setStatus("error");
        setMessage("Your account changed elsewhere and could not be re-read.");
        return;
      }
      setStatus("error");
      setMessage(result.message);
    }, PUSH_DEBOUNCE_MS);

    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [ready, session?.user.id, state]);

  const signIn = useCallback(async (email: string) => {
    if (!supabase) return { ok: false, message: "Sync is not set up on this build." };
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href },
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Check your email for a link to sign in." };
  }, []);

  const signOut = useCallback(async () => {
    // Signing out leaves everything on the device. It stops the mirroring; it
    // is not a delete, and nothing here removes a single local record.
    await supabase?.auth.signOut();
  }, []);

  return (
    <SyncContext.Provider
      value={{
        available: syncAvailable,
        session,
        status,
        message,
        signIn,
        signOut,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}
