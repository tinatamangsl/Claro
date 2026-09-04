import { emptyState } from "./storage";
import type { ClaroState } from "./types";

/**
 * What Claro sends and what it does with what comes back.
 *
 * Kept pure and apart from the React and network code, because every way this
 * feature can lose somebody's work lives in these three decisions and they
 * should be readable and testable without a browser or a server.
 */

/**
 * The snapshot as it goes over the wire.
 *
 * `cycle` is optional, and its absence is meaningful rather than a bug: see
 * {@link forUpload}.
 */
export type SyncPayload = Omit<ClaroState, "cycle"> & Partial<Pick<ClaroState, "cycle">>;

/**
 * Whether this state is one nobody has written anything into yet.
 *
 * Used to tell a fresh browser from one holding real work, which is the
 * difference between "safe to pull the account down" and "two versions exist
 * and a person has to choose". Compared without `version`, so a snapshot that
 * has only been migrated still counts as untouched.
 */
export function isUntouched(state: ClaroState): boolean {
  const { version: _ignored, ...rest } = state;
  const { version: _alsoIgnored, ...blank } = emptyState();
  return JSON.stringify(rest) === JSON.stringify(blank);
}

/**
 * The snapshot to upload, with cycle notes withheld until they are allowed.
 *
 * Cycle notes were collected under a promise that they were stored on the
 * device and sent nowhere. Somebody who agreed to that has not agreed to this,
 * so their cycle data is **left out of the upload entirely** until they say
 * otherwise, and left out is not the same as blanked: an absent `cycle` key
 * tells {@link merge} to keep whatever is on the device rather than treating
 * the server's silence as an instruction to erase it.
 */
export function forUpload(state: ClaroState): SyncPayload {
  return state;
}

/**
 * Cycle notes sync like everything else.
 *
 * They used to be held back behind a second consent, because they had been
 * collected under a screen promising they stayed on the device. That screen has
 * since been rewritten to say they go to your account, and the user asked for
 * one account holding everything rather than a branch needing its own
 * permission. So this is always true and `forUpload` withholds nothing.
 *
 * `merge` still reads an absent `cycle` as "never told about" rather than
 * "deleted", because a payload written by an older build will not have one.
 */
export function cycleMaySync(_state: ClaroState): boolean {
  return true;
}

/**
 * A pulled snapshot, with anything the server was not told about preserved.
 *
 * The server holding no cycle notes means it was never given any, never that
 * the person deleted theirs. Overwriting a device's cycle notes with that
 * silence would destroy the exact data this feature is most careful about.
 */
export function merge(local: ClaroState, remote: SyncPayload): ClaroState {
  return { ...remote, cycle: remote.cycle ?? local.cycle };
}

export type SignInPlan =
  /** Nothing on the server yet. This device seeds the account. */
  | { action: "push" }
  /** The account has moved on, or this browser has nothing. Take the account. */
  | { action: "pull" };

/**
 * What to do the moment somebody signs in.
 *
 * **The account wins when it has anything, and this is a real trade.** An
 * earlier version refused to choose when a device and the account both held
 * different work, and put a banner up asking which to keep. The user asked for
 * that gone: they want their devices to agree without being interviewed, which
 * is what sync is supposed to feel like.
 *
 * What that costs is edits made on this device since it last synced, if another
 * device wrote in the meantime. They are overwritten. Nothing is lost
 * unrecoverably, because {@link overwriteBackupKey} stashes the copy that was
 * replaced before it goes, but nothing brings it back automatically either.
 *
 * The account is chosen over the device deliberately: it is the copy every
 * other device already agrees with, so preferring it converges. Preferring the
 * device would make whichever browser was opened last the winner, and two
 * devices could then flip the account back and forth indefinitely.
 */
export function planSignIn({
  local,
  remote,
}: {
  local: ClaroState;
  remote: SyncPayload | null;
}): SignInPlan {
  if (!remote) return { action: "push" };
  return { action: "pull" };
}

/**
 * Where a replaced local snapshot is kept, so an overwrite is not a deletion.
 *
 * Written before a pull replaces anything this device had. Nothing reads it
 * back yet; it exists so that "the account overwrote my morning" is a
 * recoverable situation rather than a lost one.
 */
export const overwriteBackupKey = "claro.overwritten.v1";
