import { Lock } from "lucide-react";

import { useClaro } from "@/lib/claro-store";
import { useSync } from "@/lib/use-sync";

/**
 * Asking again, because the first answer was to a different question.
 *
 * Cycle notes were turned on under a screen that said they were stored on this
 * device and sent nowhere. That promise was true when it was made and is the
 * reason somebody felt able to log a period in this app at all. Sync does not
 * get to inherit it. Until this is answered, `forUpload` leaves the entire
 * cycle branch out of every upload, so the rest of the planner syncs and this
 * does not.
 *
 * Shown only where it applies: signed in, cycle notes on, not yet answered.
 * There is no dismiss, because dismissing would look like an answer; declining
 * is an answer, and it is the one that changes nothing.
 */
export function CycleSyncConsent() {
  const { cycle, setCycleSyncConsent } = useClaro();
  const { session, available } = useSync();

  if (!available || !session) return null;
  if (!cycle.settings.enabled) return null;
  if (cycle.settings.syncConsentAt) return null;

  return (
    <section className="surface-raised border-l-2 border-l-primary p-5">
      <div className="flex items-baseline gap-2.5">
        <Lock aria-hidden className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-muted-foreground" />
        <div className="min-w-0">
          <h2 className="text-[1rem] font-medium">
            Should your cycle notes go to your account?
          </h2>
          <p className="mt-1.5 max-w-prose text-[0.9rem] leading-relaxed text-muted-foreground">
            You turned these on when Claro kept them on this device only, so they are being left
            out of the sync while the rest of your planner goes to your account. If you say yes,
            your logged dates and private notes are stored in your own account, readable only when
            signed in as you, and available on your other devices. You can change this later.
          </p>

          <div className="mt-4 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => setCycleSyncConsent(new Date().toISOString())}
              className="btn btn-sm btn-primary"
            >
              Yes, sync my cycle notes
            </button>
            <button
              type="button"
              onClick={() => setCycleSyncConsent(null)}
              className="btn btn-sm btn-quiet"
            >
              Keep them on this device
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
