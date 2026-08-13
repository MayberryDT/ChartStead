# 08 — Track review progress and remind reviewers

**Status:** done

**Blocked by:** Rubric 05; Rubric 06 — progress requires scored reviews and exact assignments.

## What to build

Give organizers a round-aware progress workspace showing assigned, completed, and outstanding counts per reviewer, then let them select lagging reviewers and send an auditable bulk reminder through the existing communication boundary.

## User stories covered

- Rubric criteria ABS-08 and ABS-09.

## Acceptance criteria

- [x] Progress counts and percentages derive from the current round's assignments and completed reviews.
- [x] Counts update after review submission, reassignment, recusal, or round changes without manual repair.
- [x] Organizers can filter and select reviewers with outstanding work.
- [x] A bulk reminder previews recipients and pending counts, then reports queued, sent, failed, and retry states.
- [x] Reviewers never receive another reviewer's assignments or private progress details.
- [x] Tests cover live counts, recipient selection, delivery logging, retries, idempotency, and role authorization.

## Blocked by

- Rubric 05 — Build configurable weighted scorecards.
- Rubric 06 — Assign submissions and distribute review work.

## Comments

- 2026-08-12 — Initial blockers recorded; reminder delivery should reuse the established outbox rather than create a second mail path.

- 2026-08-13 — frontier-reconcile: Still blocked on: Rubric 05 (blocked); Rubric 06 (blocked).

### 2026-08-12 agent update

Tyler explicitly authorized clearing all remaining non-human-tandem tickets; moved from `blocked` to `in-progress` for active implementation in the main checkout.

### 2026-08-13 implementation update

Implemented round-aware review progress API and organizer UI, exact assignment + completed-review progress summaries, incomplete/overdue filtering, editable reviewer reminder drafts, outbox-backed queue/send/retry effects, and audit-backed reminder history. Focused worker coverage added in `test/worker/review-progress.test.ts`.
