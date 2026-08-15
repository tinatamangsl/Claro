---
name: feature-tdd
description: Build or change Claro features test-first — pure-logic extraction into src/lib, Vitest + Testing Library patterns, the store harness, debounce timing in tests, capped-list helpers, component reuse. Use whenever writing or modifying TypeScript/TSX under claro/src.
---

# Feature work, the Claro way

**Every feature ships with its tests in the same change.** CLAUDE.md states this as a
standing requirement, not an optional follow-up: a feature without tests is not finished,
and changing a behaviour means updating its test in the same commit.

Red → green → refactor. Tests sit beside the code as `*.test.ts` / `*.test.tsx`.

```bash
npm test                                  # full suite, single run
npm run test:watch                        # watch mode
npx vitest run src/lib/dates.test.ts      # one file
npx vitest run -t "quarterOfWeek"         # tests matching a name
```

## Put the logic in `src/lib`, keep components thin

`src/lib` is pure, synchronous and has no React — it is the highest-value test surface, so
branchy logic belongs there and gets covered exhaustively. Components then hold rendering
and event wiring only.

- Date arithmetic goes in `dates.ts`, and **every helper takes an explicit `Date` or id**.
  Never call `new Date()` in a component or a lib function — see the `ssr-and-routing`
  skill for why this is an invariant, not a style preference.
- List manipulation goes through `mutations.ts`: `addCapped`, `updateById`, `removeById`,
  `toggleById`. Reach for these before writing a bespoke `.map`/`.filter`.
- Ids come from `newId()` in `id.ts`, never from `Math.random()` or an array index.

## Component tests: props in, callback out

The established pattern is a component that takes a record and an `onChange`, tested
without any provider — imitate [ScheduleBlock.test.tsx](claro/src/components/today/ScheduleBlock.test.tsx):

```tsx
const dayWith = (scheduleItems: ScheduleItem[]): Day => ({
  ...blankDay("2026-08-15"),
  scheduleItems,
});

render(<ScheduleBlock day={dayWith([])} onChange={onChange} />);
```

Build fixtures from `blankDay` / `blankWeek` / `blankQuarter` in `storage.ts` so a field
added later doesn't break every test file. Find elements by accessible name
(`getByLabelText("Schedule at 9 AM")`, `getByRole("button", { name: "Add a thing" })`) —
this keeps the tests honest about accessibility and independent of markup.

Test what the component **does**: what it commits, when, and what it refuses to do. Not
its class names.

## Store-level tests: the probe harness

For anything touching `ClaroProvider`, copy the `harness()` probe in
[claro-store.test.tsx](claro/src/lib/claro-store.test.tsx) — it renders a `Probe` that
captures the live `useClaro()` value into a ref so a test can drive the API directly.
`localStorage.clear()` in `beforeEach`. Wrap every mutation in `act()`, and wait for
hydration with `await waitFor(() => expect(api.current?.ready).toBe(true))` — the store is
deliberately not ready on first render.

## Timing: there are two debounces, and tests must cross them

`useDebouncedField` holds keystrokes for ~350 ms before committing to the store, and
`storage.ts` debounces the serialization for another ~300 ms. A test that asserts on
`localStorage` immediately after a change will see nothing.

```ts
const flush = async () => {
  await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
};
```

To assert a *failed* save, mock the write rather than filling the quota:
`vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("QuotaExceededError"); })`.
`vitest.config.ts` sets `restoreMocks: true`, so mocks reset between tests automatically.

The environment is `jsdom` with `globals: true`, so `localStorage` and the DOM are real
rather than stubbed — but existing files still import `describe/it/expect/vi` from
`vitest` explicitly. Match that.

## Caps are UI copy, not errors

At a cap, the add affordance is **replaced** by a line of copy explaining why — never a
disabled button with a validation message:

```tsx
<AddItem
  label="Add a side quest"
  onAdd={…}
  disabled={q.work.sideQuests.length >= MAX_SIDE_QUESTS}
  disabledHint="Three is the limit — that's the point."
/>
```

Enforce the cap in the mutation too (`addCapped(list, item, MAX_SIDE_QUESTS)`), so the
rule holds even if a view forgets to pass `disabled`.

## Reuse before creating

`AddItem`, `EditableText`, `ItemRow`, `CheckToggle`, `Section`, `PeriodHeader`,
`useDebouncedField`, `cn()` — check these before building a new primitive. There is no
component library and no dialog primitive; editing is inline everywhere.

## Write tests that would actually fail

The suite is mutation-checked. Inverting the Thursday rule in `quarterOfWeek` fails 3
tests; moving the store's `localStorage` read into a `useState` initialiser fails 2. Aim
for that bar. Prioritise the CLAUDE.md invariants and design decisions — they are what a
future change is most likely to break unknowingly — and name each test after the rule it
protects, so a failure explains itself.

A test that still passes against a broken implementation is worse than no test.

## Definition of done

`npm test` fully green and `npm run typecheck` clean, both from inside `claro/`.
