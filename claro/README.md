# Claro

A clarity operating system for people running several lives at once — a career, a business, a
body, relationships, a creative practice.

Claro is not a task manager. It exists to answer one question — **what actually matters right
now?** — through a single hierarchy:

```
QUARTER   Direction     What matters this quarter?
   ↓
WEEK      Commitment    What needs to move forward this week?
   ↓
DAY       Execution     What deserves my attention today?
```

---

## Run it locally

### Prerequisites

- **Node.js ≥ 20.19** (developed on 24.14.1)
- **npm** (developed on 11.11.0)

Nothing else. No database, no Docker, no API keys, no `.env` file, no account.

### Setup

```bash
cd claro
npm install
npm run dev
```

Then open:

**http://localhost:8080**

That's the whole setup. `/` redirects to `/today`.

### Other commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with HMR on port 8080 |
| `npm run build` | Production build (`dist/client` + `dist/server`) |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |

If port 8080 is already taken, Vite falls forward to the next free port and prints it.

---

## How to use it

**Quarter** — Set one Work Main Quest and one Life Main Quest: the outcomes that would define
the quarter. Add up to three Side Quests under each. Three is a hard cap, deliberately.

**Week** — Your quarter's Main Quests are shown read-only at the top, so the week always
answers to something. Set a main Work goal and a main Personal goal, then name up to three
actions that will actually achieve each.

**Today** — The execution screen.

- **Today's Focus** — Priority 1 dominates the page. Priority 2 is optional. Either can be
  linked to this week's Work or Life goal, and the linked goal's text is echoed beneath it.
- **Schedule** — One line per hour, 5 AM to 10 PM. Type to block time, clear it to remove.
- **Actions** — Split by effort, not by project: Quick Ticks (under 5 min), Tasks (5–30 min),
  Projects & Focus Blocks (30 min +). The small dropdown on each row moves it between lists.
- **Non-Negotiables** — Up to three, kept visually apart from the task lists because they
  aren't productivity items.
- **Check-in** — Sleep, water, steps, mood (1–5). Deliberately shallow; the point is to
  eventually see how energy relates to execution, not to become a health app.
- **Notes** — Free text for the day.

Every screen has ← / → to move between periods, and a button back to the current one. The
period is in the URL (`/week?w=2026-W33`), so views are bookmarkable and back/forward work.

Nothing needs saving. Edits persist as you type, and the header shows the save state.

---

## How it's built

| Layer | Choice |
| --- | --- |
| Framework | TanStack Start v1 (SSR React) |
| UI | React 19 |
| Build | Vite 7 |
| Language | TypeScript 5.8, `strict` |
| Styling | Tailwind CSS v4, CSS-first (no `tailwind.config`) |
| Icons | lucide-react |
| Dates | date-fns v4 |
| Persistence | Browser `localStorage` |

```
src/
  routes/          __root, index (→ /today), today, week, quarter
  components/      AppShell, PeriodHeader, EditableText, ItemRow, AddItem, …
    today/         PrioritiesBlock, ScheduleBlock, ActionLists,
                   NonNegotiablesBlock, WellbeingBlock
  lib/
    types.ts       the domain model and its caps
    dates.ts       quarter / ISO-week / day ids, hierarchy resolution, navigation
    storage.ts     the ONLY module that touches localStorage
    claro-store.tsx  ClaroProvider + useClaro()
    mutations.ts   pure list helpers
  styles.css       every design token
```

Three details worth knowing if you extend it:

**`routeTree.gen.ts` is generated.** The TanStack Router plugin writes it on `vite dev`. Never
edit it by hand.

**Hydration is gated deliberately.** The server has no `localStorage`, so `ClaroProvider`
renders an empty store on the server *and* on the client's first render, then loads real data
in a mount effect. `AppShell` shows a skeleton until then. This is why the server HTML contains
only the shell — it makes a hydration mismatch structurally impossible. Reading `localStorage`
in a `useState` initialiser would break this.

**`new Date()` is called in exactly one place** — the provider's mount effect (plus its
midnight-rollover interval). Every helper in `dates.ts` takes an explicit date or id. Computing
"today" during render would disagree between the server's timezone and the browser's.

**Quarter/Week/Day records are created lazily.** Reading a period you've never visited returns
a blank; only an actual edit writes anything.

---

## Known limitations

- **Data lives in this browser, on this machine.** There's no account and no sync, so Claro
  won't follow you to another browser, another device, or a private window.
- **Clearing site data erases everything.** There is no export or backup yet.
- **Single user.** No auth, no sharing, no teams.
- **Two tabs open at once will overwrite each other** — the last write wins. There's no
  cross-tab merge.
- **Dark-mode tokens exist but no toggle ships.** The `.dark` palette is defined in
  `styles.css`; nothing applies the class yet.
- **The schedule is one row per hour** and holds one entry per slot. It is not a calendar and
  has no overlapping events, durations, or drag-and-drop.
- **No AI, analytics, reminders, notifications, or calendar integration** — all deliberately
  out of scope for this MVP.

### Moving off localStorage later

`src/lib/storage.ts` is the only module that touches the browser, and it exposes a small API
(`loadState`, `saveNow`, `scheduleSave`, `flushSave`). Swapping it for a networked adapter is
the whole of the change; the store, the views and the components don't know where data lives.
The payload carries a `version` field and `migrate()` is version-aware, so the shape can evolve
without stranding saved data.
