# 07 — Airtable consequence effects

**What to build:** Course Check evidence and recovery for consequential Airtable writes while ordinary mapped synchronization remains useful and an unavailable Airtable connection cannot stop unrelated event work.

**Blocked by:** 02 — Batch decisions and shared workspace; 06 — Program Publication Course Check; Competition 10 — Airtable mapping and authenticated HTTP foundation.

**Status:** in-review

- [x] Decision, communication, and publication plans show exact mapped Airtable creates or updates before integration approval.
- [x] `Write to Airtable` remains a separate stage that can be removed, deferred, or executed after valid internal work.
- [x] Internal state, integration intent, audit history, and stable effect identity commit atomically before network delivery.
- [x] Each Airtable write has independent pending, attempting, succeeded, retryable failure, permanent failure, unknown, and compensated state.
- [x] Unconfigured, unavailable, rate-limited, or unauthorized Airtable leaves ordinary application work and unrelated Course Check stages usable.
- [x] Stable ChartStead identifiers, explicit field mapping, and provider record references make retries idempotent.
- [x] Ordinary mapped inbound fields may apply immediately with audit history and existing pull precedence.
- [x] Inbound mappings that would alter final outcomes, communication, public state, or consequential cascades create Course Check or are rejected from automatic mapping.
- [x] Unknown write outcomes require reconciliation before another duplicate-prone attempt.
- [x] Corrective integration writes create reviewed compensation linked to the original effect.
- [x] Tests cover mapping evidence, deferred sync, degraded state, rate limiting, retries, unknown reconciliation, pull classification, redaction, compensation, and continued core operation.

## Comments

Blocked by Course Check 02 — Batch decisions and shared workspace, Course Check 06 — Program Publication Course Check, and Competition Ticket 10 — Airtable mapping and authenticated HTTP foundation.

- 2026-08-11 — frontier-reconcile: All blockers done → ready-for-agent.
- 2026-08-11 — Claimed for implementation on branch `course-check-07-airtable-effects` in a dedicated worktree.
- 2026-08-11 — Ready for human QA on `http://100.105.117.93:5187/e/pacific-open-data-summit-2026/submissions`. Test exact Airtable previews, internal apply before integration, Write/Defer/Remove actions, degraded unconfigured behavior, and reconciliation/compensation states.
- 2026-08-11 — Rebuilt the Course Check review surface after QA feedback: removed the accidental nested app grid, adopted the submissions visual language, and made evidence/Airtable effects collapsed by default with visible attention badges. Updated demo: `http://100.105.117.93:5187/e/pacific-open-data-summit-2026/course-checks/17b70e24-e991-40f8-98c6-2b8f162c993a`.
