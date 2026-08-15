---
name: feature-tdd
description: Build or change TrailMate app features test-first — pure-logic extraction, jest patterns, platform guards, module-level sessions, device-storage caps. Use whenever writing or modifying TypeScript/TSX under src/ or app/.
---

# Feature work, the TrailMate way

Strict TDD is non-negotiable (CLAUDE.md rule 4): **red → green → refactor**, never
implementation before its failing test exists. `npm test`; tests colocated as
`src/**/*.test.{ts,tsx}`.

## Separate I/O from logic (the single biggest quality lever)

Don't test hooks/screens against a mocked database. Extract the branchy logic into
a **pure, `now`-injected function** and test *that* exhaustively; the hook/screen
stays a thin fetch-then-build or render-the-state wrapper.

Established examples to imitate:
- `useHomeFeed` → `buildHomeData(raw, me, now)`; `useEvent` → `deriveEvent(...)`
- GPS/run logic: `advanceNav` (navigation), `advanceTrack` (track-recorder),
  `startClock/pauseClock/clockElapsedMs` (run clock) — every fix/tick passes `now`
  explicitly, so tests never sleep or mock timers.

State that must survive **outside React** (background-task callbacks arriving with
no screen mounted, app-kill recovery) lives in a module-level session singleton
with AsyncStorage checkpoints — imitate `src/lib/record-session.ts` (checkpoint
every N accepted events, epoch-based clock so restores stay honest).

## Jest gotchas (these bite every time)

- Any test whose import graph reaches the Supabase client must
  `jest.mock("../integrations/supabase/client")` with a stub — otherwise the real
  client loads native AsyncStorage + an auth-refresh timer.
- AsyncStorage: `jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"))`.
- Fire-and-forget storage writes need a microtask flush:
  `await new Promise(r => setTimeout(r, 0))` before asserting.
- `jest.setup.js` already mocks Ionicons (act-warning noise); don't re-mock.
- Full screens that pull in navigation/maps are NOT unit-tested (E2E territory) —
  extract their logic to a pure lib instead and test that.

## Platform guards (web must never break)

- **Never make a native-only import unconditional in a shared module.** Use a
  `.web.tsx` variant, a metro web-shim, `Platform.OS` guards, or a dynamic
  `require()` in try/catch (see `src/lib/background-location.ts`).
- Builds predating a native module must degrade gracefully: return `false` /
  no-op → caller falls back (foreground watcher pattern). New native modules need
  a dev-client rebuild and a note in CLAUDE.md; **New Architecture stays OFF**.

## Repo conventions that count as correctness

- Money in **integer cents**. React Query keys `["resource", eventId]`; mutations
  invalidate the **list** key too, not just the detail.
- Realtime channel names must be unique per subscriber (suffix an instance id);
  realtime is hosted-only, so screens also refetch on focus / low `staleTime`.
- Cap device-local AsyncStorage lists and downsample geometry (run history 50,
  dismissed ids 100) — Android has a ~2 MB/entry limit.
- Reuse `src/components/ui.tsx` + existing helpers before creating anything
  (CLAUDE.md rule 3); match per-feature accent colours; imported events
  (`created_by IS NULL`) never render scraped covers/descriptions.

## Definition of done

`npm test` fully green and `npx tsc --noEmit` clean — the pre-commit hook runs
jest, CI runs both. Then commit on `web` with a descriptive message.
