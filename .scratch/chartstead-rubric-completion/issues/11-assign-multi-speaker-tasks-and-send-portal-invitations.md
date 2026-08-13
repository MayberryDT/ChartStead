# 11 — Assign multi-speaker tasks and send portal invitations

**Status:** done

**Blocked by:** None — can start immediately.

## What to build

Let organizers create one general onboarding task for multiple selected speakers and send each selected speaker a personalized portal invitation through the existing auditable communication path. Task assignment and invitation delivery must remain separate, inspectable effects.

## User stories covered

- Rubric criteria SPK-05 and SPK-06.

## Acceptance criteria

- [x] An organizer can select multiple speakers and assign one task definition with instructions and a due date.
- [x] Each speaker receives an independent task record that can complete without changing another speaker's task.
- [x] Organizers can select speakers and prepare personalized portal-invitation messages containing valid scoped access links.
- [x] Invitation Course Check and delivery history report recipient-specific queued, sent, delivered, failed, and retry states.
- [x] Repeating either operation is idempotent or requires an explicit duplicate action.
- [x] Tests cover multi-assignment, portal scoping, personalization, delivery states, retry, and event isolation.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-12 — Created to complete the invitation lifecycle while retaining Course Check authority over external sends.
- 2026-08-12 — Started in isolated worktree for multi-speaker tasks and portal invitation implementation and review.
- 2026-08-12 — Ready for QA at `http://100.105.117.93:5203/e/pacific-open-data-summit-2026/speakers`: select multiple speakers in Assign task, verify independent tasks, then use Messages to prepare a personalized portal invitation and inspect its separate Course Check delivery history.
- 2026-08-12 — Verification: Rubric 11 focused worker tests plus onboarding, communication, and delivery suites passed (27/27); typecheck and `git diff --check` passed. Broad `test/ui/app.test.tsx` had 30/32 pass with two unrelated pre-existing Submissions shell assertion failures.
- 2026-08-12 — Human review explicitly waived by Tyler. Integrated self-verification passed: typecheck, full UI suite (140/140), and full worker suite (265/265); moved to done.
