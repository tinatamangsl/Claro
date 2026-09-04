import { useState } from "react";

import { useSync } from "@/lib/use-sync";

/**
 * Where the app says where your writing actually lives, and lets you change it.
 *
 * The footer used to state "Stored on this device" on every page, flatly. That
 * was true for the whole life of the app and stopped being true the moment an
 * account could hold a copy, so the line is now read off the real state rather
 * than asserted: signed out it says the same thing it always did, because
 * signed out nothing leaves the browser.
 *
 * There is no settings screen to put this on and the nav is deliberately short,
 * so it lives in the footer beside the sentence it qualifies.
 */
export function AccountBar() {
  const { available, session, status, message, signIn, signOut } = useSync();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // No project configured: this build is the local-only app, and saying
  // anything about accounts would be offering something that is not there.
  if (!available) return <span>Stored on this device</span>;

  if (session) {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{WHERE[status] ?? "Synced to your account"}</span>
        <span aria-hidden className="text-muted-foreground/40">
          ·
        </span>
        <span className="max-w-[14rem] truncate">{session.user.email}</span>
        <button
          type="button"
          onClick={() => void signOut()}
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          Sign out
        </button>
        {status === "error" && message && (
          <span className="text-destructive">{message}</span>
        )}
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>Stored on this device</span>
      <span aria-hidden className="text-muted-foreground/40">
        ·
      </span>
      {open ? (
        <form
          /*
            Its own line, not squeezed into the meta row. An email field and a
            button do not fit beside the quarter and the week at any width worth
            supporting, and the version that did fit pushed both off the edge.
          */
          className="flex w-full flex-wrap items-center gap-2 pt-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const result = await signIn(email.trim());
            setBusy(false);
            setSent(result.message);
          }}
        >
          {/*
            The width lives on the wrapper because `.field-plain` sets its own
            `width: 100%`, which beats a utility on the input and made the field
            eat the whole row, pushing the button onto a line of its own.
          */}
          <span className="w-56 max-w-full">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email address to sign in with"
              className="field-plain border-b border-border pb-0.5"
            />
          </span>
          <button type="submit" disabled={busy} className="btn btn-sm btn-quiet">
            {busy ? "Sending" : "Send link"}
          </button>
          {sent && <span>{sent}</span>}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          Sign in to sync
        </button>
      )}
    </span>
  );
}

/** What each state honestly means about where the writing is. */
const WHERE: Partial<Record<ReturnType<typeof useSync>["status"], string>> = {
  syncing: "Saving to your account",
  synced: "Synced to your account",
  conflict: "On this device, not yet synced",
  error: "On this device, sync failed",
};
