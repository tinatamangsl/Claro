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
The day's copy is fixed: **"One day, three clear priorities"** and **Habits** (never "rituals" in
user-facing text; the data key stays `habits` because renaming it would be migration risk for
nothing).

**"My three anchors" is no longer shown.** The section was removed from Today, but
`Day.nonNegotiables` is still in the model, still migrated and still written by `blankDay` —
existing entries are preserved untouched. Removing a feature from the UI must never quietly
delete what people already wrote.

Everything hangs off a single three-level hierarchy:

```
QUARTER  Direction    → WEEK  Commitment  → DAY  Execution
```

Nav is **Daily | Week | Quarter | Calendar**, and gains a fifth item, **Cycle**, once cycle notes
are turned on. Four items on a fresh install, five after: a nav item on an app nobody has opted
into would advertise an optional private feature to somebody who never asked for it, and hiding a
five-screen destination behind links inside other pages misdescribed the product. The sub-routes
`/cycle-day` and `/cycle-guide` light the Cycle item, and `/quarter-plan` lights Quarter, so the
nav never looks like the user has left the app. Calendar was added deliberately as a
*review* surface, not a fifth planning level: it holds Month (the detailed view), Quarter and Year,
all read from one shared aggregation in `lib/calendar.ts`. Quarter and Year are read only, and no
view computes a total of its own. The planning Quarter in the nav is a different screen. The product thesis is still "fewer, more meaningful things", so answer most
feature requests by deepening an existing screen rather than adding another.

## Information architecture

The shape was measured rather than assumed, and four faults drove the current layout. They are
worth knowing because each is easy to reintroduce.

**Weight and findability must match.** `/cycle` was 5.1 screens and 79 buttons while sitting
outside the nav entirely, heavier than Week, Quarter and the quarterly plan combined. It is now in
the nav once enabled, and split: the glance and the log stay, and Calendar / Numbers / Phases /
History sit behind one control, which took it to 3.4 screens.

**Depth follows frequency, not importance.** The three-tap daily log was three clicks deep while
the cited sources were one. `CycleLink` now points at `/cycle-day` until today is logged and at
`/cycle` after, so the thing done daily is one tap from Daily.

**One destination, one affordance.** Five components linked to `/cycle`, each looking and reading
differently, and two of them sat on Daily at once. There is now a single `CycleLink` and every
screen uses it. A person cannot build a mental model of where something lives if each screen
offers a differently-shaped door to it.

**Planning belongs on planning surfaces.** "Plan this month" sat on Calendar, which this file
defines as review-only, while Quarter carried a single heading. The three months of a quarter now
live on Quarter as one intention each; Calendar went from 2.5 screens to 1.9 and Quarter from 1.6
to 2.1. The review page got lighter and the strategic page got the weight it was missing.

**Estimated periods repeat as far ahead as anybody scrolls.** `estimatedWindow` gives the next
one, for the places that name a date; `estimatedPeriodOn` answers "is this day in *any* estimated
period" with modular arithmetic against the user's own gap, so marking a day in 2029 costs the
same as marking tomorrow and a year view needs no list built for it. It projects forward only:
running it backwards would draw periods over months the user actually lived and may have logged
differently. `estimatedAhead` counts how many cycles out a projection is, and anything past the
next one is drawn at `.cycle-estimate-far`, because the fifth projected period rests on exactly
the same handful of logged dates as the first and must not look as though it rests on more.

**Today is a ring, not bold type.** Once every cell carried a phase wash, weight alone was
invisible and today became unfindable on the grid. It is `ring-2 ring-foreground/70` plus
`aria-current="date"` plus "today" in the accessible name, and the key names it.

**The calendar is the first thing on `/cycle`.** It used to sit two and a half screens down,
behind a glance card carrying the day, the phase, the cycle length, the recorded durations and two
paragraphs of caveat. Most of that was already visible in the grid below it or in the Numbers tab,
so the card pushed the thing people open the page for below the fold in order to repeat what that
thing already showed. `CycleGlance` is now a four-line strip with the one reading a grid cannot
give at a glance: which cycle day today is, which phase, and when the next period is estimated.
Logging follows the calendar rather than preceding it, and Numbers / Phases / History keep the
segmented control. `/cycle` went from 5,742px to 2,944px on a phone, with the grid inside the
first screen at both widths.

**Say a promise once, in full, rather than a third of it five times.** The cycle page reached 43%
of its words in long prose against 18% everywhere else in Claro, because every safety commitment
had been repeated under every card: 87 words of caveat on the glance alone, 41 more on the
calendar, 20 on the log. Each was true and each was there for a reason, and together they made the
page something to read rather than something to use.

`WhatClaroDoes` now carries the whole statement once, at the foot of the page, in a `<details>`
that stays in the document when collapsed so it is searchable and reachable by a screen reader.
The cards keep a short line each ("From your own dates. An estimate, not medical advice"). Nothing
was dropped, and a test asserts every promise is still present in full. `/cycle` went from 452
words to 307 and from 43% prose to 0% long prose.

The contextual notes that stayed are the ones tied to a specific control: `OVULATION_NOTE` beside
the ovulation band, the refusal messages beside the field that was refused. A promise about the
whole feature belongs at feature level; a warning about one control belongs on it.

`/cycle-guide` is deliberately left long at 7.7 screens. It is a reference document read rarely
and in full, and chunking a cited source list into tabs would make it harder to scan, not easier.

## Architecture

Stack: TanStack Start v1 (SSR React 19) · Vite 7 · TypeScript strict · Tailwind v4 CSS-first ·
date-fns v4 · lucide-react · `localStorage`.

Data flows one way: `ClaroProvider` (single `useState` holding the whole store) → `useClaro()` →
route views → components. There is no data fetching, no async, and no cache layer.

