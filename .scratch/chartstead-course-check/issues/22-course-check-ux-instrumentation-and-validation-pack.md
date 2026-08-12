# 22 — Course Check UX instrumentation and validation pack

**What to build:** Add privacy-safe interaction instrumentation plus reproducible seeded task scenarios and an evaluator pack that measures whether the redesigned Course Check is understood and completed accurately without requiring production personal or message content.

**Blocked by:** Course Check 15 — Clean Decision Course Check fast path; Course Check 16 — Exception-first batches and partial processing; Course Check 18 — Connected decision-to-draft Course Check workspace; Course Check 21 — Unified publication and external-effect review.

**Status:** done

## Source

`.research/chartstead-course-check-ux-research.md`, especially migration step 7 and section 12.

## Acceptance criteria

- [x] Privacy-safe events capture time from batch action to commit, issues shown, fix versus exclusion versus acknowledgement, route changes, abandonment, stale rechecks, Outbox continuation, message correction, and post-action correction or compensation.
- [x] Instrumentation records stable action and issue classifications, counts, durations, and stage outcomes without message bodies, email addresses, speaker names, credentials, signed links, or other personal payloads.
- [x] Seeded scenarios cover a clean 20-item batch, one missing contact, shared-address and prior-message ambiguity, mixed eligible/skipped outcomes, relevant stale data, and post-completion outcome comprehension.
- [x] Browser task scripts exercise every seeded scenario and assert the observable product truth: decisions changed, records created, drafts present, items unchanged, and whether any external message was sent.
- [x] A concise evaluator guide contains the target participant profile, six task prompts, neutral observation questions, comprehension questions, success thresholds, and the report's kill conditions.
- [x] The pack clearly distinguishes automated behavioral verification from a future session with real representative administrators and never reports seeded or agent-run checks as human usability evidence.
- [x] An evidence export summarizes task duration, context changes, repair paths, errors, and final-state comprehension assertions without exposing private payloads.
- [x] Tests verify event emission, redaction, idempotent counting, abandoned journeys, resumed journeys, and instrumentation failure that never blocks Course Check operation.

## Comments

- 2026-08-12 — This ticket makes every overnight-verifiable part of the research validation plan agent-executable. Real participant observation remains a morning human activity, not a blocker in this ticket graph.

- 2026-08-12 — frontier-reconcile: All blockers done → ready-for-agent.

- 2026-08-12 — Started after Course Check 21 integrated; automated verification and a seeded evaluator pack are in scope, while demos, reviews, human QA, and claims of human usability evidence remain deferred per Tyler's instruction.

- 2026-08-12 — Completed privacy-safe allowlisted instrumentation, idempotent aggregate evidence export, six deterministic scenarios, browser task pack, and evaluator guide. Verified 97/97 UI, 214/214 Worker (one expected conflict exception logged by its owning test), focused browser 1/1, and production build/typecheck. Automated evidence remains explicitly separate from future representative-administrator usability evidence.
