---
name: design-system
description: Claro's visual and interaction language — the paper/ink/one-accent palette and where gold is allowed, the two type families, the .surface/.eyebrow/.field-plain utilities, hierarchy by size not colour, inline editing with no modals, and the product copy voice including cap messages. Use for any UI, styling, layout, icon or user-facing copy work, and before adding anything to src/styles.css.
---

# Claro's design language

Claro is a calm, editorial daily planner. The stated bar is that it **must not look like
Jira, Trello, or a Bootstrap CRUD admin** — if a change moves it toward any of those, it's
wrong regardless of how conventional it is.

`src/styles.css` is the **only** stylesheet and holds every token. Tailwind v4 is
CSS-first here; there is no `tailwind.config.js` to edit.

## Colour: paper, ink, and one accent

Warm near-white background, near-black ink, `--primary` a deep ink-indigo. Two colours are
rationed and adding a third accent is a design decision, not a detail:

- **`--gold` is reserved exclusively for Main Quest and Priority 1 marks.** Nothing else
  may use it. It is what makes those two things read as the top of the hierarchy.
- **`--positive` is for completion only.** Not for success toasts, not for "good" numbers.

`--radius` is `0.5rem` — tight and editorial, never pill-shaped. The `.dark` token block
exists and is maintained, but **no theme toggle ships**; don't build one unasked.

Use the semantic tokens (`bg-background`, `text-muted-foreground`, `border-border`,
`bg-gold`) rather than raw values, and add new tokens to `styles.css` instead of inlining
a one-off colour in a component.

## Type: two families, and numbers are tabular

- **Instrument Serif** (`--font-display`) for the things that should dominate: quests,
  goals, dates, priorities. The base layer already applies it to headings.
- **Inter** (`--font-sans`) for all UI.
- `tabular-nums` on every number, so figures don't jitter as they change.

## The utilities, and what each one means

| Utility | Use it for |
| --- | --- |
| `.surface` | The calm default card — white, hairline border, **no shadow**. |
| `.surface-raised` | One soft shadow. **Main Quest and Priority 1 only.** |
| `.eyebrow` | The uppercase micro-label. Sets `font-family` explicitly on purpose — these are often `<h2>`, which the base layer would otherwise render in the display serif. |
| `.field-plain` | A field that looks like plain text until you touch it: transparent, borderless, with a faint hover tint and a primary-tinted focus. |
| `.strike-done` | Completed items — a thin, low-contrast strikethrough, not a colour change. |

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