```
src/lib/types.ts        domain model + the caps. Start here.
src/lib/dates.ts        quarter/ISO-week/day ids, hierarchy resolution, navigation
src/lib/storage.ts      the ONLY module that touches localStorage
src/lib/focus.ts        Return to Focus: what to return to, and where a distraction goes
src/lib/focus-session.ts the focus session state machine — pure, now-injected, no timers
src/lib/focus-presets.ts    how long a block is, and whether a break follows it
src/lib/rollover.ts     the 10 PM carry-forward rule and the review-area decisions
src/lib/reorder.ts      pure list movement — every drag and every keyboard nudge goes through it
src/lib/schedule.ts     moving a schedule entry between hours, and the swap when one is taken
src/lib/calendar.ts     month grid + habit aggregation (counts only, never a streak)
src/lib/cycle.ts        logged period ranges, and estimates from the user's own history alone
src/lib/cycle-calendar.ts   what each calendar day is: logged, estimated, or neither
src/lib/cycle-phases.ts     the four estimated phases, projected across the calendar
src/lib/cycle-guide.ts  the learning page's content and its cited sources
src/lib/cycle-log.ts    the quick daily log: three energy taps over one stored reading
src/lib/cycle-forecast.ts   the next seven days, with no forecast of how anyone will feel
src/lib/cycle-recalibration.ts  what moved in the user's own estimate, said once
src/lib/sound.ts        the single generated-ambient-sound engine
src/hooks/use-sortable.ts   pointer + keyboard reordering, group-aware
src/hooks/use-focus-session.ts  the one canonical session, shared by every route
src/lib/priorities.ts   where a blank priority slot acquires its identity
src/lib/goals.ts        the one goal vocabulary — resolve and label a GoalRef
src/lib/habits.ts       habits and their consistency counts (never streaks)
src/hooks/use-now.ts    the app's ONLY tick source
src/lib/claro-store.tsx ClaroProvider + useClaro() — also owns the hydration contract
src/routes/             __root, index (→ /today), today, week, quarter, quarter-plan,
                        calendar, cycle, cycle-day, cycle-guide
```

## Invariants — breaking these breaks the app

**1. Never read `localStorage` during render.** `ClaroProvider` holds `null` on the server *and*
on the client's first render, then loads real data in a mount effect and flips `ready`.
`AppShell` renders a skeleton until then, which is why server HTML contains only the shell.
A `useState(() => loadState())` initialiser would run during the first client render and
produce a hydration mismatch. This is the single easiest way to break Claro.

**2. `new Date()` must never be called during render.** It is read in exactly two effects in
`claro-store.tsx` (initial load, and the midnight-rollover interval), and in event handlers that
stamp `createdAt` — `ActionLists` and Today's distraction capture. Handlers are safe because they
only ever run on the client, after hydration. Every helper in `dates.ts` takes an explicit date or
id, and pure logic that needs the time takes an injected `now` (see `focus-session.ts`, where the
entire timer is pure functions of `(session, now)`). The one ticking clock is `useNow`, which
returns `null` until mount for the same reason the store starts un`ready`. Computing
"today" during render makes the server's timezone disagree with the browser's — a hydration
mismatch *and* a correctness bug.

**3. `src/routeTree.gen.ts` is generated** by the router plugin on `vite dev`. Never hand-edit.
It type-augments `Register` against `getRouter` in `router.tsx`, so that export name is load-bearing.
Colocated route tests are kept out of the scan by `router.routeFileIgnorePattern` in
`vite.config.ts`; without it the generator warns that `src/routes/*.test.ts` exports no Route.

**3a. Scroll restoration is off, and must stay off.** `scrollRestoration: true` in `router.tsx`
fights invariant 1: the store is null on the first client render, so when the browser restores a
position the document is still the skeleton and a fraction of its real height. The offset is
clamped to that height, the real content then expands underneath it, and the reader lands
somewhere they were never looking — measured at 58px, 98px and 297px for the same 900px scroll,
purely as a function of viewport width. A position that cannot be honoured is better not promised.

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

## Undo

Claro deletes things in a lot of places, and for a long time none of them could be taken back: a
habit and its history, a side quest, a period, a whole cycle record. `ClaroProvider` now keeps a
bounded stack of whole `ClaroState` snapshots, which is cheap precisely because the store is one
`useState` holding a small object. Undo is "restore the previous snapshot", not a per-feature
inverse operation, so it cannot drift out of step with the mutations it reverses.

**The call site marks the change, the store does not guess.** `recordUndo(label)` snapshots the
state *before* a destructive change and names it in the words a user would use. The four
destructive methods the store owns record themselves; day, week and quarter deletions go through
generic recipes, so those call `recordUndo` at the handler.

**Editing text is deliberately not undoable.** Retyping is its own undo, and recording every
keystroke would bury the deletion somebody actually wants back under a hundred no-op steps. The
same goes for toggling something done: the toggle is the way back.

`recordUndo` reads a ref that mirrors the live snapshot rather than depending on state, so it
stays stable and never re-creates every handler that uses it. It must not be called from inside a
`setSnap` updater: those have to stay pure, and React may run them twice.

`UndoBar` sits in `AppShell`, so the offer appears on every screen. It fades after nine seconds
because an undo that stays forever stops reading as urgent and starts reading as furniture. The
keyboard route has no timer: Command-Z reaches the whole stack, so a run of deletions can be
walked back one at a time long after the bar has gone. It stands aside inside inputs and
textareas, where the browser's own undo is the right one and hijacking it would make retyping a
sentence resurrect a deleted habit. Shift-Command-Z does nothing, because Claro does not redo.

## There are no native selects left

A `<select>` styles its trigger and nothing else. The list that drops out of it is drawn by the
operating system, in system grey, and no CSS reaches it, so the one moment the user is actually
looking at the control was the moment Claro's design stopped. `Picker` draws the list instead, and
every choice in the app goes through it: the goal on a priority, the bucket on an action, the time
on a calendar block.

What that costs is the behaviour a native select gets free, and it is paid back deliberately: the
trigger is a real button with `aria-expanded`, the list is a `listbox` of `option`s, arrow keys
move, Enter and Space choose, Escape closes and returns focus, and a pointer down outside
dismisses. **Two controls must never share a name** — the "add another" button and the field it
opens were both called "Add another at 1 PM", which is two things a screen reader cannot tell
apart; the field is named for the slot it writes.

A dangling goal passes `value={null}` rather than `""`, so the trigger shows "That goal is no
longer set" instead of the label of the clear option.

## The schedule holds quarter hours

`ScheduleItem.time` was always a string, so finer placement needed no schema change: "16:30" is a
valid time and always was. **An hour is a frame, not a slot.** The eighteen rows stay, because
seventy-two quarter-hour rows is a spreadsheet rather than a day, but a row now holds every block
whose `hourOf` matches, sorted by minute, and shows ":30" beside anything off the hour.

The minute is a **control, not a label**. An entry that landed on the hour and belongs at quarter
past moves there in one tap rather than being deleted and retyped, and on the hour the control
stays invisible until the row is hovered, because eighteen ":00"s down the page is noise.

An empty hour offers its line straight away. An hour that already holds something offers a quiet
plus naming the next free quarter, and opens one line at a time: a second textarea in all eighteen
rows would fill the page with fields nobody asked for. Dragging still moves between hours and
keeps the minute it was on.

## Dragging across the day, not just within a list

`useSortable` reorders one set of items, which is the right shape for a list and the wrong shape
for "put this task at four o'clock": the source and the target are separate components holding
separate records, and neither can own the other's coordinates.

