# 14 — Truthful decision review projection and receipts

**What to build:** Replace the internal-plan framing of Decision Course Check with an end-to-end review projection that describes the organizer's business action, pending consequences, permitted stage commit, and exact applied result while preserving the existing safety kernel and independently approved stages.

**Blocked by:** none

**Status:** in-progress

## Source

`.research/chartstead-course-check-ux-research.md`, especially the executive decision, state-language recommendations, presentation model, and migration step 1.

## Acceptance criteria

- [x] Decision Course Check presents an action-specific title such as **Review 24 acceptance decisions**; **Course Check** remains secondary explanatory language rather than the primary task or completion state.
- [x] The authenticated API supplies a stable review projection with selected, ready, needs-action, warning, and skipped counts; prioritized issues; effect groups; permitted stage commits; and source-freshness summary without replacing the existing plan model.
- [x] Proposed and applied states use distinct business language and treatment, including **Will accept**, **Accepted**, **Draft will be prepared**, **Draft prepared**, and **Unchanged** where applicable.
- [x] The primary decision action names the exact decision scope and effects instead of **Continue**, **Complete Course Check**, or **Apply plan**.
- [x] Before commit, the surface states that nothing has changed and no external communication has been sent.
- [x] After commit, a persistent result separately reports decisions, generated records, skipped or unchanged items, draft state, and external-send state; draft creation never implies delivery.
- [x] Plan IDs, digests, revisions, stage visibility, manifests, mutation terminology, and compensation primitives are absent from ordinary-admin copy and remain available only through appropriate details or audit surfaces.
- [x] Decision application, communication draft creation, sending, publication, and integration writes remain independently approved actions even when later tickets connect their presentation.
- [x] Role-aware permitted actions are derived from the same authoritative Course Check contract used by the organizer UI, API clients, and agents.
- [x] Contract, UI, and browser tests prove truthful wording before and after a single decision and a batch decision, including the explicit **No emails were sent** boundary.

## Comments

- 2026-08-12 — Created from the Course Check UX research. This agent-ready interaction-model foundation has no dependency on human-tandem visual polish tickets 11 or 12.
- 2026-08-12 — Started for the overnight non-human-tandem Course Check implementation run; automated verification remains required, while demos, review pauses, and human QA are deferred per Tyler's instruction.
- 2026-08-12 — Implemented the authenticated decision-review projection and organizer business-language surface for single/batch proposed and applied states. Verified with 86 Course Check worker tests, 74 UI tests (standalone rerun after concurrent-load timing failures), 16 browser tests, typecheck, build, and diff checks. No demo, QA request, main merge, or other ticket-status change was made.
