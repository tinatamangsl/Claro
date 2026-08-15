---
name: data-model
description: Change Claro's domain model or persisted data — adding a field to Quarter/Week/Day, the storage.ts seam, read-through-blank defaults, schema version bumps and migrate(), the save pipeline and its failure modes, and moving Claro off localStorage. Use for any edit to src/lib/types.ts or src/lib/storage.ts, any new persisted field, or any "where does the data live / can we use a database" question.
---

# The data model and the storage seam

Claro persists to `localStorage` under the key `claro.store.v1`. That is a deliberate
choice, not a placeholder waiting to be upgraded: the whole store is synchronous, local
and small, which is what makes "one `useState` holding everything" viable. `storage.ts`
is the **only** module that touches `localStorage` — swapping it for a networked adapter
is the entirety of "move Claro to a database".

Start every data change in [types.ts](claro/src/lib/types.ts). It is plain data — no React, no
date library — and it holds the caps as named constants.

## Adding a field — the five steps

1. Add it to the type in `types.ts`.
2. Add its default to the matching `blank*()` factory in `storage.ts`. **This is the step
   that makes existing saved data safe** — records are read *through* their blank
   template, so an added field defaults correctly on every previously-saved record with
   no migration.
3. Wire it in the view, committing through `updateDay` / `updateWeek` / `updateQuarter`.
4. Add tests: the lib-level default, and the behaviour in the component.
5. `npm test` && `npm run typecheck`.

No schema version bump is needed for a purely additive field with a default.

### The read-through-blank limit — know where it stops

`readQuarter` and `readWeek` re-spread their nested `work` / `life` objects, so a field
added inside `QuarterSide` or `WeekSide` defaults correctly:

```ts
return { ...blank, ...stored, id, work: { ...blank.work, ...stored.work }, … };
```

`readDay` spreads **only at the top level** (`{ ...blankDay(id), ...stored, id }`). A new
field added inside an existing nested object on `Day` — `priority1`, `priority2`, or an
element of `scheduleItems` / `actions` / `nonNegotiables` — will therefore be `undefined`
on records saved before the change, not defaulted. Either extend `readDay` the way
`readQuarter` does, or handle the missing value at the point of use. Do not assume the
blank template covers it; check which level the field sits at.

## Version bumps and `migrate()`

`CLARO_SCHEMA_VERSION` changes only for a **breaking reshape** — a renamed or removed
field, or a changed field type — never for an addition. When it does:

- Write the transform and chain it where the comment marks the spot:
  `if (v < 2) state = v1ToV2(state)`.
- `migrate()` **must never throw.** A corrupt payload returns `emptyState()` so the app
  boots empty rather than crashing.
- A payload from a *future* version returns `emptyState()` **and is left on disk
  untouched**, so an older build cannot silently downgrade newer data. Preserve that
  behaviour — it is why `saveNow` is not called on the load path.
- Test the migration against a literal old-shape payload, and test the corrupt and
  future-version paths.

**Never rename `STORAGE_KEY` casually.** A rename orphans every existing user's data with
no error and no way back. If a rename is genuinely required, read the old key, migrate,
write the new one, and only then remove the old — and get the user's go-ahead first
(see the `task-discipline` skill's authorization gates).

## The save pipeline

Writes are debounced twice on the way to disk: `useDebouncedField` holds keystrokes
~350 ms in local component state, then `scheduleSave` debounces serialization another
~300 ms. `flushSave()` runs on `pagehide` and on `visibilitychange → hidden`, so the last
few hundred milliseconds of typing survive a tab close.

`saveNow` returns `"ok" | "unavailable" | "failed"`:
- `unavailable` — no `window`, or `localStorage` access threw outright (some privacy
  modes). The app must keep working; this is not an error state to shout about.
- `failed` — quota exceeded, or a mode that allows reads but not writes. This surfaces as
  `saveStatus === "error"` and the header's "Couldn't save".

The provider skips the save on the first populated snapshot (the `loadedOnce` ref) —
loading data must not immediately rewrite it. There is a test asserting `setItem` is never
called on a pure load; keep it green.

## Records are created lazily

Reading a period you have never visited returns a blank from `readQuarter` / `readWeek` /
`readDay`; **only an actual edit writes a key**. Browsing forward through quarters must
never fill storage with empty shells. If you add a new read path, route it through these
functions rather than touching `state.days[id]` directly.

## One array with a discriminator

`Day.actions` is a single `ActionItem[]` with a `bucket` field (`quickTick` | `task` |
`project`), not three arrays — because items move between buckets, and a move must be one
field change with no cross-array splice, no id collisions and preserved order. Views
derive with `.filter(a => a.bucket === …)`. Resist "just add another array"; the same
reasoning applies to any future categorisation.

## "Should this be in a database?"

The honest answer, already reasoned through in CLAUDE.md: a hosted Supabase project was
considered and rejected for this MVP — the only available credential is an `anon` key,
which cannot run DDL, so a Supabase-backed Claro could not create its own tables, and it
would force auth into an MVP that deliberately excludes it. The payload carries a
`version` and `migrate()` is version-aware precisely so the shape can evolve without
stranding saved data. If the user wants to revisit it, the work is a new adapter behind
the `storage.ts` interface plus an async story for `ClaroProvider` — not a rewrite of the
views.
