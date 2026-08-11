# 02 — Batch decisions and shared workspace

**What to build:** A shared, resumable Course Check workspace where authorized event staff can review, revise, defer, and apply realistic batches of final proposal outcomes without silently changing the approved scope.

**Blocked by:** 01 — Single Decision Course Check tracer.

**Status:** ready-for-agent

- [ ] An administrator can create one Decision Course Check from selected proposals with accepted or declined final outcomes.
- [ ] The workspace presents irreversible effects, people, public consequences, operational warnings, integration effects, and internal details in the locked evidence order.
- [ ] Clean low-risk sections collapse while blockers, warnings, exclusions, and unknowns expand automatically.
- [ ] Course Checks are shared event resources that another authorized administrator can inspect and continue.
- [ ] Every plan mutation records its actor and creates a new immutable version rather than overwriting reviewed evidence.
- [ ] Relevant changes mark only dependent stages `Out of date`; unrelated event edits do not invalidate the plan.
- [ ] Old unchanged external stages receive an event-configurable age warning with a 24-hour default and remain executable after a fresh revision/authority check.
- [ ] Staff can resolve a blocked item or explicitly defer it into a follow-up queue.
- [ ] Deferral produces a new exact plan version, leaves earlier evidence in history, and never applies a different selection under an old approval.
- [ ] The remaining batch applies atomically even when external follow-up will happen later.
- [ ] Soft-warning overrides remain reason-free for private/internal work and require a short reason at material external boundaries.
- [ ] Realistic event-scale batches remain one reviewed scope while execution can split into linked exact plans when a documented safe limit is exceeded.
- [ ] User-facing states include Draft, Needs review, Ready, In progress, Partially complete, Needs attention, Complete, Superseded, and Out of date.
- [ ] Tests cover concurrent administrators, immutable versions, stage-scoped invalidation, deferral, warning reasons, batch splitting, age warnings, and exact aggregate progress.
