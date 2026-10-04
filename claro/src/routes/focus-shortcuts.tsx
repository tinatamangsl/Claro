import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { END_SHORTCUT, START_SHORTCUT } from "@/lib/ios-shortcuts";

export const Route = createFileRoute("/focus-shortcuts")({
  component: () => (
    <AppShell>
      <FocusShortcutsGuide />
    </AppShell>
  ),
  head: () => ({ meta: [{ title: "Blocking apps during focus: Claro" }] }),
});

/** One shortcut to build, said in the words the Shortcuts app itself uses. */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span
        aria-hidden
        className="tnum mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border text-[0.8rem] text-muted-foreground"
      >
        {n}
      </span>
      <div className="min-w-0">
        <h3 className="text-[0.95rem] font-medium">{title}</h3>
        <div className="mt-1.5 space-y-2 text-[0.88rem] leading-relaxed text-muted-foreground">
          {children}
        </div>
      </div>
    </li>
  );
}

/**
 * How to make the iPhone bridge work.
 *
 * A route rather than a panel, and not in the nav, like `/cycle-guide`: it is
 * read once while somebody sets this up and never again, and the setting it
 * belongs to is three lines in a block picker that cannot carry a page of
 * instructions.
 *
 * It is deliberately explicit that **Claro blocks nothing**. A web page has no
 * access to which apps are open on a phone and no browser will ever give it
 * any, so every word here describes somebody else's automation. Promising
 * otherwise would be promising something that cannot be built.
 */
function FocusShortcutsGuide() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <Link
          to="/today"
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="h-3 w-3" />
          Back to Daily
        </Link>
        <h1 className="mt-3 display text-[2rem] leading-tight sm:text-[2.3rem]">
          Blocking apps during focus
        </h1>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-muted-foreground">
          Claro cannot block anything on your phone, and no website can: a page in a browser has no
          way to see or close what else is open. What your iPhone can do is run a shortcut you
          built yourself. So Claro tells Shortcuts that a block has started and how long it is, and
          what happens next is entirely yours.
        </p>
      </div>

      <section className="surface p-5">
        <h2 className="eyebrow">What you are building</h2>
        <p className="mt-2 text-[0.88rem] leading-relaxed text-muted-foreground">
          Two shortcuts, named exactly as below. Claro opens them by name, so the spelling matters
          and the capitals matter.
        </p>
        <ol className="mt-5 space-y-6">
          <Step n={1} title={`A shortcut called ${START_SHORTCUT}`}>
            <p>
              In the Shortcuts app, make a new shortcut and rename it <b>{START_SHORTCUT}</b>. Add
              the action <b>Set Focus</b>, set it to turn <b>Do Not Disturb On</b>, and choose{" "}
              <b>until I turn it off</b>.
            </p>
            <p>
              Claro passes the block length in minutes as the shortcut&rsquo;s input, so if you
              would rather it switched itself off, set Focus to turn on <b>for</b> that many
              minutes using the <b>Shortcut Input</b> as the number.
            </p>
          </Step>

          <Step n={2} title={`A shortcut called ${END_SHORTCUT}`}>
            <p>
              A second shortcut, named <b>{END_SHORTCUT}</b>, with one action: <b>Set Focus</b>,
              turning <b>Do Not Disturb Off</b>.
            </p>
          </Step>

          <Step n={3} title="Stop it asking every time">
            <p>
              The first time Claro opens a shortcut, iOS will ask whether to allow it. In the
              Shortcuts app, open each shortcut&rsquo;s details and turn off{" "}
              <b>Ask Before Running</b>, or you will be answering a prompt at the start of every
              block.
            </p>
          </Step>

          <Step n={4} title="Turn the setting on in Claro">
            <p>
              On Daily, open the focus block length and tick{" "}
              <b>Block apps on iPhone during focus</b>. It is off until you do, and it does nothing
              on a laptop or an Android phone.
            </p>
          </Step>
        </ol>
      </section>

      <section className="surface-quiet p-5">
        <h2 className="eyebrow">What to expect</h2>
        <ul className="mt-2 space-y-2 text-[0.88rem] leading-relaxed text-muted-foreground">
          <li>
            Starting a block switches to Shortcuts for a moment and comes back. That is iOS opening
            the shortcut, and there is no way to run one without it.
          </li>
          <li>
            The handover happens once at the start and once at the end, whether the timer ran out,
            you pressed End block, or you left early.
          </li>
          <li>
            If a shortcut is missing or misnamed, nothing happens and your block still runs. The
            bridge is an extra, never a gate.
          </li>
          <li>
            Claro never learns whether any of this worked. Nothing is sent anywhere, and nothing
            about your phone comes back.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="eyebrow">If you want it fully automatic</h2>
        <p className="mt-2 max-w-prose text-[0.88rem] leading-relaxed text-muted-foreground">
          Shortcuts can also watch for the Focus turning on and do more with it: close apps,
          change your wallpaper, start a playlist. In the Shortcuts app, under <b>Automation</b>,
          add one for <b>Focus</b> and point it at whatever you want. Claro has no part in that
          and will not know it exists, which is the point: the rule about your own attention stays
          yours.
        </p>
      </section>
    </div>
  );
}
