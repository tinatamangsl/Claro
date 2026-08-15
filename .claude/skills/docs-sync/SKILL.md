---
name: docs-sync
description: After any project state change — a deploy, an App Store approval/submission, a root cause found, a feature shipped, a cert/credential created — sync CLAUDE.md and the persistent memory so the next session starts from truth. Use at the end of every task that changed state, before the final message.
---

# Docs & memory sync

The next session (any model) starts from CLAUDE.md + the memory index. If state
changed and the docs didn't, the next session works from a stale world — this is
how dead suspects get re-chased and closed trains get re-uploaded to.

## What triggers a sync

- Deployed anything (migration, edge function, web push, secrets)
- App Store state moved (uploaded, submitted, approved, rejected, train closed)
- A root cause was found or a suspect was killed
- A feature shipped or a directive was fulfilled
- A credential/cert/key was created (record its **expiry** + renew-before note)

## Where things go

- **CLAUDE.md** — the operational truth the next session must know: the
  *App Store submission state* section (versions, builds, review-note rules),
  feature sections, root causes with dates, runbook corrections. Keep it current
  the same day, not "later".
- **Memory directory** —
  `~/.claude/projects/-Users-SubasRW1-Documents-GitHub-trailMate/memory/` (the
  project cwd with slashes replaced by dashes). One file per fact; **update the
  matching existing file rather than creating a duplicate** (read `MEMORY.md`
  there first to find it). Frontmatter shape (copy an existing file like
  `ios-native.md`):

  ```markdown
  ---
  name: short-kebab-slug
  description: "One line used to decide recall relevance."
  metadata:
    node_type: memory
    type: project
  ---
  ```

  Keep the one-line `MEMORY.md` index entry in sync, including its **hook** — the
  trailing "Surface when asked …" phrase that determines when the memory gets
  recalled at all.
- **docs/** — SCALING.md-style deep docs only when the analysis itself is the
  deliverable.

## How to update (rules that keep the record trustworthy)

- **Rewrite disproven claims in place** — never append a correction below a stale
  claim and leave both standing (the "Stripe auto-manages certs" belief survived
  months that way). Delete what's now false.
- Mark fulfilled directives as done (✅ + date) instead of deleting them — the
  history explains why the code looks the way it does.
- Absolute dates only ("2026-07-09", never "today" / "last week").
- Record what was **verified** vs what is **assumed** — a future session must be
  able to tell the difference.
- Update descriptions/index hooks when a memory's headline changes (the index line
  is what gets a memory recalled at all).

## Then commit

Docs-only commits are cheap and the pre-commit hook skips jest for them. Use a
descriptive message ("docs: Apple Pay root cause — …") so `git log` itself reads
as a project timeline.
