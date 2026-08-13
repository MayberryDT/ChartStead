# 15 — Add central content editing, approval, and history

**Status:** done

**Blocked by:** None — can start immediately.

## What to build

Give organizers a central session-content workspace where title, abstract, and public content can be edited, explicitly approved or returned for work, audited by version, and restored. Publication must exclude unapproved content while preserving private agenda work.

## User stories covered

- Rubric criteria CNT-09, CNT-11, and CNT-12.

## Acceptance criteria

- [x] An authorized organizer can edit a session title and abstract from a central admin surface and see the result after reload.
- [x] Each content-bearing session has an explicit review status such as draft, needs-changes, or approved.
- [x] Public-program planning excludes unapproved sessions and explains the exclusion without deleting private schedule placement.
- [x] Every content edit records the changed fields, editor, timestamp, and prior value in an accessible history.
- [x] An organizer can restore a prior content version, producing a new auditable version rather than erasing history.
- [x] Tests cover editing, status transitions, publication gating, history, restoration, authorization, and concurrent-version safety.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-12 — Created to add a distinct content-approval gate rather than treating proposal acceptance as public-content approval.
- 2026-08-12 — Started in isolated worktree for central content approval and history implementation and review.
- 2026-08-12 — Ready for human QA. The Agenda session inspector now edits title, abstract, and public copy; manages draft/needs-changes/approved status; exposes immutable version history and restore; and publication explains and excludes unapproved content without changing placement. Focused UI 4/4, Rubric 15 worker 1/1, publication regression 8/8, typecheck, and diff-check pass. Demo: http://100.105.117.93:5215/e/pacific-open-data-summit-2026/agenda. Test editing and reload, status changes, history restore, and unapproved publication exclusion.
- 2026-08-12 — Verified by VerifyRubric15 in clearance-rubric-15: focused worker tests 9/9, agenda UI test 4/4, typecheck, and diff-check pass; no ticket-scoped fixes needed.
- 2026-08-12 — Human review explicitly waived by Tyler. Integrated self-verification passed: typecheck, full UI suite (140/140), and full worker suite (265/265); moved to done.
