import { AlertTriangle } from "lucide-react";

import { useSync } from "@/lib/use-sync";

/**
 * Two versions exist, and Claro will not pick between them.
 *
 * This appears when a device holds work the account does not, and the account
 * holds work the device does not. Every automatic answer to that is wrong for
 * somebody: last write wins eventually eats a quarter of planning, and merging
 * fourteen top-level keys would be wrong in ways nobody could see. So nothing
 * is overwritten, syncing stops, and the choice goes to the person.
 *
 * Both sides are still safe while this is on screen. The device's copy is in
 * `localStorage` where it has always been, and the account's copy is untouched
 * on the server, which is what makes it reasonable to interrupt and wait.
 */
export function SyncConflict() {
  const { status, resolveKeepThisDevice, resolveKeepAccount } = useSync();
  if (status !== "conflict") return null;

  return (
    <section
      role="alert"
      className="surface-raised mb-8 border-l-2 border-l-destructive p-5"
    >
      <div className="flex items-baseline gap-2.5">
        <AlertTriangle aria-hidden className="h-4 w-4 shrink-0 translate-y-0.5 text-destructive" />
        <div className="min-w-0">
          <h2 className="text-[1rem] font-medium">
            This device and your account have both changed
          </h2>
          <p className="mt-1.5 max-w-prose text-[0.9rem] leading-relaxed text-muted-foreground">
            Something was written here, and something different was written on your account,
            probably on another device. Claro has not overwritten either, and it has stopped
            syncing until you say which to keep. Whichever you choose, the other is replaced.
          </p>

          <div className="mt-4 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => void resolveKeepThisDevice()}
              className="btn btn-sm btn-primary"
            >
              Keep what is on this device
            </button>
            <button
              type="button"
              onClick={() => void resolveKeepAccount()}
              className="btn btn-sm btn-quiet"
            >
              Keep what is on my account
            </button>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Nothing has been lost yet. If you are not sure, sign out instead: this device keeps
            everything it has, and your account keeps everything it has.
          </p>
        </div>
      </div>
    </section>
  );
}
