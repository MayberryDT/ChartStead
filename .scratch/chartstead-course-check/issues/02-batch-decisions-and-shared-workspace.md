# 02 — Batch decisions and shared workspace

**What to build:** A shared, resumable Course Check workspace where authorized event staff can review, revise, defer, and apply realistic batches of final proposal outcomes without silently changing the approved scope.

**Blocked by:** 01 — Single Decision Course Check tracer.

**Status:** in-review

- [x] An administrator can create one Decision Course Check from selected proposals with accepted or declined final outcomes.
- [x] The workspace presents irreversible effects, people, public consequences, operational warnings, integration effects, and internal details in the locked evidence order.
- [x] Clean low-risk sections collapse while blockers, warnings, exclusions, and unknowns expand automatically.
- [x] Course Checks are shared event resources that another authorized administrator can inspect and continue.
- [x] Every plan mutation records its actor and creates a new immutable version rather than overwriting reviewed evidence.
- [x] Relevant changes mark only dependent stages `Out of date`; unrelated event edits do not invalidate the plan.
- [x] Old unchanged external stages receive an event-configurable age warning with a 24-hour default and remain executable after a fresh revision/authority check.
- [x] Staff can resolve a blocked item or explicitly defer it into a follow-up queue.
- [x] Deferral produces a new exact plan version, leaves earlier evidence in history, and never applies a different selection under an old approval.
- [x] The remaining batch applies atomically even when external follow-up will happen later.
- [x] Soft-warning overrides remain reason-free for private/internal work and require a short reason at material external boundaries.
- [x] Realistic event-scale batches remain one reviewed scope while execution can split into linked exact plans when a documented safe limit is exceeded.
- [x] User-facing states include Draft, Needs review, Ready, In progress, Partially complete, Needs attention, Complete, Superseded, and Out of date.
- [x] Tests cover concurrent administrators, immutable versions, stage-scoped invalidation, deferral, warning reasons, batch splitting, age warnings, and exact aggregate progress.

## Comments

- 2026-08-11: Implemented on branch `course-check-02-batch-workspace` (worktree `.worktrees/course-check-02-batch-workspace`). Ready for human QA.
- Demo: submissions multi-select → batch Course Check; open plan as shared workspace; defer blocked items; apply remaining.
