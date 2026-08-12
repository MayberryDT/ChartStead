# 20 — Shared approval, scoped freshness, and progressive disclosure

**What to build:** Carry the consolidated Course Check interaction through team approval, resumable operation, stage-scoped freshness, privacy boundaries, and technical evidence so simplification never hides authority or operational truth.

**Blocked by:** Course Check 17 — Direct repair actions and preserved review context; Course Check 18 — Connected decision-to-draft Course Check workspace.

**Status:** done

## Source

`.research/chartstead-course-check-ux-research.md`, especially rules 4, 9, and 10; sections 8.3–8.4 and 10; and the accessibility checklist, extended for the existing Course Check team-policy contract.

## Acceptance criteria

- [x] The connected review projection identifies the current stage's actor permissions, required endorsement count, distinct-approver rule, required override reason, and available commit without exposing inaccessible evidence.
- [x] A user who cannot execute a stage can still understand its business state and, where authorized, request or contribute the required approval.
- [x] Another authorized administrator can resume the same review with exact selection, plan version, completed stages, outstanding issues, and activity history.
- [x] Relevant changes invalidate only their dependency-safe stage scope; completed independent stages retain truthful results and do not visually revert to pending.
- [x] Stale or changed evidence states what changed, which stage needs review, what remains valid, and the exact next action.
- [x] Clean technical groups collapse or disappear from the ordinary path while warning, unknown, recovery, and policy-required evidence remains discoverable and appropriately expanded.
- [x] Audit IDs, source revisions, rule explanations, provider references, attempts, and compensation details are permission-gated under technical details rather than normal task language.
- [x] Severity uses text and icon in addition to color; live stage changes and background completion use accessible status announcements without focus theft.
- [x] Reviewer, administrator, scoped-agent, privacy-erasure, speaker, and public projections retain the existing redaction and authorization guarantees.
- [x] Tests cover self-approval, two-person approval, distinct approver, mandatory reason, revoked authority, shared resumption, stage-scoped invalidation, redaction, and accessible status changes.

## Comments

- 2026-08-12 — This ticket makes the research compatible with the already-shipped team-policy and durable-operation kernel (`sessions/2026/08/chartstead-course-check-09-team-policy`).

- 2026-08-12 — frontier-reconcile: All blockers done → ready-for-agent.

- 2026-08-12 — Started implementation after Tyler explicitly authorized Course Check 20; automated verification will replace demo, review, and human QA for this closeout.

- 2026-08-12 — Completed with a viewer-specific shared-approval projection, exact resumable/freshness context, permission-gated technical details, accessible status copy, and policy-aware decision actions. Tyler waived demo, review, and human QA; focused worker/UI/browser tests plus full automated suites, typecheck, and build were used for closeout.
