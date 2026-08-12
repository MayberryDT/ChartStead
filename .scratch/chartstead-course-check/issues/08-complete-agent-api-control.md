# 08 — Complete agent API control

**What to build:** A versioned authenticated Course Check API through which scoped AI agents can operate every organizer capability, including plan creation, approval, execution, recovery, and compensation, without a privileged bypass.

**Blocked by:** 02 — Batch decisions and shared workspace; 04 — External sends and effect recovery; 05 — Calendar delivery lifecycle; 06 — Program Publication Course Check; 07 — Airtable consequence effects; Competition 10 — Authenticated HTTP foundation.

**Status:** ready-for-agent

- [ ] The `v1` contract exposes closed action types, stable event/entity/plan/stage/effect IDs, plan and state revisions, digest, findings, effects, approvals, receipts, and idempotency keys.
- [ ] API clients can create, inspect, revise, approve, execute, defer, retry, reconcile, and compensate every supported Course Check action.
- [ ] Organizer UI and API calls produce equivalent authorization, planning, application, effect, failure, and audit outcomes.
- [ ] Agents are distinct principals rather than silent human impersonations and may retain initiating-human request provenance.
- [ ] Agent scopes are granted per event and consequence stage for decisions, drafts, sends, calendars, publication, integrations, retries, reconciliation, and compensation.
- [ ] Administrators can grant all Course Check stages while the durable grant records the expanded individual scopes.
- [ ] Agent operating modes support propose-only, delegated execution, and explicitly granted autonomous policy execution.
- [ ] Connecting an agent grants no autonomous consequential authority by default.
- [ ] Scope revocation takes effect before the next stage execution, including plans approved earlier.
- [ ] AI-generated actions, selections, explanations, and rendered content freeze into an immutable plan before approval.
- [ ] Applying an approved plan performs no hidden model call and cannot reinterpret unknown action types heuristically.
- [ ] Event policy may tighten agent approval but cannot disable the baseline Course Check kernel.
- [ ] API documentation includes complete human and agent examples for each stage, out-of-date recovery, partial failure, unknown reconciliation, and compensation.
- [ ] Contract tests cover every scope/mode combination, all-scope grants, revocation, human/agent parity, provenance, idempotency, frozen AI output, unknown action rejection, and role-aware redaction.

## Comments

Blocked by Course Check 02, 04, 05, 06, and 07, plus Competition Ticket 10 — Airtable mapping and authenticated HTTP foundation.

- 2026-08-12 — frontier-reconcile: All blockers done → ready-for-agent.
