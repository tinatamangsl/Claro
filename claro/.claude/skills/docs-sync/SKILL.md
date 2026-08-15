---
name: docs-sync
description: After any project state change — a feature shipped, an invariant added, a root cause found, a design decision made or reversed, a dependency changed — sync claro/CLAUDE.md, the README and the persistent memory so the next session starts from truth. Use at the end of every task that changed state, before the final message.
---

# Docs & memory sync

The next session starts from `claro/CLAUDE.md`. If state changed and the docs didn't, the
next session works from a stale world — that is how a dead suspect gets re-chased and how
a deliberate decision gets "fixed" by someone who didn't know it was deliberate.

## What triggers a sync

- A feature shipped, or an existing behaviour changed
- A new rule was discovered whose violation breaks the app (that's an **invariant**)
- A root cause was found, or a suspect was killed
- A design or product decision was made, reversed, or reconsidered
- A dependency was added, removed or pinned, or a script/command changed
- Something in the docs turned out to be wrong

## Where things go

**`claro/CLAUDE.md`** — the operational truth. Match the fact to the right section rather
than appending to the end:

| What you learned | Section |
| --- | --- |
| A rule whose violation breaks the app | *Invariants — breaking these breaks the app* (numbered; add a test that protects it) |
| Why something is built the way it is | *Design decisions and why* — always with the reasoning, never just the rule |
| A new test pattern or coverage requirement | *Testing is part of the feature* |
| A token, utility or visual rule | *Design system* |
| A changed command, script or environment fact | *Commands* |
| Something newly ruled in or out of the MVP | *Out of scope for the MVP* |

**`claro/README.md`** — only when the *setup or usage* story changes (prerequisites,
install steps, ports, what a new person needs to run it). It is written for a human
arriving cold; keep it free of internal rationale.

**The memory directory** —
`/Users/tinatamang/.claude/projects/-Users-tinatamang-Documents-GitHub-Claro/memory/`.
One file per topic; **update the matching existing file rather than creating a
duplicate** — list the directory first. Frontmatter shape:

```markdown
---
name: short-kebab-slug
description: One-line summary used to decide recall relevance.
metadata:
  pinned: false
---
```

Memory is for durable lessons that would change behaviour in a *future* session —
standing preferences the user stated, corrections they made. Code facts belong in
CLAUDE.md, not memory; CLAUDE.md is read every session and can't drift out of sync with
the code the way a private note can.

## Rules that keep the record trustworthy

- **Rewrite disproven claims in place.** Never append a correction below a stale claim and
  leave both standing — a future reader has no way to tell which one won. Delete what is
  now false.
- **Absolute dates only** ("2026-08-15", never "today" or "last week").
- **Record what was verified versus what is assumed**, and by what command. A future
  session must be able to tell the difference.
- **Keep the "why" attached to the "what".** The value of CLAUDE.md's decisions section is
  the reasoning; a rule with no rationale gets overturned by the next person who finds it
  inconvenient.
- Prune as well as add. The file earns its length by being read in full every session.

## Then say so

Mention the doc update in the final message — one line naming the file and what changed,
so the user can disagree with the record while it's still fresh. Commit only if asked.
