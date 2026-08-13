# 14 — Version deliverables and support file comments

**Status:** done

**Blocked by:** Rubric 13 — organizer-visible deliverable identity and access must exist first.

## What to build

Turn task attachment replacement into an explicit immutable version history and let organizers and the owning speaker discuss a particular uploaded version through attributed, timestamped comments. The latest version must be obvious while previous versions remain accessible.

## User stories covered

- Rubric criteria CNT-04 and CNT-05.

## Acceptance criteria

- [x] Every replacement creates a new immutable file version rather than overwriting the prior record.
- [x] Organizer and speaker views clearly identify the latest version and list previous versions with file metadata and timestamps.
- [x] Authorized users can download accessible historical versions without changing which version is current.
- [x] Organizer and owning speaker can add comments attached to a specific deliverable version.
- [x] Comments display author identity, role, and timestamp and obey speaker/event access boundaries.
- [x] Tests cover replacement history, latest selection, historical access, comments across roles, and unauthorized access.

## Blocked by

- Rubric 13 — Inspect and download speaker deliverables.

## Comments

- 2026-08-12 — Initial blocker recorded; immutable asset records should remain compatible with existing R2 cleanup rules.

- 2026-08-13 — frontier-reconcile: Still blocked on: Rubric 13 (in-review).

### 2026-08-12 agent update

Tyler explicitly authorized clearing all remaining non-human-tandem tickets; moved from `blocked` to `in-progress` for active implementation in the main checkout.

### 2026-08-13 implementation update

Implemented immutable deliverable version projection for portal task assets, historical version downloads for organizers and owning speakers, per-version attributed comments for organizer/speaker roles, and UI version/comment display in portal and onboarding deliverable views. Focused verification: `npx vitest run --config vitest.worker.config.ts test/worker/onboarding.test.ts`.
