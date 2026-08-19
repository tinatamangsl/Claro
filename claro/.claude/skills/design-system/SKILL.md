---
name: design-system
description: Claro's visual and interaction language — the parchment/ink/Claro-amber palette ported from the reference site, the three type families, the three surface weights (.paper-page for Focus, .surface for Today, .surface-quiet for Week and Quarter), the four button utilities, hierarchy by size not colour, inline editing with no modals, and the product copy voice. Use for any UI, styling, layout, icon or user-facing copy work, and before adding anything to src/styles.css.
---

# Claro's design language

Claro is a calm, editorial daily planner. The stated bar is that it **must not look like
Jira, Trello, or a Bootstrap CRUD admin** — if a change moves it toward any of those, it's
wrong regardless of how conventional it is.

`src/styles.css` is the **only** stylesheet and holds every token. Tailwind v4 is
CSS-first here; there is no `tailwind.config.js` to edit.

## Colour: parchment, ink, and one amber

The palette is **ported verbatim from claro-your-voice-of-clarity.vercel.app**, the visual source
of truth. Warm cream parchment `hsl(30 30% 96%)`, ink `hsl(30 18% 9%)`, and a single **Claro
amber** `hsl(22 73% 67%)` that carries `--primary`, `--gold` and `--ring`. `--positive`
`hsl(152 55% 42%)` is for completion only — not for success toasts, not for "good" numbers.
`--radius` is `1rem`.

Two values deviate from the reference on purpose, for contrast, and must not be "corrected" back:
primary buttons use **ink on amber** (7.9:1, versus the reference's 2.3:1 near-white), and
`--muted-foreground` is `hsl(28 8% 42%)` (4.7:1) because we use it at 11px.

Use the semantic tokens (`bg-background`, `text-muted-foreground`, `border-border`, `bg-gold`)
rather than raw values, and add new tokens to `styles.css` instead of inlining a one-off colour.

## Type: three families, and numbers are tabular

- **Instrument Serif** (`--font-display`) for what should dominate: quests, goals, dates,
  priorities, the focus timer. The base layer already applies it to headings.
- **Inter** (`--font-sans`) for all UI.
- **Caveat** (`.hand`) for margin notes *only* — never for anything load-bearing, since a
  handwriting face is harder to read.
- `tabular-nums` on every number, so figures don't jitter as they change.

## Surfaces: three weights, matched to the screen

| Utility | Where | What it is |
| --- | --- | --- |
| `.paper-page` | **Focus only** | Ruled lines every 28px, warm gradient, layered shadow. The strongest journal treatment. |
| `.surface` / `.surface-raised` | **Today** | Warm paper with a hairline border. `-raised` is Main Quest, Priority 1, the running block. |
| `.paper-panel` | **Dense content** | Warm paper *without* rules — schedule, action lists, check-in grid. |
| `.surface-quiet` | **Week / Quarter** | Flat card, no shadow — lighter as you go up the hierarchy. |

Ruled lines (`.rule-lines`, and those baked into `.paper-page`) go **only** on roomy writing
surfaces — the focus card, Today's notes. Never behind a schedule, a grid, a list or a form; at
those densities they fight the rows. Dense content gets `.paper-panel`.

Also: `.eyebrow` (sets `font-family` explicitly on purpose — these are often `<h2>`, which the
base layer would render in the display serif), `.field-plain`, `.strike-done`, `.ink-highlight`.

## Buttons are four utilities — never hand-rolled

`.btn` owns shape, padding and transition. Compose `.btn-primary` (amber gradient), `.btn-quiet`
(bordered card), `.btn-ghost` (text only), `.btn-sm`, and `.btn-icon` for square icon buttons.
There are zero literal `rounded-md px-… py-…` button strings left; adding one back is a regression.

**Never reach for `p-0` to square off a button** — utility order inside `@layer utilities` is not
guaranteed, `.btn`'s padding can win, and a 32px button then has zero content width with an
invisible icon. Use `.btn-icon`. Also on the system: `.display`, `.nav-link`, `.field-select`,
`.card-dashed`, `.skeleton`.

## Hierarchy is enforced by size and weight, not colour

Main Quest ≫ Side Quest. Priority ≫ Task. Weekly Goal ≫ Supporting Action. When adding
UI, place it somewhere in that ladder rather than reaching for a new colour or a badge.
If two things look equally important, one of them is in the wrong place.

## Interaction: inline, never modal

**Editing is inline everywhere** — tap text and it becomes an input (`EditableText`,
`AddItem`, `.field-plain`). There is no modal, no dialog primitive, and no
`@radix-ui/react-dialog` dependency; that's better for a daily planner and it sidesteps
focus-trap and portal SSR concerns. Don't introduce one.

Other established behaviours worth matching: `AddItem` stays open after Enter so several
items can be added in a row, trims whitespace, ignores blank submissions, commits on blur
and abandons on Escape. Saving is autosave with a persistent **"All changes saved"**
indicator — the brief asked for a Save button, and a button was rejected because it
implies work could be lost.

Give every interactive element an accessible name (`aria-label="Schedule at 9 AM"`,
`aria-label="Previous day"`). Tests find elements by those names, so they are a contract,
not decoration.

## Icons

`lucide-react`, sized in `h-3 w-3` / `h-4 w-4` and given `aria-hidden` when decorative.
**No emoji as icons** — that is one of the things deliberately not inherited from
ExampleRepo, along with pill-everything, its `.paper-card` / `.pin-shadow` treatments, and
its warm terracotta/sage palette. Stock shadcn styling clashes with this language too,
which is why UI primitives here are hand-rolled.

## Copy voice

**No em dashes and no double hyphens in user-facing copy.** Use a comma, a colon or a full stop.
This covers visible text, placeholders, `aria-label`s, `<title>`s and empty states. Source
comments are exempt.

Short, plain, calm, and never scolding. The caps explain themselves rather than erroring:

> "Three is the limit — that's the point."
> "Three actions. Pick the ones that actually move it."

Empty states say what the space is for, in the product's own vocabulary (Direction /
Commitment / Execution; Main Quest, Side Quest, Non-negotiable, Quick Tick). Error copy
stays reassuring and factual — the error screen's "Your saved data is untouched." is the
register to match.

When adding user-facing text, write it in that voice rather than defaulting to generic
app copy, and put anything the user must read at a decision point in as few words as it
can honestly take.
