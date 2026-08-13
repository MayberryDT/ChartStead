# 06 — Assign submissions and distribute review work

**Status:** done

**Blocked by:** Rubric 04 — assignments must be scoped to a review round.

## What to build

Add exact submission-to-reviewer assignments inside advanced review rounds plus scalable organizer controls for track-filtered bulk assignment, balanced distribution, or reviewer caps. Assigned reviewer queues must contain exactly the submissions granted for that round.

## User stories covered

- Rubric criteria ABS-05 and ABS-06.

## Acceptance criteria

- [x] An organizer can assign and unassign specific submissions to a reviewer within one round.
- [x] The reviewer queue contains exactly that reviewer's active-round assignments and no unassigned submissions.
- [x] At least one scalable operation distributes a filtered set across reviewers or enforces per-reviewer caps.
- [x] Bulk operations preview counts and assignments before applying and are idempotent on retry.
- [x] The existing shared track queue remains available when advanced assignments are not enabled.
- [x] Tests cover exact queue isolation, bulk distribution, caps or balancing, round changes, and organizer/reviewer authorization.

## Blocked by

- Rubric 04 — Create multi-round evaluation plans.

## Comments

- 2026-08-12 — Created as advanced-mode functionality; it must not silently replace ChartStead's existing track queue.

- 2026-08-13 — frontier-reconcile: Still blocked on: Rubric 04 (in-review).

### 2026-08-12 agent update

Tyler explicitly authorized clearing all remaining non-human-tandem tickets; moved from `blocked` to `in-progress` for active implementation in the main checkout.

### 2026-08-13 implementation update

Implemented exact round submission assignments with worker storage, organizer assignment/distribution APIs, reviewer queue filtering, and organizer UI controls. Added capped/balanced distribution preview/apply coverage and moved to `in-review` for human QA.

### 2026-08-13 closeout update

Focused worker verification passed and Tyler waived human review; moved from `in-review` to `done`.
