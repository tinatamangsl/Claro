---
name: backend-deploy
description: Change or deploy TrailMate's Supabase backend — migrations, RPCs, RLS, edge functions, webhooks, secrets, hosted pushes. Use for any schema/database/edge-function work or any deploy request (db push, functions deploy, git push web).
---

# Backend change & deploy discipline

One hosted Supabase project **is production** — there is no staging. The demo
account and live Stripe orders live in it. Act accordingly.

## Schema changes

- Migrations (`supabase/migrations/YYYYMMDDHHMMSS_*.sql`) are the **source of
  truth** — never hand-edit hosted schema without a matching migration file.
- Changing an RPC's `RETURNS TABLE` columns needs `DROP FUNCTION IF EXISTS` first
  (`CREATE OR REPLACE` cannot alter a result type).
- After DDL/RPC changes: `NOTIFY pgrst, 'reload schema';` (else PostgREST 404s new
  embeds/RPCs), then **`npm run gen:types`** (types are generated — never
  hand-edit; cast nullable RPC args at call sites, the generator can't express
  NULL params).
- New push notifications: wire webhooks **in-SQL** with the guarded
  `supabase_functions.http_request` trigger pattern (no dashboard step, no-op
  locally) — copy an existing `*_push_webhooks` migration.

## Edge functions are TDD too

Extract pure logic into a serve-free file and test it hermetically — imitate
`supabase/functions/import-events/parse.ts` + `parse.test.ts` (no `Deno.serve`,
no env reads). Run `npm run test:edge` (deno) before any deploy.

## RLS posture (check on every new table/surface)

- Every table gets RLS; per-event collaboration gates through the SECURITY DEFINER
  helpers (`is_event_participant`, `is_event_organizer`, …).
- Writes that enforce business rules (capacity, roles, money) go through
  **SECURITY DEFINER RPCs**, not write policies — rules must not be forgeable.
- Anything guests can reach must keep the anon posture: public events readable,
  everything account-scoped returns 0 rows to anon. Verify with an anon-key query
  (both values are in `.env`; expect `[]` for account-scoped tables):

  ```bash
  curl "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/<table>?select=*" \
    -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY"
  ```
- Money stays in integer cents; capacity uses row-level `FOR UPDATE` locks on the
  specific row (never global).

## The authorization gate (hard rule)

These commands run **only with explicit user go-ahead in this conversation** —
propose the exact command and wait:

```
supabase db push
supabase functions deploy <fn> --no-verify-jwt
supabase secrets set …
git push origin web        # Cloudflare auto-deploys the website
```

Local edits, tests, and commits on `web` don't need asking.

## Before anything risky or destructive

- Manual backup first: `supabase db dump` (no automatic backups on the current
  plan — check before assuming otherwise).
- Never wipe the demo account (`hearthhub075@gmail.com`) or imported events
  (`created_by IS NULL`) — see the `ios-release` skill inviolables.

## After a deploy — verify, then say what was verified

A deploy isn't done when the command exits; it's done when the behaviour is
observed live: select a count, invoke the function with curl, exercise the app
flow, or re-run the failing scenario. Report the verification (or that it wasn't
possible) in the final message, and update CLAUDE.md/memory per the `docs-sync`
skill — deploy state lives there, not in anyone's head.