`externalDrop` is the seam. A list passes `zoneAt`, `onDrop` and `onHover`; while the pointer is
over an outside zone the preview stops following it, and on release the reorder is **abandoned
rather than committed**, because the item did not move within the list, it left it. The same grip
that moves a task between buckets carries it onto an hour.

**A drag needs the page to scroll under it, or it only works when the grip and its target are
already on screen together.** On Today they never are: the schedule and the action lists are a
page apart, so at 1280x800 the wanted hour sits below the fold and on a phone it is several hundred
pixels above the viewport. `lib/auto-scroll.ts` runs a **frame loop, not a pointer-move handler**:
holding still near the edge is the whole gesture, and a stationary pointer fires no `pointermove`
at all, so a move-driven scroll stops the instant the user does the one thing they are trying to
do. That mistake shipped once and made the feature look completely broken.

It scrolls the **window first**. The spread's pages scroll internally from `lg` up, so the
container under the pointer is usually the *actions* column while the target is an hour in the
*schedule* column beside it: scrolling what the pointer is over moves the wrong pane and never
reveals the target. The inner pane only takes over once the window has run out.

**A drag is followed on the window, not on the grip.** `setPointerCapture` looks like it makes
that unnecessary, and above `lg` it does. But capture belongs to a DOM node, and this hook's whole
purpose is moving an item between lanes, which commits to the store immediately, remounts the row
under its new bucket and destroys the node holding the capture. The browser fires
`lostpointercapture` and every later move goes wherever the pointer happens to be.

Below `lg` the buckets stack, so dragging an action *up* towards the schedule crosses the other
buckets on the way and triggers exactly that. The result was a drag that worked perfectly at
1280px and died silently mid-gesture at every width under 1024px, including every phone — measured
as capture lost at y=320 with `target=undefined`, after which nothing highlighted and nothing
dropped. The window is the only node in this picture that cannot be unmounted. Capture is still
taken, because it stops touch scrolling the page out from under the gesture, but it is now optional
rather than load-bearing and is called with `?.` — bare, one throw stopped the drag ever starting,
and jsdom has no such method, which is why this hook had no test at all until it had a bug.

**The top auto-scroll edge starts below the header.** The header is sticky and 65px on a laptop,
89px on a phone, so a band measured from zero is almost entirely covered by it: the place you must
hold to scroll up is a place where nothing can be dropped. The band is measured from the header's
bottom instead. The rate is derived from `EDGE` rather than a divisor picked separately, which had
been quietly capping travel at under half of `MAX_STEP`.

**Dragging is the shortcut, not the entrance.** It needs a pointer, needs the grip to be found,
and needs a target that is a page away on any stacked layout. Every action and habit row therefore
carries a time `Picker` offering the day's free slots: two taps, at every width, and the only path
here a keyboard can take. Only free slots are offered, so the taken-hour refusal is unreachable,
and the labels are `formatTimeLabel`'s minute-accurate ones — `formatHourLabel` collapsed four
quarter slots onto a single "3 PM" and put one name on four options of the same listbox.

`Picker` opens its list upward when the trigger is nearer the bottom of the viewport than the
panel is tall. It is 15rem and was always hung below, which is fine halfway up a page and useless
for a control on the last row of a phone: the list drew off-screen entirely. The panel also
carries a floor width, because matching a narrow trigger truncated every option to "5:1...".

`lib/drop-zones.ts` is a plain module registry, not a context, because the only thing shared is
where some elements are on screen. That is a DOM fact that changes on every scroll, and threading
it through the tree as state would mean re-rendering the page to answer a question
`getBoundingClientRect` already answers. It reads the rectangle **at the moment of the question**:
a drag can scroll the page under itself, and a cached rectangle drops work on the wrong hour. A
zone with an empty rectangle is skipped, or a collapsed element would match every point.

A drop creates a **linked row, never a copy** — the schedule points at the task or habit that
already exists, so the words stay in one place and ticking either ticks both. `sameLink` stops the
same record being given two hours by being dropped twice. Dropping on a taken hour lands on its
next free quarter rather than being refused: the gesture already said which hour was meant.

## Planning a day from the calendar

Tapping a day in the month grid opens `DayPlanner` in place rather than navigating to Today. It
lists what is on that day and adds to it, and the records it writes are the day's own
`scheduleItems` — **there is no separate store of calendar events**. Two stores of the same thing
is how a planner and a calendar start disagreeing about what is happening on Thursday.

**A block can be a priority rather than merely mention one.** The add form asks, at the moment the
question is answerable, and ticking it writes the priority *and* links the block to it through the
`ScheduleLink` that already existed. One piece of work, named once: the row reads its title
through the priority, so renaming either renames both and ticking either ticks both.

**Three slots full does not lose what was typed.** `planBlock` still records the block, reports
`slotsFull`, and the panel says the three priorities are taken and offers to open the day. The cap
is a product feature and must not break; it also must not eat somebody's sentence.

One thing per hour stays the rule, so `freeHours` drives the time picker and only offers hours
that are empty. A refusal exists for the taken-hour case, but the picker cannot reach it.

The month cell shows **how many blocks a day carries, as a number in the corner** rather than a
fourth dot. Three marks was already the limit of what a 46px cell can hold, and "how much is on"
is a count rather than a yes or no. It sits apart from the day number, because "24" beside "5"
reads as 245.

## Reordering

`useSortable` is the only drag implementation, and it uses **pointer events, not HTML5
drag-and-drop** — HTML5 DnD does not fire on touch at all, so it could never satisfy "mouse and
touch". Three rules it exists to keep:

- **Only the grip is draggable.** Text fields stay ordinary text fields, so selecting and editing
  text still works. `DragHandle` is a real `<button>`, focusable, carrying its own instructions.
- **Every reorder is reachable from the keyboard.** Arrow keys on the grip move an item; with
  grouping, left/right change lane (or up/down, when the lanes are stacked — the schedule's
  hours). Each move is announced through `SortAnnouncer`'s `aria-live` region.
- **A drag previews locally and commits once.** `liveIds` holds the order during the gesture; the
  store is written on pointer-up. The exception is a *lane* change, which is committed as it
  happens, because an id order alone cannot express "this now belongs to another bucket".

Habits are a keyed map, so they carry an explicit `order`; everything else is already an array.
`activeHabits` falls back to `createdAt` when `order` is absent, so habits saved before
reordering existed keep exactly the order they had.

## Focus is global, and there is still only one session

