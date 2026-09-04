import { supabase } from "./supabase";
import type { SyncPayload } from "./sync";

/**
 * The network edge: reading and writing the one row this account owns.
 *
 * Every function here returns a result rather than throwing. Sync is a
 * background convenience on top of a local-first app, and a dropped connection
 * or an expired token must never take the planner down with it.
 */

const TABLE = "claro_state";

/**
 * The optimistic-concurrency token: the row's `updated_at` as we last saw it.
 *
 * A push carries the token it is replacing. If the row has moved on since,
 * another device wrote in the meantime, the update matches nothing and the push
 * reports a conflict instead of overwriting work it never saw.
 */
export type SyncToken = string;

export type Pulled = { payload: SyncPayload; token: SyncToken; version: number } | null;

export type PullResult =
  | { ok: true; row: Pulled }
  | { ok: false; reason: "offline" | "error"; message: string };

export async function pull(userId: string): Promise<PullResult> {
  if (!supabase) return { ok: false, reason: "error", message: "Sync is not configured." };

  const { data, error } = await supabase
    .from(TABLE)
    .select("state, version, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { ok: false, reason: "error", message: error.message };
  if (!data) return { ok: true, row: null };

  return {
    ok: true,
    row: {
      payload: data.state as SyncPayload,
      token: data.updated_at as string,
      version: data.version as number,
    },
  };
}

export type PushResult =
  | { ok: true; token: SyncToken }
  /** Another device wrote since this one last looked. Nothing was overwritten. */
  | { ok: false; reason: "conflict" }
  | { ok: false; reason: "error"; message: string };

/**
 * Write the snapshot, but only over the version this device last saw.
 *
 * `token` is null for the first write of a new account. Everything after that
 * is a conditional update, and a zero-row result is the whole point: it means
 * the row changed underneath us and the caller has to reconcile rather than
 * clobber.
 */
export async function push(
  userId: string,
  payload: SyncPayload,
  token: SyncToken | null,
): Promise<PushResult> {
  if (!supabase) return { ok: false, reason: "error", message: "Sync is not configured." };

  const row = { user_id: userId, state: payload, version: payload.version };

  if (token === null) {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(row)
      .select("updated_at")
      .maybeSingle();
    // A duplicate key means the account was seeded elsewhere first, which is a
    // conflict rather than a failure: something is there that we have not read.
    if (error) {
      // Only a real duplicate key is a conflict. Everything else is a failure
      // and must say so: reporting a refused insert as "two versions exist"
      // sends somebody to a resolution screen for a problem they do not have.
      if (error.code === "23505") return { ok: false, reason: "conflict" };
      return { ok: false, reason: "error", message: describe(error) };
    }
    if (!data?.updated_at) {
      // Insert accepted but nothing came back. Without the row's timestamp
      // there is no concurrency token, so the next write would be blind.
      return {
        ok: false,
        reason: "error",
        message: "The row was written but the server returned nothing to track it by.",
      };
    }
    return { ok: true, token: data.updated_at as string };
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update(row)
    .eq("user_id", userId)
    .eq("updated_at", token)
    .select("updated_at")
    .maybeSingle();

  if (error) return { ok: false, reason: "error", message: describe(error) };
  if (!data) return { ok: false, reason: "conflict" };
  return { ok: true, token: data.updated_at as string };
}

/**
 * A Supabase error in a form somebody can act on.
 *
 * `error.message` alone is often "" or a bare code, which produces a footer
 * that says something failed and nothing about what. The code is what
 * identifies an RLS refusal (42501) or a missing table (42P01), so it travels
 * with the text.
 */
function describe(error: { message?: string; code?: string; details?: string; hint?: string }) {
  const parts = [error.message, error.details, error.hint].filter(Boolean);
  const text = parts.join(" ") || "Unknown error";
  return error.code ? `${text} [${error.code}]` : text;
}
