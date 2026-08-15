---
name: verify-root-cause
description: Debugging discipline for Claro — classify the failure surface, verify every link in the causal chain against real files and commands before naming a cause, and record root causes so they are never re-chased. Includes the known signatures for hydration mismatches, stale route trees, unstyled builds, debounce-flaky tests and lost localStorage data. Use for any bug, error message, failed build or test run, or "why does X happen" question.
---

# Verify-first root-cause debugging

Plausible is not verified. Claro is small, local and synchronous — every hypothesis here
is cheap to actually test, so there is no excuse for shipping a guess as a diagnosis.

## The method

1. **Classify the failure surface first.** In this app it is almost always one of:
   SSR/hydration · the generated route tree · build or test config · the storage layer and
   the browser it runs in · date logic · a product decision that only looks like a bug
   (a cap, a lazily-created record, a deliberately blank period). The class determines the
   fix path, and several of these have nothing to do with the code you were just editing.
2. **For each hypothesis, name the observable that would confirm or kill it — then go
   observe it.** Read the file, run `npx vitest run -t "…"` on the single relevant test,
   add a temporary log inside the effect, check what's actually in `localStorage`.
3. **Kill suspects out loud.** Say what was ruled out and by which command, so the user
   knows the search space shrank rather than watching you wander.
4. **Reproduce in a test before fixing**, whenever the bug is in `src/lib` or a component
   — the failing test *is* the proof, and it stays as the regression guard.

## Known signatures — check these before investigating code

**"Hydration failed" / "Text content does not match server-rendered HTML"**
Something read browser state or the clock during render. Look for a `useState` initialiser
calling `loadState()`, a `new Date()` outside the two effects in `claro-store.tsx`, or a
component rendering real data before `ready` is true. See the `ssr-and-routing` skill.

**Every `<Link>` to a route suddenly demands a `search` prop**
That route's `validateSearch` returned `{ q: undefined }` instead of `{}`. The error
surfaces in unrelated components, far from the cause.

**A brand-new route doesn't exist, or its types are wrong**
`src/routeTree.gen.ts` is stale — run `npm run dev` to regenerate it. Never hand-edit it.
If route typing broke app-wide instead, check that `getRouter` in `router.tsx` still has
that exact export name.

**The app renders completely unstyled, with no error**
`@source "../src"` in `styles.css` is relative to the CSS file, and `source(none)`
disables auto-detection — so a moved stylesheet silently produces zero utility classes.

**`vitest: command not found` / `npm ERR! could not read package.json`**
Dependencies aren't installed, or npm is being run from the repo root. There is no root
`package.json`; every script runs from inside `claro/`.

**A test asserting a save sees nothing, or passes only sometimes**
It didn't cross the debounces — ~350 ms in `useDebouncedField`, then ~300 ms in
`scheduleSave`. Await ~400 ms inside `act()` after the last change. Similarly, a store
test that asserts before `ready` is true is asserting on the pre-hydration snapshot.

**Data "disappeared" between sessions**
Check in this order: was `STORAGE_KEY` changed (that orphans data silently); is the stored
`version` *higher* than `CLARO_SCHEMA_VERSION` (`migrate()` returns an empty store by
design and deliberately leaves the payload on disk); did a write fail (`saveStatus` shows
`"error"`, the header reads "Couldn't save" — quota, or a privacy mode that allows reads
but not writes); or was the period simply never edited, in which case a blank is correct
and nothing was ever stored.

**A date is off by one, or a week lands in the wrong quarter**
`parseDayId` uses `parseISO`, which reads a date-only string as **local** midnight — a
manual `new Date(string)` would read UTC and reintroduce the off-by-one. Week ids use
`getISOWeekYear`, not `getYear`, so 2027-01-01 correctly belongs to `2026-W53`. And
`quarterOfWeek` resolves via the week's **Thursday**, not its Monday, so a straddling week
belongs to the quarter owning the majority of its days — that is intended behaviour, not a
bug, and three tests protect it.

## Distinguish a bug from a product decision

Several "problems" are the product working: caps that refuse a fourth item, records that
stay blank until edited, no Save button, only three nav destinations, no dark-mode toggle.
Before fixing one, check CLAUDE.md's *Design decisions and why* — then tell the user it's
deliberate and what it would cost to change, rather than quietly changing it.

## When the root cause is found

Write it down where the next session will find it — see the `docs-sync` skill. Record the
exact failing symptom, the dead suspects **and the commands that killed them**, the true
cause, and the fix. Rewrite any now-disproven claim in place rather than leaving it
standing next to its refutation.