`useFocusSession` owns the canonical session and every operation on it. Today, Week, Quarter and
the header control all go through it, and the store still holds exactly one
`activeFocusSessionId` — starting a block from Quarter replaces the pointer, it does not add a
clock. `FocusTargetRef` names what a block is for at any level of the hierarchy and snapshots the
title, so the record still reads honestly after the goal is renamed or deleted.

**Resolving a session never completes the work it pointed at.** `close()` writes only to the
session. The single path to a completed priority is the explicit choice on the end screen.

### A block is any length the person wants

`plannedMs` was always an arbitrary number, but for a long time the interface offered exactly two
values and every other entry point silently used 25 minutes. `lib/focus-presets.ts` fixes the
interface, not the model: four named shapes (Pomodoro 25/5, Long block 50/10, Short burst 15,
Just begin 5) plus a plain minutes field that takes anything from 1 to 180. Nineteen minutes is
an ordinary way to work and a fixed menu cannot express it.

**The chip is derived from the numbers, never tracked beside them.** `matchPreset` works out
which shape a pair of durations happens to be, so typing 25 and 5 by hand lights up Pomodoro
rather than reading "Custom". There is one source of truth, so the two cannot disagree.

**The choice is remembered in `ClaroState.focusPrefs`** and read by every entry point, which is
what makes "Focus" on a side quest four screens away start at the user's length. Additive, so no
migration: `readFocusPrefs` repairs anything unusable rather than letting a half-typed field
become a block length.

**A block can be lengthened or shortened while it is running.** `adjustPlanned` is safe precisely
because elapsed time comes from timestamps: the plan is just a number and moving it loses nothing.
It will not shrink below the time already spent, because "five minutes less" must never silently
mean "end this now" — ending early is its own deliberate button.

### The break, and the clock that has to tick through it

Pomodoro is a break as much as it is 25 minutes, so `FocusPhase` has a `break`. It is only ever
entered from `ended`, which is to say only ever by choosing it, and **when it runs out the screen
waits**: a timer that starts itself at a desk nobody is sitting at turns the rest of the break
into a debt. `settleSession` deliberately does not advance out of it.

`isCounting` still means "the main block is draining", which is what the block's own arithmetic
asks about. **`isTicking` is the wider question the clock asks** — it includes `break`, and
without it `useNow` returns null through the whole break and the number sits frozen at its full
length while the break quietly passes. The header and the Today strip read the break's remaining
time too, rather than reporting a block that already finished.

## Ambient sound

`lib/sound.ts` synthesises every soundscape through the Web Audio API: white, pink and brown
noise, gentle rain (band-passed pink noise with a slow drift), a soft ambient pad (detuned sines
through a lowpass), and a short optional chime. No audio file, no catalogue, no network request,
nothing to license and nothing to track.

### Lo-fi and jazz: what would be required before they can ship

**This repository contains no audio assets of any kind.** Checked at the time of writing: no
`.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac`, `.aac` or `.opus` anywhere outside `node_modules`, no
`public/` directory, and no licence file. So there is nothing to offer, and nothing was added.

Generated audio is never labelled lo-fi, jazz, or music. Doing so would misdescribe filtered noise
and set an expectation the engine cannot meet.

Shipping real instrumental audio needs all of the following settled first, none of which is a
coding task:

1. **The asset itself**, either commissioned original recordings or tracks under a licence that
   permits redistribution inside a product. A "free for personal use" or "royalty free" download
   is usually neither.
2. **A written licence** covering commercial use, redistribution as part of an application,
   and the territories the app is available in, kept in the repository beside the audio.
3. **Attribution requirements** recorded and honoured in the interface where the licence demands
   it.
4. **A size and delivery decision.** Real audio is orders of magnitude larger than the current
   engine, which generates everything at runtime and ships no bytes. Bundling it changes the
   install size; streaming it introduces a network dependency and a hosting cost, and would break
   the current promise that nothing is streamed.
5. **A privacy answer** for anything streamed, since the app currently makes no network requests
   for sound at all.

Until those exist, do not scrape, re-encode, or "temporarily" bundle third-party tracks.

The engine is a module-level singleton with one voice mounted at a time: switching soundscape
tears the old voice down as it mounts the new one, so two can never overlap. Playback starts only
from a user gesture, which is the product's rule as much as the browser's. The stored preference
is a volume, a mute, a soundscape, a mode and the chime flag, never "resume automatically".

**Modes are labels, not treatments.** Deep focus, Light and admin, Creative flow and Reset name
how someone intends to work. Nothing in the model, the engine or the copy may claim an effect on
brainwaves, cognition, stress, productivity or hormones.

### The sound lifecycle belongs to the block, and is owned once

Sound stops when the *block ends*, not when the user later picks an outcome, and that is also the
only moment the optional chime may sound. `useFocusSession` is instantiated by several components
at once (the header control and the page), so the end-of-block side effect is guarded by a
module-level `endedSessions` map. Without it the first instance to run would pause the sound and
every later instance would conclude there had never been any, which silently hid the
post-session question.

The feedback answer is stored privately and read by nothing. There are no recommendations, no
insights and no scoring built on it, and "Skip" is recorded as a real answer.

## The 3-3-3 Method

An existing planning framework popularised by Oliver Burkeman, credited where it is introduced and
never presented as Claro's own idea: one meaningful project for a stretch of focused work, three
shorter tasks, three maintenance activities.

`lib/plan333.ts` is a composer, not a store. The meaningful project *is* priority 1, the tasks are
`task` actions and the maintenance jobs are `quickTick` actions, so nothing is duplicated and a
user editing Today the ordinary way is editing the same records. `Day.plan333` holds only a marker
and the intended hours.

The hours are adjustable and the shape is a starting point: a partial plan is a normal outcome,
`scheduleFocusBlock` never overwrites an hour that already has something in it, and there is no
score, reward or completion-pressure language anywhere in the flow.

## Private cycle notes

Four routes, none of them in the nav: `/cycle` is the centralised view, `/cycle-day` the daily
flow, `/cycle-guide` the cited education, and the cycle marks on `/calendar` come from the same
data. Off until explicitly turned on, kept in its own branch of the store, and deletable in one
action, which is itself undoable.

**Cycle data is separate from planning data on purpose.** The optional daily note (energy, mood,
stress) lives in `cycle.checkIns`, not on the `Day`, so "delete all cycle data" can remove every
trace of it without touching the day's own reflection. That separation is the reason a day can
carry both a Daily review mood and a private cycle note: they are different records, on different
pages, serving different purposes.

