---
name: ios-release
description: Ship a TrailMate iOS release — version/build bump rules, Xcode archive flow, App Store Connect checklist, review notes and their inviolables. Use for any TestFlight/App Store submission, upload error (90062/90186), or App Store Connect question.
---

# iOS release runbook discipline

CLAUDE.md → *Update / new-release process* and *App Store submission state* are the
source of truth; keep the submission-state section updated as releases move.

## Version & build rules (the upload errors decoded)

- **ASC closes a version's train the moment it's released.** Error `90186`
  ("train closed") + `90062` ("must be higher than previously approved") after an
  approval simply mean: bump the version. This is *good news* — it proves approval.
- A bump touches **four places** (all must agree):
  1. `ios/TrailMate.xcodeproj/project.pbxproj` → `MARKETING_VERSION` (×2 configs)
  2. `project.pbxproj` → `CURRENT_PROJECT_VERSION` (×2 configs)
  3. `ios/TrailMate/Info.plist` → `CFBundleShortVersionString` (hardcoded here)
  4. `app.json` → `version` (consistency; EAS reads it)
- Build number strictly increases across **every** upload. Don't mix EAS
  auto-increment with manual Xcode numbering in one cycle (collisions).

## Build & upload

- **No OTA.** Every change — even one JS line — needs archive → upload → review.
  Commit first; a fix landed after the archive is NOT in the archive: re-archive.
- Xcode path: destination *Any iOS Device (arm64)* → Product → Archive →
  Distribute App → App Store Connect → Upload. Gotchas already solved: paid team
  (not Personal), `ENABLE_USER_SCRIPT_SANDBOXING = NO`, the hermes-dSYM upload
  warning is harmless.
- Export compliance is pre-answered (`ITSAppUsesNonExemptEncryption: false`).

## App Store Connect checklist (the two everyone forgets are ★)

1. Create/open the new version on the Distribution tab.
2. ★ **Attach the build** (Build section → select the processed build).
3. **What's New** — required for updates; lead with the headline feature.
4. Screenshots/promo text/description as needed (promo text is review-free).
5. ★ **App Review Information**: demo account + accurate notes (below).
6. Version release setting → usually "Automatically release after review".
7. Save → Add for Review → Submit.

## Review notes — must match the binary

Review notes that contradict what the reviewer sees cause rejections. Current
standing content (update when reality changes, never let it drift):
- **Demo account `hearthhub075@gmail.com`** + password. The password is already
  stored in ASC → App Review Information and is deliberately not in this repo —
  **never reset or rotate it** (that would lock out every future re-review); if
  the value is ever needed, ask the user. The account must exist, stay onboarded,
  and keep joinable content.
- **Background location**: the run recorder (Discover → Routes → Record) is the
  visible user benefit; user taps Start, blue indicator shows, stops on Finish.
- **Payments**: tickets are real-world goods via Stripe — not IAP, Guideline
  3.1.3(e); card **and Apple Pay** (enabled + verified 2026-07-09 — never reuse
  the old "Apple Pay NOT enabled / card-only" wording). Live mode means reviewers
  can't use test cards; offer a 100%-off promo code via Resolution Center if asked.
- Information-Needed follow-ups are answered in Resolution Center — no new build.

## Inviolables (breaking these fails a review or loses data)

- **Never delete or wipe the demo account** — Apple re-reviews every update with it.
- **Never wipe imported events / seed data while a build is in review** — Discover
  must stay populated for the reviewer. Cleanups wait for Approved + backup first.
- App is Free, UK-only, 16+; reviewers may test on iPad even though
  `supportsTablet` is false — the centred max-width column handles it.
