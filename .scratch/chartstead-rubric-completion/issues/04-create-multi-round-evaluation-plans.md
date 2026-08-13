# 04 — Create multi-round evaluation plans

**Status:** done

**Blocked by:** None — can start immediately.

## What to build

Introduce an optional advanced evaluation plan that can contain two or more named review rounds with independent dates, scorecard references, anonymization settings, and reviewer pools. Preserve the existing shared track queue as the lightweight default rather than forcing every event into advanced review configuration.

## User stories covered

- Rubric criteria ABS-01 and ABS-02.

## Acceptance criteria

- [x] An organizer can create, rename, order, open, close, and persist multiple review rounds for an event.
- [x] Every round owns its own date window, reviewer pool, scorecard reference, and anonymization setting.
- [x] Reviewer membership in one round does not implicitly grant access to another round.
- [x] Events without an advanced plan continue using the existing track-scoped shared queue unchanged.
- [x] Round state and access are event-scoped, auditable, and available through the authenticated API.
- [x] Tests cover configuration persistence, round isolation, date enforcement, role authorization, and lightweight-mode compatibility.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-12 — Created as an opt-in expansion so the existing trusted-committee workflow remains intact.
- 2026-08-12 — Started in isolated worktree for optional multi-round evaluation plans and review.
- 2026-08-12 — Ready for QA: organizers configure ordered, event-scoped rounds in Settings; reviewer API access enforces round pool, open state, and date window. Focused worker coverage and typecheck pass; build passes with the existing large-chunk warning. The broad UI suite has two unrelated submissions-shell mock failures.
- 2026-08-12 — Completion pass verified the existing implementation without further function edits: evaluation-plan plus adjacent review worker tests pass (13/13), focused Settings UI tests pass (4/4), and `npm run typecheck` passes. Frontier dry-run/apply completed; Rubrics 05 and 06 correctly remain blocked pending Rubric 04 QA.
- 2026-08-12 — Human review explicitly waived by Tyler. Integrated self-verification passed: typecheck, full UI suite (140/140), and full worker suite (265/265); moved to done.