Claro never reads anything into a note. The Daily prompt asks "Would you like to adjust today's
plan?" and does nothing else: no priority, habit, schedule, focus length, sound or calendar plan
is ever changed because of cycle data.
An estimate is the **median of the gaps the user has actually logged** — never a population
average, never a model — and always labelled with the number of gaps it drew on. Implausible gaps
are excluded as likely mis-logs. Below three logged starts it falls back to the length the user
stated, and says so; with neither it is withheld entirely rather than guessed at.

Out of bounds, permanently: any medical, fertility, contraception, pregnancy, diagnostic,
nutrition, supplement or symptom-treatment interpretation, and any suggestion that a phase should
change what someone works on.

### A period is a range, and its end is never guessed

`CycleEntry` is `{ startDate, endDate }` where **`endDate: null` means no end has been recorded**.
An end date is a fact only the person living it can supply, so nothing in the codebase fills one
in. Null has two honest readings, told apart by whether anything was logged after it:

- the **newest** open period is *ongoing*, confirmed from its start up to today and no further;
- an **older** open period simply had no end recorded, and is confirmed only for its first day.

That second case is what a store saved before ranges existed migrates into (schema v8). Treating
every legacy entry as ongoing would have had one of them swallow every day since, which is why the
distinction exists at all rather than being a nicety.

**Cycle length and period duration are different numbers and are never mixed.** `estimateNext`
reads start dates only; `durationHistory` reads completed ranges only. Wherever both appear they
are labelled apart, and `CYCLE_LENGTH_NOTE` says which is which. Length is shown in weeks and days
for reading, while days stay the stored unit.

**Two periods may not cover the same day.** `overlapping` refuses it and returns the colliding
entry so the refusal can name the dates it clashed with. Silently keeping both would corrupt every
duration and every gap drawn from them.

**Confirmed and estimated can never be the same day.** `cycle-calendar.ts` marks a day as
`estimated` only where `period` is false, so a colour means exactly one thing. Visually they are
not the same treatment at different opacities: a logged period is a solid amber band drawn
continuously across the whole range, and the estimate is a dashed, unfilled outline. The band
reaches into the grid gutter to close it, which is why the grid carries `px-0.5`.

### `/cycle` is the centralised view

One page holding the whole feature: the glance, three equal ways in (log today, this week,
learn), logging a period, **one calendar at two scales** (month grid or a twelve-month year), the
numbers, and each part of the cycle as the user's own record of it. History and the fuller
check-in form are `<details>` disclosures, closed by default and still findable by the browser's
own in-page search: opened, they took the page past 12,000px on a phone, which is the opposite of
a view you can take in.

**The calculators are the ones a calendar can support.** The apps this page takes its shape from
offer ovulation, fertile window, implantation, HCG, pregnancy-test and due-date calculators.
Every one is a fertility or pregnancy prediction. What Claro offers instead is arithmetic anyone
can check: cycle length, recorded durations, the next estimate, and which cycle day a date falls
on.

**"Your cycle, part by part" is where a food and movement plan would go, and does not.** The
reference app fills that slot with "eat protein-rich meals, fresh vegetables, fermented foods"
per phase. A calendar estimate cannot know what a body needs, and a list of foods beside a phase
label reads as instruction however gently it is written. The slot holds two things instead: what
this person logged in that part of their own cycle, and the user-led questions. The physiology
stays on the guide page, where it is cited.

### Estimated phases on the calendar

`lib/cycle-phases.ts` divides a cycle into **menstrual, follicular, ovulation and luteal** and
projects them across the calendar, at both scales. Bleeding days come from the user's own recorded
durations; ovulation is placed by the ordinary convention that the luteal phase runs about
`LUTEAL_DAYS` (14), and is drawn as a short band rather than a day because a date cannot be
pinned. Short cycles squeeze the follicular band to nothing, which the arithmetic survives rather
than producing a band that runs backwards.

**This reverses the earlier positional labelling, everywhere.** Claro used to say "Early / Middle
/ Later in your estimated cycle" and a test forbade the phase names outright. The user asked for
the physiological names three times, so they are now used, and `CycleBand` is gone rather than
kept alongside: `positionOn`, `observations`, `notesInPhase` and `summarisePhase` all key on
`CyclePhase`, and the glance bar, week card, week slider, daily flow and the "part by part" panel
all read the same four names as the calendar. **Two vocabularies for one thing is what made the
feature feel unintuitive**, and a phase division that lived in two places would eventually
disagree with itself: `summarisePhase` takes its day ranges from `phaseBands`, the same function
the calendar paints from.

The boundary moved rather than disappeared:

- Every phase is labelled as **estimated from logged dates**, with `PHASE_ESTIMATE_NOTE` beside
  every place they are drawn. A colour on a calendar reads as a fact and this one is not.
- **The ovulation band is never a fertility prediction.** `OVULATION_NOTE` travels with it and
  says a calendar cannot confirm whether or when ovulation happened. There is no fertile window,
  no chance of conception, no best time to try and no pregnancy language anywhere that reads this
  module. The tests check that *per sentence*, so the words may appear in the refusal that stops
  the feature becoming a fertility product but nowhere else.
- No phase carries advice about food, movement, work or rest. The per-day panel shows the phase,
  the cited educational paragraph already written for the guide, and what the user themselves
  wrote at that point before. Nothing else.

`projectedDay` counts **forward only**. Counting back past the first logged start would invent
cycles nobody recorded, and the projection's whole claim is that it rests on dates that exist.
Anything past the cycle in progress is flagged `projected` and drawn at roughly half the wash, so
further ahead looks less certain.

The washes sit *behind* everything logged: a solid amber band is still a day somebody recorded,
and a tint is arithmetic. If a wash ever competes with the band, the calendar has started
presenting a guess as a fact.

### Logging on the calendar itself

**A period is painted, not filled in.** Press a day, drag across, release: one gesture, committed
once on release rather than once per day dragged over. Pointer events again, and the touch pointer
is explicitly released on `pointerdown` because touch implicitly captures the element the gesture
starts on, which would stop `pointerenter` firing on everything dragged across. That release is
guarded by `hasPointerCapture?.()`: releasing a capture that was never taken throws, which is
exactly the mouse case, and jsdom does not implement the method at all.

Two refusals keep a drag safe. It will not begin on a day already inside a logged period, so a
gesture can never paint over one, and it will not extend into days that have not happened. A press
with no movement is a tap, and selection is left to the click that follows: doing it in both
places toggles the day straight back off.

**Dates are nudged, never typed.** `RangeStepper` replaced every pair of `<input type="date">` in
the cycle feature, because a date picker was the wrong control for the job twice over. The
correction people actually make is "that was a day earlier", and a picker turns one tap into
opening a calendar, finding a cell and confirming. It also asks somebody to read `21/08/2026` and
decide whether it is right, where "yesterday" is either right or wrong at a glance, so each end
shows a short date and a relative phrase together.

