---
name: verify-root-cause
description: Debugging discipline — verify every link in the causal chain with real commands/files before naming a cause, decide server-side vs rebuild, and record root causes so they are never re-chased. Use for any bug, error message, failed build/upload/CI run, or "why does X happen" question.
---

# Verify-first root-cause debugging

Plausible is not verified. A signal that pattern-matches a known failure may have a
different cause — this repo has burned weeks on unverified suspects.

## The method

1. **Classify the failure surface first**: app code · build config · signing ·
   backend/RLS · server-side pairing (certs, webhooks, dashboards) · third-party
   infrastructure. The class determines the fix path — and whether a rebuild is
   even relevant.
2. **For each hypothesis, name the observable that would confirm or kill it — then
   go observe it.** Real examples that set the bar:
   - Apple Pay "not designated": inspected the actual archive with
     `codesign -d --entitlements -` + `security cms -D -i embedded.mobileprovision`
     → entitlement AND profile were fine → killed the signing suspect → the real
     cause was a missing merchant payment-processing certificate (server-side).
   - CI jobs cancelled with "job was not acquired by Runner of type hosted" +
     "Internal server error" → GitHub infrastructure, not code (the jobs never
     started; the same commit is green locally). Fix = re-run, not investigate code.
   - "It works on web" does NOT clear the iOS app — web and native often take
     entirely different paths (web Apple Pay uses Stripe's domain registration,
     the app uses our merchant ID).
3. **Kill suspects out loud.** State what was ruled out and by which command, so
   the user (and the record) knows the search space shrank.
4. **Decide rebuild vs no-rebuild before advising.** Server-side fixes (Stripe/Apple
   pairing, Supabase config, webhooks, DB) need no new binary — telling the user to
   re-archive unnecessarily costs them an hour. Client-side fixes on iOS always
   need a full rebuild (no OTA in this project).

## Known infra-flake signatures (don't debug code for these)

- GitHub Actions: "Internal server error. Correlation ID …" / runner-not-acquired
  → re-run jobs; check githubstatus.com.
- App Store Connect: pink "Sorry, something went wrong" banner → reload / new
  browser session; check Apple system status.
- Cloudflare Pages Functions: HTTP 503 body "error code: 1102" → CPU-budget kill
  (probabilistic) — reduce work per request, retry once client-side.

## When the root cause is found

Write it down where the next session will find it — CLAUDE.md (the relevant
section, dated) and the memory directory (follow the `docs-sync` skill for paths
and format):
- the exact failing symptom, the dead suspects **and the commands that killed
  them**, the true cause, and the exact fix steps;
- any expiry/renewal dates the fix created (e.g. the Apple Pay payment processing
  certificate expires 07/08/2028 — renew before then);
- rewrite any now-disproven claims in place (don't leave "Stripe auto-manages
  certs"-style beliefs standing next to their refutation).
