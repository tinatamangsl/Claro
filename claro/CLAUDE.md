# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # first run
npm run dev        # dev server + HMR → http://localhost:8080
npm run build      # production build (dist/client + dist/server)
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit
npm test           # Vitest, single run
npm run test:watch # Vitest in watch mode
```

Running a subset:

```bash
npx vitest run src/lib/dates.test.ts     # one file
npx vitest run -t "quarterOfWeek"        # tests matching a name
```

Tests live beside the code as `*.test.ts` / `*.test.tsx`. `vitest.config.ts` is separate from
`vite.config.ts` on purpose — it omits the `tanstackStart` plugin, which rewrites the app entry
and generates the route tree, neither of which applies under test. Environment is `jsdom`, so
`localStorage` and the DOM are real rather than stubbed.

There is no lint config in this project.

Run npm from inside `claro/`. The parent directory has no root `package.json`, so there is no
workspace; `ExampleRepo/` next door is a separate, unrelated app.

## What Claro is

A clarity operating system for one person juggling several lives at once. Not a task manager.
Everything hangs off a single three-level hierarchy:

```
QUARTER  Direction    → WEEK  Commitment  → DAY  Execution
```

Nav is exactly three items: **Today | Week | Quarter**. Resist adding a fourth. The product
thesis is "fewer, more meaningful things", so most feature requests should be answered by
deepening one of these three screens rather than adding a section.

## Architecture

Stack: TanStack Start v1 (SSR React 19) · Vite 7 · TypeScript strict · Tailwind v4 CSS-first ·
date-fns v4 · lucide-react · `localStorage`.

Data flows one way: `ClaroProvider` (single `useState` holding the whole store) → `useClaro()` →
route views → components. There is no data fetching, no async, and no cache layer.

```
src/lib/types.ts        domain model + the caps. Start here.
src/lib/dates.ts        quarter/ISO-week/day ids, hierarchy resolution, navigation
src/lib/storage.ts      the ONLY module that touches localStorage
src/lib/claro-store.tsx ClaroProvider + useClaro() — also owns the hydration contract
src/routes/             __root, index (→ /today), today, week, quarter
```

## Invariants — breaking these breaks the app

**1. Never read `localStorage` during render.** `ClaroProvider` holds `null` on the server *and*
on the client's first render, then loads real data in a mount effect and flips `ready`.
`AppShell` renders a skeleton until then, which is why server HTML contains only the shell.
A `useState(() => loadState())` initialiser would run during the first client render and
produce a hydration mismatch. This is the single easiest way to break Claro.

**2. `new Date()` is called in exactly two places**, both effects in `claro-store.tsx` (initial
load, and the midnight-rollover interval). Every helper in `dates.ts` takes an explicit date or
id. Computing "today" during render makes the server's timezone disagree with the browser's —
a hydration mismatch *and* a correctness bug.

**3. `src/routeTree.gen.ts` is generated** by the router plugin on `vite dev`. Never hand-edit.
It type-augments `Register` against `getRouter` in `router.tsx`, so that export name is load-bearing.

**4. `validateSearch` must return a genuinely optional key** (`(s): {q?: string} => ... ? {q} : {}`),
not `{q: undefined}`. The latter makes `search` a *required* prop on every `<Link>` to that route.

**5. Vite plugin order is load-bearing:** `tsConfigPaths, tailwindcss, tanstackStart, viteReact`.
`tanstackStart()` must precede `viteReact()`, and `viteReact()` must not be omitted.

**6. `@source "../src"` in `styles.css` is relative to the CSS file.** Moving the stylesheet
without updating it yields a silently unstyled app, because `source(none)` disables auto-detection.

## Testing is part of the feature, not a follow-up

**Every new feature ships with unit tests in the same change.** This is a standing requirement,
not something to be offered as an optional next step or deferred to a later pass. A feature
without tests is not finished.

What that means in practice:

- New logic in `src/lib/` gets a `*.test.ts` beside it. This is the highest-value surface —
  it is pure, synchronous and fast to cover exhaustively.
- New components with real behaviour (not just layout) get a `*.test.tsx`. Test what the
  component *does* — what it commits, when, and what it refuses to do — not its markup.
- Changing existing behaviour means updating its tests in the same commit. If no test fails
  when you change a behaviour, that behaviour wasn't covered; add the test.

**Write tests that would actually fail.** The suite is mutation-checked: inverting the Thursday
rule in `quarterOfWeek` fails 3 tests, and moving the store's `localStorage` read into a
`useState` initialiser fails 2. Aim for that. A test that passes against a broken implementation
is worse than no test, because it manufactures confidence.

Prioritise the invariants above and the decisions below — they are the things a future change is
most likely to break unknowingly. Every one of them should have a test whose name says what rule
it protects, so a failure explains itself.

## Design decisions and why

**Persistence is `localStorage`, not Supabase.** ExampleRepo persists to a hosted Supabase
project, but the dev machine has no Docker, no Supabase CLI and no psql, and the only available
credential is an `anon` key — which cannot run DDL. A Supabase-backed Claro could not create its
own tables, and would force auth into an MVP that excludes it. `storage.ts` is a deliberate seam:
swapping it for a networked adapter is the whole of "move Claro to a database". The payload
carries a `version` and `migrate()` is version-aware, so the shape can evolve without stranding
saved data.

**A React context, not TanStack Query.** Query's value is async remote data — staleness,
refetch, dedup, cache GC. Claro's data is synchronous, local, and small, so all of that is
overhead, and a `queryFn` would run during SSR where `localStorage` doesn't exist. React Query
was removed from the dependency list entirely; the root route uses plain `createRootRoute()`
with no router context.

**Frequent writes are made cheap in the leaf, not the store.** `useDebouncedField` keeps
keystrokes in local component state and commits to the store on a ~350ms debounce and on blur;
`storage.ts` then debounces the serialization again (~300ms) and flushes on `pagehide`/
`visibilitychange`. This is what makes "the whole store in one `useState`" viable.

**Hand-rolled `vite.config.ts`, not `@lovable.dev/vite-tanstack-config`.** ExampleRepo delegates
to that preset, but its working state is preset 1.7.0 under Bun; npm resolves 2.14.0, a different
major with a different dependency set, so none of ExampleRepo's proven-ness transfers. It also
performs opaque "sandbox detection" to pick host/port and injects Lovable-only dev plugins. Claro
declares the four plugins explicitly and pins port 8080.

**npm, not Bun.** ExampleRepo assumes Bun (`bun.lock`, `bunfig.toml`) but Bun is not installed
on this machine. Deps mirror ExampleRepo's proven **Vite 7 + `@vitejs/plugin-react` 5** pairing —
note `@vitejs/plugin-react` 6 hard-requires Vite 8, and `lucide-react` is pinned to `^0.575.0`
because 1.x is a breaking major.

**One `actions: ActionItem[]` array with a `bucket` discriminator**, not three arrays. The
requirement that items move between Quick Ticks / Tasks / Projects makes this decisive: a move is
a single field change, with no cross-array splice, no id collisions, and order preserved. Views
derive with `.filter(a => a.bucket === …)`.

**Records are created lazily.** Reading a period you've never visited returns a blank from
`readQuarter`/`readWeek`/`readDay`; only an actual edit writes a key. Browsing forward through
quarters must not fill storage with empty shells. Records are also read *through* their blank
template (`{...blankDay(id), ...stored}`), so a field added later defaults correctly on every
previously-saved record without a migration step.

**`quarterOfWeek` resolves via the week's Thursday**, not its Monday. Thursday is the 4th of 7
days, so it always falls on the majority side of a week straddling a quarter or year boundary
(2026-W14 spans Mar 30 – Apr 5: Monday says Q1, Thursday says Q2, and Q2 owns 4 of 7 days). This
is the same rule that defines the ISO week-year, so it stays internally consistent. Week ids use
`getISOWeekYear`, not `getYear` — 2027-01-01 belongs to `2026-W53`.

**Autosave with a status indicator, not a Save button.** The brief asked for "save the quarter",
but a button implies work could be lost. The header carries a persistent "All changes saved"
instead — calmer, and it never lies.

**Caps are product features, not validation.** 3 side quests per domain, 3 weekly actions per
goal, 3 non-negotiables, 2 priorities. At a cap the add affordance is *replaced* by a line of
copy explaining why ("Three is the limit — that's the point."). Don't turn these into errors or
raise them; the constraint is the product.

**Editing is inline everywhere.** Tap text and it becomes an input. There is no modal, no dialog
primitive, and no `@radix-ui/react-dialog` dependency — better for a daily planner, and it avoids
focus-trap/portal SSR concerns.

## Design system

`src/styles.css` is the only stylesheet and holds every token. Paper, ink, and one accent:
warm near-white background, near-black ink, `--primary` deep ink-indigo, `--gold` reserved
*exclusively* for Main Quest and Priority 1 marks, `--positive` for completion only. `--radius`
is `0.5rem` — tight and editorial, not pill-shaped.

Type is two families: **Instrument Serif** (`--font-display`) for the things that should
dominate — quests, goals, dates, priorities — and **Inter** (`--font-sans`) for all UI, with
`tabular-nums` on every number.

Utilities: `.surface` (calm default — white, hairline, no shadow), `.surface-raised` (one soft
shadow, Main Quest and Priority 1 only), `.eyebrow` (micro-label — note it sets `font-family`
explicitly, because these are often `<h2>` and the base layer sets headings to the display serif),
`.field-plain`, `.strike-done`.

**Hierarchy is enforced by size and weight, not colour**: Main Quest ≫ Side Quest, Priority ≫
Task, Weekly Goal ≫ Supporting Action. When adding UI, place it in that ladder rather than
reaching for a new colour. The `.dark` token block exists but no toggle ships.

Deliberately *not* inherited from ExampleRepo: emoji-as-icons, pill-everything, `.paper-card`/
`.pin-shadow`, and its warm terracotta/sage palette. Claro must not look like Jira, Trello, or a
Bootstrap CRUD admin.

## Relationship to ExampleRepo

`../ExampleRepo` is a **reference application only** (HearthHub, a household manager). It must
stay byte-for-byte untouched — don't edit it, install into it, or run it. Claro reused its
framework skeleton, the `__root.tsx` `shellComponent` pattern, flat `createFileRoute` routing,
the Tailwind v4 token architecture, and `cn()`. It discarded every HearthHub feature, the whole
Supabase layer, the Cloudflare Workers wrapper (`server.ts`, `wrangler.jsonc`), React Query, and
44 of its 46 unused shadcn/ui components — stock shadcn styling clashes with Claro's language,
so UI primitives here are hand-rolled.

Note if you ever work in ExampleRepo: its `.env` holds **live Supabase credentials and is not
gitignored**, two of its migration pairs are duplicated without `IF NOT EXISTS` (a fresh
`db reset` fails), and its README documents a Docker setup whose files don't exist.

## Out of scope for the MVP

AI/LLM features, voice, audio briefings, analytics, calendar integration, notifications, social,
teams, subscriptions, payments, gamification, and habit analytics. The MVP is about getting one
loop right: **Quarter → Week → Day → Complete → Reflect.**
