---
name: task-discipline
description: How to work on ANY TrailMate task at the established quality bar — evidence-first working style, communication rules, authorization gates. Load at the start of every task in this repo. Triggers include a bug report, error message or crash, a feature request, a "why/what/how" question, a deploy or release request, an App Store review rejection, or walking the user through an external dashboard (Stripe, App Store Connect, Apple Developer portal, Supabase, Cloudflare).
---

# TrailMate task discipline

CLAUDE.md's **Working agreement** is binding (understand → ground in code → reuse →
strict TDD). This skill is how to *execute* it at the established quality bar.

## Evidence over recall — the core rule

Never assert what you can verify. Before diagnosing, recommending, or contradicting
the user, go look:

- Read the actual file/config, run the actual command, inspect the actual artifact.
  (Example that mattered: before blaming Xcode signing for an Apple Pay failure, run
  `codesign -d --entitlements -` and `security cms -D -i embedded.mobileprovision`
  on the real archive — that killed a false suspect in one step.)
- A recommendation the user challenges is re-derived from evidence, not defended.
  If the evidence says you overstated it, say so plainly and recalibrate (e.g. "that
  memory chart is an idle baseline, not load — my upgrade advice was premature").
- Distinguish the failure surface before proposing action: app code vs config vs
  signing vs server-side vs third-party infra. See the `verify-root-cause` skill.

## When the user is asking, not requesting

If they're describing a problem, asking "why", or thinking out loud — the
deliverable is the **assessment**. Explain what it means and stop; don't apply a
fix until asked. When intent is ambiguous or a genuine product decision arises,
ask (CLAUDE.md rule 1) — never paper over a gap with an assumption.

## Communication style

- **Lead with the outcome** — first sentence answers "what happened / what did you
  find". Detail after.
- Complete sentences; no fragment/arrow-chain shorthand. Readable beats terse.
- Anything the user must type or paste elsewhere (dashboard fields, review notes,
  commands, What's New text) goes in an **exact copy-paste block**.
- Explicitly flag the **must-not-skip** items in any checklist (e.g. "attach the
  build" and "fix the review notes" are the two everyone forgets).
- Reference code as clickable `[file.ts:42](path#L42)` links.
- Report outcomes faithfully: tests failed → say so with output; step skipped →
  say that; done and verified → state it without hedging.

## Guided dashboard walkthroughs (Stripe / App Store Connect / Apple portal / Supabase)

When walking the user through an external dashboard:
1. Give the **exact page** — a direct URL beats click-paths (dashboards move things;
   e.g. Stripe's Apple Pay page is only reliably reachable at
   `dashboard.stripe.com/settings/payments/apple_pay`).
2. **One step at a time.** Tell them exactly what to click, then ask them to report
   back (or screenshot) before the next step. Confirm from their screenshot that
   they're in the right place/mode (e.g. Stripe live vs sandbox) before proceeding.
3. Before any irreversible click, state what it does and what to check first.
4. Before telling them to rebuild/re-archive, establish whether the fix is actually
   client-side — server-side fixes (certs, webhooks, DB) need no rebuild.

## Authorization gates

Never run without explicit user go-ahead **in this conversation**:
- `supabase db push` / `supabase functions deploy …` / `supabase secrets set`
- `git push` (pushing `web` auto-deploys the website via Cloudflare)
- Anything destructive (deletes, wipes, resets) — and take a backup first.

Standard without asking: local edits, tests, and **committing on `web`** once the
suite is green (the pre-commit hook runs jest; keep it green).

## Ending a task

1. `npm test` green + `npx tsc --noEmit` clean.
2. Sync docs/memory if project state changed — see the `docs-sync` skill.
3. Final message: outcome first, what was verified vs assumed, and any follow-ups
   the user must do themselves (dashboard steps, physical-device tests).