The arrows enforce the shape as they go: neither end can pass today, and the start cannot cross
the end. **An invalid range is better made unreachable than refused afterwards** — the backwards
refusal still exists for the paths that can reach it, but the stepper never can. A live day count
sits beneath, so the length being built is visible while it is being built rather than after.

The one date input left in the feature is the "which cycle day is a date?" lookup, which is a jump
to an arbitrary date and genuinely wants a picker.

**The way out is in the same place as the way in.** A range painted with a finger lands on the
wrong day often enough that "open the history, find the entry, press the small cross" is the wrong
answer. `LoggedMeaning` appears on every log and carries **Undo this** and **Change the dates**
inline, with the dates editable in the card itself. It scrolls itself into view on mount, because
a drag happens well below the card on a phone and a confirmation nobody scrolls back to is not a
confirmation. Undo takes one tap and no dialog: it is the correction of a decision, not a decision.

The card is keyed by start date, so moving a start has to be followed through `onMoved` or the
confirmation vanishes at the exact moment it is being relied on.

`CycleCheckIn.flow` records how heavy a day was, on the day's own note. Read back, never
interpreted, and nothing in the app behaves differently because of it.

**`CycleSettings.cycleLength` is the length the user says their cycle runs.** `estimateNext`
prefers the median of real logged gaps and falls back to this figure, so somebody who has logged
one period sees an estimate on the calendar immediately instead of waiting three cycles. The
estimate carries a `source` of `"logged"` or `"stated"` and the interface always says which, so a
remembered number is never passed off as a measured one.

### The daily flow at `/cycle-day`

Five screens on one route, driven by a `view` search param so each is linkable and
browser-back is the way out: **log**, what your own notes show, the next seven days, the
end-of-day check-in, and a **changed-estimate** screen that comes before the rest when there is
something to report.

It was built from a supplied design that had to be adapted in four places, and the adaptations
are the point rather than an oversight:

- The phase line is **positional**, not "Luteal phase". Same reason as everywhere else.
- The insight card carries a **description of the user's own notes**, not "your brain is working
  harder than usual, deep focus work will cost more today". Claro knows neither thing.
- The seven-day strip has **no energy forecast and no descriptor**. `ForecastDay` has nowhere for
  one to live, and a test asserts the shape. Announcing on Monday that Thursday will be hard is a
  good way to make Thursday hard.
- The changed-estimate screen says **"Your estimate has changed"**, not "Claro has learned
  something", and ends in "got it" rather than "apply to my calendar". Nothing is applied because
  a changed estimate changes a number on a page.

**The log is one question per screen**, and choosing an answer is what advances: no submit button
between steps, and never two decisions on screen at once. Three taps on an ordinary day.

The first question adapts rather than asking the same thing daily. With a period already open it
asks whether that period has ended; otherwise it asks whether one has started, and **always offers
"No, not yet"** — a flow whose only answers are yes is not asking a question. Every answer reports
through `onPeriod`, with `"none"` as the handler's no-op, so the decision about whether anything
is written lives in one place. Starts and ends go through the same `addPeriod` and `endPeriod`
rules as the calendar, so an overlap is refused identically; the refusal is silent here because
three taps is the point, and the calendar is where a conflict gets explained.

**The week is a swipe, not a table.** Seven full-width cards, three back through three ahead,
opening on today. Swipe, arrows, dots and the strip above all drive the same index. The gesture is
**pointer events with `touch-action: pan-y`**, for the same reason `useSortable` is: one handler
has to serve a finger, a trackpad and a mouse, and vertical scrolling still belongs to the page.
Edges resist rather than refuse. CSS transitions only, no animation library, and everything stops
under `prefers-reduced-motion`.

**A card shows the energy the user logged, never a predicted one.** A day they have not logged
says so. `ForecastDay` carries `loggedEnergy` and has no `energyPrediction` beside it, and a test
asserts the shape.

Two implementation notes worth keeping. **The landing screen is chosen once, on arrival**
(`useState` initialiser, not derived per render) or tapping the first control would count the day
as logged and throw the user onto the next screen mid-sentence; moving on is what "log it" is for.
And the three energy taps are a **view of the same 1 to 5 reading** the fuller page writes, not a
second field beside it: `bandOf` and `levelForBand` project between them, and a level already
inside the tapped band is kept, so a 5 entered elsewhere survives a tap on HIGH.

`Feeling` and `EveningNote` are additive fields on `CycleCheckIn`, alongside the older `mood`
rather than replacing it. They are different vocabularies, and translating between them would be
Claro putting words in somebody's mouth.

### Understanding your menstrual cycle: the guide

A separate route at `/cycle-guide`, reached by a quiet link from Cycle notes and never in place of
the actions. `lib/cycle-guide.ts` holds the content and the sources.

**Every source was read off the page it cites**, and the links were checked as resolving. Titles,
organisations, publication and review dates come from the source itself; `author` and `published`
may be `null` because many institutional pages have neither, but they may never be *missing* —
`missingSourceFields` treats `undefined` as a failure, because an explicit null records that
somebody looked. Never add a citation, a credential, a date or a finding from memory.

The copy rules are enforced by tests rather than by good intentions: no fertile window, no
pregnancy likelihood and no ovulation prediction except as an explicit refusal; nothing about what
a phase makes someone; no comparison between bodies; no 28-day default; and no verdict that a
period or a cycle is normal, abnormal, short, long, heavy or light. Guidance is questions only.

## Design decisions and why

**The model is Supabase-shaped, but Supabase is not here.** `focusSessions`, `interruptions`,
`quarters`, `weeks` and `days` are keyed maps of records with stable ids — each is a table in
waiting, and `storage.ts` is the seam an adapter would replace. Priorities keep the natural
composite key `(dayId, rank)` rather than uuids, because they are fixed slots on a day rather than
free-standing rows. No auth, no sync and no network belongs in this codebase yet.

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

