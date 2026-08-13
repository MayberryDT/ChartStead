# 18 — Harden agenda placement and add auto-place

**Status:** done

**Blocked by:** None — can start immediately.

## What to build

Reproduce and eliminate the live agenda-placement failure seen during evaluation, then add a deterministic one-action scheduling assistant that places eligible unplaced sessions into available day/time/room slots while surfacing rather than concealing conflicts and unresolved constraints.

## User stories covered

- Rubric criteria AIA-03 and AIA-08; regression protection for AIA-04 through AIA-07.

## Acceptance criteria

- [x] Manual placement persists reliably after reload in the seeded and evaluator-created event shapes.
- [x] Failed placement returns an actionable reason and cannot silently leave UI and server state inconsistent.
- [x] An organizer can run an auto-place preview for selected or all eligible unplaced sessions.
- [x] The preview explains proposed slots, unplaced leftovers, and any conflicts or assumptions before apply.
- [x] Applying the exact preview is version-checked, idempotent, auditable, and preserves manual placements unless explicitly included.
- [x] Tests cover the evaluator regression, manual placement, deterministic auto-placement, no-capacity cases, conflict behavior, stale previews, reload persistence, and publication compatibility.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-12 — Created from the strict rubric gap and the completed run's failed live placement scenario.
- 2026-08-12 — Started in isolated worktree for agenda placement hardening and deterministic auto-place implementation and review.

### 2026-08-12 agent update

Moved to `in-review` after integration into the main checkout. Focused verification passed:

- `npm run typecheck`
- `npm run test:ui -- test/ui/organizer-shell.test.tsx test/ui/cfp-runtime.test.tsx test/ui/submitter-dashboard.test.tsx test/ui/settings-airtable.test.tsx test/ui/speaker-directory.test.tsx test/ui/onboarding-file-constraints.test.ts test/ui/agenda.test.tsx test/ui/agenda-auto-place.test.ts test/ui/public-program.test.tsx test/ui/public-program-helpers.test.ts`
- `npm run test:worker -- test/worker/submitter-dashboard.test.ts test/worker/evaluation-plans.test.ts test/worker/speaker-directory.test.ts test/worker/speaker-csv-import.test.ts test/worker/rubric-11-multi-speaker-invitations.test.ts test/worker/onboarding.test.ts test/worker/session-content.test.ts test/worker/course-check-publication.test.ts test/worker/agenda.test.ts test/worker/public-program.test.ts`
- `npm run test:worker -- test/worker/guided-cfp.test.ts`
- 2026-08-12 — Human review explicitly waived by Tyler. Integrated self-verification passed: typecheck, full UI suite (140/140), and full worker suite (265/265); moved to done.
