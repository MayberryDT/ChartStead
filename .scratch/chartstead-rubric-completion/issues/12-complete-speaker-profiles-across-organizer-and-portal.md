# 12 — Complete speaker profiles across organizer and portal

**Status:** done

**Blocked by:** None — can start immediately.

## What to build

Complete speaker profile editing on both sides: speakers can maintain biography, social links, and headshot in their scoped portal, while organizers can edit the same current-profile fields including headshot from the admin workspace. Event-time title and organization snapshots remain distinct.

## User stories covered

- Rubric criteria SPK-08 and CNT-10.

## Acceptance criteria

- [x] The speaker portal supports biography, documented social links, and constrained headshot upload or replacement.
- [x] Organizer speaker detail supports editing biography, social links, and headshot with equivalent validation.
- [x] Changes made through either authorized path appear in the other after reload.
- [x] Public program projections can consume approved current-profile photo and professional metadata without exposing private contact fields.
- [x] Event-time title and organization snapshots are not silently overwritten by current-profile edits.
- [x] Tests cover both roles, uploads, constraints, persistence, public projection, and event-history preservation.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-12 — Created to close the profile-field gap shared by speaker and content-management rubric areas.
- 2026-08-12 — Started in isolated worktree for organizer and portal profile parity implementation and review.
- 2026-08-12 — Ready for QA. Organizer and portal edits now share validated biography, HTTPS professional links, and constrained PNG/JPEG/WebP headshots; published program revisions expose only approved public profile fields and immutable headshot URLs while event-time title/organization snapshots remain unchanged. Verified 23 focused worker tests, 2 focused UI tests, typecheck, and diff-check. Demo: http://100.105.117.93:5204/e/pacific-open-data-summit-2026/speakers. Test organizer profile/link/headshot edits, portal parity after reload, and public program profile safety.
- 2026-08-12 — Human review explicitly waived by Tyler. Integrated self-verification passed: typecheck, full UI suite (140/140), and full worker suite (265/265); moved to done.