**The schema is at v8, and almost nothing needed a version to get there.** `migrate()` applies
versioned steps only where a field genuinely changed meaning: v1→v2, v2→v3, v5→v6 (a schedule
entry gains a kind), v6→v7 (the review's second question is renamed and moved across), and v7→v8
(a period becomes a range). Everything else added since is read through a default instead, which
is why `focusPrefs`, `Feeling`, `EveningNote`, `flow`, `cycleLength` and `lastSeen` all arrived
without a bump: nothing already on disk changes shape or meaning, so a store saved last month
loads correctly with the new field at its blank value. Reach for a versioned step only when an
existing field means something different afterwards.

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
goal, 3 non-negotiables, 3 priorities. At a cap the add affordance is *replaced* by a line of
copy explaining why ("Three is the limit — that's the point."). Don't turn these into errors or
raise them; the constraint is the product.

**Return to Focus is a mode of Today, not a fourth screen.** A distracted user who reopens Claro
meets the entire Today surface — three priorities, an 18-row schedule, three action buckets,
non-negotiables, a check-in and notes — and that surface is itself the re-distraction.
`/today?focus` strips it to one task, the rungs above it, and one capture field. It stays a search
param rather than a route so the nav stays three items, the screen is linkable, and browser-back is
the way out. It is offered only for today (`dayId === today`); returning to focus is about now, not
about auditing last Tuesday.

**The focus is derived, not stored.** `selectFocus` returns the first unfinished priority, then
falls through to a done state that offers the top unfinished Project — never a Quick Tick, which is
not a meaningful thing to return to. There is deliberately no saved "current focus": the hierarchy
has already decided what matters today, so remembering it is the system's job rather than the
user's, and the feature needs no schema change or migration. A parked distraction becomes a
`quickTick` via `parkDistraction`, which takes an injected `now` — the point is to close the open
loop, not to action it. No timer, no session count, no streaks; that is the analytics and
gamification line the MVP draws.

**There is exactly one focus session, and the store owns it.** `ClaroState.activeFocusSessionId`
is a single pointer into `focusSessions`, so a second live timer has nowhere to exist. No component
holds timer state; every view reads the same session through `useClaro()` and writes through
`updateSession`, which keeps the "UI never touches storage" rule intact. `Today` and the focus
screen therefore cannot disagree about what is running.

**The timer stores timestamps, never a countdown.** A session records `startedAt`,
`segmentStartedAt` and `elapsedBeforeMs`; everything shown is derived by a pure function of
`(session, now)`. That is what makes it survive a refresh — reload, recompute, carry on — and
`settleSession` replays whatever happened while the tab was closed, including a return block that
ended and a main block that then ran out. It is idempotent and returns the same object when nothing
moved, so committing it on every tick is free.

**Being distracted costs nothing.** `markDistracted` freezes the block rather than letting it
drain, so an hour away leaves the same time on the clock. The five-minute return block is an
on-ramp, not a penalty, and it hands back to the remainder of the original block automatically.
Interruptions are logged privately — session id, timestamp, local date and IANA zone, an optional
reason, whether the return block was taken, and whether and when the user came back — and are
**never** surfaced as a count, a streak or a dashboard. The record exists to be understood later,
not to be scored.

**A finished timer is not finished work.** The end of a block offers Complete priority, Continue,
or Back to Today, and nothing completes a priority except that explicit tap. Auto-completion would
make the app lie about what was actually done.

**Pausing and being distracted are different states, and only one is logged.** `pauseSession`
freezes the block exactly as `markDistracted` does, but sets the `paused` phase and writes nothing
to the interruption log — pausing to answer the door is not behavioural data, and recording it
would make the log useless. `endBlockNow` stops a block early and goes straight to the end choices,
keeping the time actually spent. Both are reachable during the return block too, so the five
minutes can never become a dead end.

**Elapsed time is read from the session when the clock is off.** `useNow` returns `null` in every
non-counting state, so any display that derives from `now` alone resets to zero the instant a block
is paused. `mainElapsedMs` falls back to `elapsedBeforeMs`, which is exact while paused — this is
why the progress bar and the remaining time hold steady instead of snapping to empty.

**Today has exactly one focus control.** A single line above the priorities reads "Start focus"
when nothing is running and "Resume focus" — with the phase and the time left — when something is.
There is no second button in the Priorities header and no session history on the screen: the point
is one way in, not a dashboard.

**Parking a thought and admitting a distraction are different actions.** Parking appends a
`quickTick` and leaves the clock running; being distracted stops the clock and opens the
interruption flow. Collapsing the two would force a person to interrupt themselves in order to
write something down.

**Editing is inline everywhere.** Tap text and it becomes an input. There is no modal, no dialog
primitive, and no `@radix-ui/react-dialog` dependency — better for a daily planner, and it avoids
focus-trap/portal SSR concerns.

## Design system

`src/styles.css` is the only stylesheet and holds every token. The palette is **ported verbatim
from claro-your-voice-of-clarity.vercel.app**, which is the visual source of truth for both
surfaces — warm cream parchment `hsl(30 30% 96%)`, ink `hsl(30 18% 9%)`, and a single **Claro
amber** `hsl(22 73% 67%)` carrying `--primary`, `--gold` and `--ring`. `--positive`
(`hsl(152 55% 42%)`) is for completion only. `--radius` is `1rem`.

Two values deliberately differ from the reference, both for contrast, and both should stay:

- **Primary buttons use ink on amber** (`--primary-foreground: hsl(30 18% 9%)`, 7.9:1). The
  reference's near-white on amber is 2.3:1 and fails AA.
- **`--muted-foreground` is `hsl(28 8% 42%)`**, not the reference's `28 6% 47%` — same hue, 4.7:1
  instead of 3.9:1, which matters because we use it at 11px.

Type is three families: **Instrument Serif** (`--font-display`) for what should dominate — quests,
goals, dates, priorities, the timer; **Inter** (`--font-sans`) for all UI, with `tabular-nums` on
every number; and **Caveat** (`--font-hand`, the `.hand` utility) for margin notes only. Nothing
load-bearing is ever set in the hand font.

### Surfaces carry the journal feel, in three weights

| Utility | Where | What it is |
| --- | --- | --- |
| `.paper-page` | **Focus only** | Ruled lines every 28px over a warm gradient, layered shadow, 14px radius. The heaviest treatment in the app. |
| `.surface` / `.surface-raised` | **Today** | Warm paper, hairline border, one soft shadow. `-raised` is Main Quest, Priority 1, and the running block. |
| `.paper-panel` | **Dense content** | Warm paper *without* rules — the schedule, action lists, the check-in grid. |
| `.surface-quiet` | **Week and Quarter** | Flat card, no shadow — scanning matters more than texture up the hierarchy. |
| `.spread` / `.spread-page` | **Today** | One notebook opened flat: a single sheet carrying two pages either side of a central gutter, from `lg` up. Below that it is one stacked page and the gutter simply isn't drawn. |

Today is a **double-page spread** from `lg` up, and it is sized to **one screen**: the outer
column is `h-[calc(100vh-14.5rem)]`, which is the header, main padding and footer measured rather
than guessed. Four columns, as on the paper planner it is modelled on:

**The day's three priorities run across the top of the sheet**, in a full-width `.spread-band`
above both pages — they are what the rest of the page is in service of. Below that,
`.spread-pages` is the two-page grid: **left** carries Schedule, Check-in and Notes; **right**
carries the three action buckets and Habits.

A live focus session gets a calm full-width strip *above* the spread. `AppShell` takes a `wide`
prop that opens header, main and footer to `.page-wide` together.

**Text wraps; it is never clipped.** List rows use `EditableText`'s `wrap` mode — a one-line
textarea that grows, because an `<input>` cannot wrap at any width. Enter still commits. Do not
reach for `truncate` on anything a user wrote.

**Goal context appears exactly once.** A native `<select>` always renders its chosen option's
text, so showing the tag *and* the select printed the Main Quest twice on one line. The tag is
the visible control; the real select sits transparently over it.

**Density is the whole design here, and it is fragile.** Some notes for anyone changing it:

- `EditableText` bakes in `py-1.5`. Across eighteen schedule rows that alone is ~100px, so the
  spread's fields override it (`py-0`, `py-0.5`). Check the total, not the row.
- A priority's goal link sits *inline* with its text, wrapping only when the text is long.
  Giving it a row of its own cost three rows of page height for no information.
- Don't set `min-h-[...]` on the outer column above what the height cap allows — a floor taller
  than the cap silently wins and pushes the whole document into a scroll.
- The action columns carry `lg:min-h-[8.5rem]`. Without a floor, a day carrying a review queue
  collapses them to zero and their headings overlap what follows.
- `.spread-page` scrolls internally from `lg` up. Flex children shrink to their min-content long
  before that engages, so an ordinary day never scrolls anywhere; it exists to keep an unusually
  full day inside the notebook rather than pushing the document down.
- `.scroll-pane` bounds a list that can grow without limit, and **only from `lg` up** — a phone
  must never nest a scroll region inside a scroll region. Never put it on the schedule: that grid
  is a fixed 18 rows, so a cap there only produces a half-row cut that reads as broken.

Measure before tuning. `document.querySelector(".spread-page").scrollHeight` against its
`clientHeight` tells you immediately whether a page overflows, and by how much.

**Ruled lines are opt-in and deliberate.** `.rule-lines` (and the rules baked into
`.paper-page`) belong only on roomy *writing* surfaces — the focus card and Today's notes, where
the notes textarea is set to `leading-[28px]` so the text sits on the rules. Never put them behind
the schedule, the check-in grid, an action list or any form: at those densities the lines fight
the rows and cost readability. Dense content gets `.paper-panel` instead.

Other utilities: `.eyebrow` (micro-label; it sets `font-family` explicitly because these are often
`<h2>` and the base layer sets headings to the display serif), `.field-plain`, `.strike-done`,
`.ink-highlight`, `.hand`.

### Buttons are four utilities, never hand-rolled

`.btn` owns shape, padding and transition; `.btn-primary` (amber gradient), `.btn-quiet`
(bordered card), `.btn-ghost` (text only), `.btn-sm` and `.btn-icon` compose on top. There
are **zero** literal `rounded-md px-… py-…` button strings left in the codebase — if you find
yourself writing one, add a modifier instead.

**Use `.btn-icon` for square icon buttons — never `p-0`.** Utility order inside
`@layer utilities` is not guaranteed, so `p-0` can lose to `.btn`'s own padding; when it does, a
32px button has zero content width and its icon collapses to nothing. That shipped once already.

The rest of the shared vocabulary: `.display` (the serif face — there are no inline
`font-[family-name:…]` strings left), `.nav-link` / `.nav-link-active`, `.field-select` /
`.field-select-active`, `.card-dashed`, `.skeleton` (paper-toned loading, never grey), and the
toast classNames wired in `__root.tsx` so notifications are paper too.

**Hierarchy is enforced by size and weight, not colour**: Main Quest ≫ Side Quest, Priority ≫
Task, Weekly Goal ≫ Supporting Action. When adding UI, place it in that ladder rather than
reaching for a new colour. The `.dark` token block tracks the reference's dark palette but no
toggle ships.

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

AI/LLM features, voice, audio briefings, music, analytics and insight dashboards, calendar
integration, notifications, social, teams, accountability partners, leaderboards, **streaks**,
subscriptions, payments, gamification, affirmation cards, and food, supplement or exercise
guidance. The
MVP is about getting one loop right: **Quarter → Week → Day → Complete → Reflect.**

Habits *are* in, but only as a Monday–Sunday grid with plain counts ("4 days this week"). There is
no streak, no "best run", and nothing a missed day can take away. The single celebration is a
confetti burst when every habit for the day is ticked — fired on the transition only, never on
arriving at an already-complete day, and silent under `prefers-reduced-motion`.

Focus deliberately stops short of the obvious additions: no session history UI, no interruption
counts, no "focus time today". The data is recorded; the scoring is not.

## Carry-forward: the rollover rule

**This reverses an earlier decision.** Claro used to state that unfinished work is *never* copied
forward automatically. It now is — but under rules chosen so it still cannot become a guilt
ledger. `src/lib/rollover.ts` holds all of it, pure and `now`-injected.

- **A day becomes eligible at 22:00 in the user's own local time.** `rolloverAt` builds that
  moment from local date parts rather than adding 22 hours to midnight, so it is still 10 PM on a
  daylight-saving day.
- **It is applied when Claro is next opened, not on a schedule.** The browser is usually shut at
  10 PM, so "next open" is the only moment that can be relied on. `ClaroProvider` runs it in the
  load effect and again on the minute tick, for a tab left open overnight.
- **Work lands on the first day that has not passed its own 10 PM** — today before 10 PM,
  tomorrow after it. Working late must never clear the page still being worked on.
- **Nothing is carried twice.** The source item records `carriedTo`, and the destination refuses
  any id it already holds. `applyRollover` is idempotent by object identity: a second run returns
  the very same state object, which is what makes it safe on every open and every tick.
- **Nothing is overwritten.** A carried priority fills a slot only if that slot is still blank.
  Anything else — an overflow priority, any unfinished action — waits in the day's
  `carriedForward` queue with four choices: promote it into a priority, keep it as an action,
  schedule it for another day, or let it go.
- **The source day keeps its own record.** Carrying copies the work forward and notes where it
  went; it does not rewrite what yesterday looked like.
- **`ROLLOVER_LOOKBACK_DAYS` is 7.** Coming back after a fortnight away must not empty a fortnight
  onto today. Older days keep their record, they just stop chasing you.

The load-time carry is written to disk immediately, bypassing the save effect's
"skip the first populated snapshot" rule. Without that, the source is never marked as carried and
a decision made in the review area is undone by the next reload.
