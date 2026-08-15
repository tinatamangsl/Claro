---
name: ssr-and-routing
description: Claro's SSR, hydration, routing and build-config invariants — the hydration contract in ClaroProvider, the one-place-only new Date() rule, adding or changing a route, validateSearch shape, the generated route tree, Vite plugin order and the Tailwind @source path. Use before adding/changing anything under src/routes, touching vite.config.ts / vitest.config.ts / router.tsx / styles.css, or when SSR, hydration or the route tree misbehaves.
---

# SSR, hydration and routing

Claro is a TanStack Start SSR app. Five of the six invariants in CLAUDE.md live on this
surface, and each of them fails *silently or confusingly* rather than loudly. Read this
before touching routes, config or the store's readiness logic.

## 1. Never read `localStorage` during render

`ClaroProvider` holds `null` on the server **and** on the client's first render, then
loads real data in a mount effect and flips `ready`. `AppShell` renders `BootSkeleton`
until then, which is why the server HTML contains only the shell.

```tsx
const [snap, setSnap] = useState<Snapshot | null>(null);   // ✅ identical on both passes
useEffect(() => { setSnap({ state: loadState(), today: formatDayId(new Date()) }); }, []);
```

A `useState(() => loadState())` initialiser would run during the first client render and
produce a hydration mismatch. This is the single easiest way to break Claro.

Consequences to respect when adding code:
- New browser-only reads (`window`, `document`, `matchMedia`, `localStorage`) go in an
  effect, or behind the `typeof window` guard that already lives in `storage.ts`. Every
  such guard belongs in `storage.ts` — components never check for `window`.
- Anything rendered before `ready` must be **fixed-size placeholders with no data**, so
  the markup is byte-identical across hydration.
- New views assume `ready` is already true; they render inside `AppShell`'s `ready` gate.

## 2. `new Date()` is called in exactly two places

Both are effects in [claro-store.tsx](claro/src/lib/claro-store.tsx): the initial load,
and the 60-second midnight-rollover interval that lets a tab left open overnight roll to
the new day. Everything downstream takes `today` from `useClaro()`.

Every helper in `dates.ts` takes an explicit `Date` or id and calls no clock. Computing
"today" during render makes the server's timezone disagree with the browser's — a
hydration mismatch *and* a correctness bug. If a new feature needs the current time,
thread it from the store or take it as a parameter; don't reach for the clock in a leaf.

## 3. `src/routeTree.gen.ts` is generated — never hand-edit

The router plugin regenerates it on `vite dev`. After adding or renaming a route file,
run the dev server so the tree (and its types) catch up; a "route does not exist" type
error on a brand-new route almost always means the tree is stale, not that the route is
wrong.

It type-augments `Register` against `getRouter` in [router.tsx](claro/src/router.tsx), so
**that export name is load-bearing** — renaming it breaks route typing app-wide.

## 4. `validateSearch` must return a genuinely optional key

```ts
validateSearch: (search: Record<string, unknown>): { d?: string } =>
  typeof search.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.d) ? { d: search.d } : {},
```

Returning `{ d: undefined }` instead of `{}` makes `search` a **required** prop on every
`<Link>` pointing at that route — the error surfaces far from the cause, in unrelated
components. Validate the id's shape here too (the regexes for `d`, `w` and `q` are what
keep a hand-typed URL from reaching the store as garbage).

## Adding a route — the checklist

1. Create `src/routes/<name>.tsx` with `createFileRoute("/<name>")`.
2. Wrap the view in `<AppShell>` and give the route a `head` with its own title
   (`"Today — Claro"`).
3. If it takes a search param, write `validateSearch` per the rule above and read it with
   `Route.useSearch()`. Default to the store's value: `const dayId = d ?? today`.
4. Navigate with `useNavigate()` and typed `search` objects, never string URLs.
5. Run `npm run dev` once to regenerate the route tree, then `npm run typecheck`.
6. Only add a route at all if it survives the product gate in the `task-discipline`
   skill — nav is three items, deliberately.

`__root.tsx` uses `createRootRoute()` with **no router context** (React Query was removed
entirely), plus the `shellComponent` pattern for `<html>`/`<head>`/`<body>`, and it owns
`notFoundComponent` and `errorComponent`.

## 5. Vite plugin order is load-bearing

```ts
plugins: [tsConfigPaths(...), tailwindcss(), tanstackStart(), viteReact()]
```

`tanstackStart()` must precede `viteReact()`, and `viteReact()` must not be omitted. Dev
and preview are pinned to port 8080.

`vitest.config.ts` is a **separate file on purpose** and deliberately omits
`tanstackStart` — that plugin rewrites the app entry and generates the route tree,
neither of which applies under test. Keep the two configs in sync for `tsConfigPaths` and
`viteReact` only; don't merge them.

## 6. `@source "../src"` in `styles.css` is relative to the CSS file

Tailwind v4 is CSS-first here, and `source(none)` disables auto-detection — so moving the
stylesheet without updating that path yields a **silently unstyled app** with no error.
The `@/*` alias maps to `./src/*` via `tsconfig.json` paths and `vite-tsconfig-paths`;
both configs must load that plugin for the alias to resolve.

## Testing this surface

The hydration contract has tests that assert the *first* observed render — see the
`hydration contract` describe block in `claro-store.test.tsx`, which records every value
of `ready` and asserts `seen[0] === false`, and checks `today === ""` before hydration.
Any change to provider readiness must keep those green; if you change the contract
deliberately, update those tests in the same commit and say so.
