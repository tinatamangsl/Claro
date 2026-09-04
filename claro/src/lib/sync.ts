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
  if (cycleMaySync(state)) return state;
  const { cycle: _withheld, ...rest } = state;
  return rest;
}

/** Cycle notes travel only once the person has been asked again, and agreed. */
export function cycleMaySync(state: ClaroState): boolean {
  const { enabled, syncConsentAt } = state.cycle.settings;
  // Nothing to withhold if the feature was never turned on.
  if (!enabled) return true;
  return Boolean(syncConsentAt);
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
  /** Nothing written on this device. Take the account's copy. */
  | { action: "pull" }
  /** Both hold work, and no rule can pick between them honestly. */
  | { action: "ask" };

/**
 * What to do the moment somebody signs in.
 *
 * The only case with a wrong answer is the last one. When a device holds real
 * work and the account holds different real work, picking either silently
 * throws away somebody's writing, so this refuses to choose and hands the
 * decision back. Last-write-wins would be smaller code and would eventually eat
 * a quarter's planning.
 */
export function planSignIn({
  local,
  remote,
}: {
  local: ClaroState;
  remote: SyncPayload | null;
}): SignInPlan {
  if (!remote) return { action: "push" };
  if (isUntouched(local)) return { action: "pull" };
  // Identical content is not a conflict, however it got that way.
  if (JSON.stringify(forUpload(local)) === JSON.stringify(remote)) return { action: "pull" };
  return { action: "ask" };
}
