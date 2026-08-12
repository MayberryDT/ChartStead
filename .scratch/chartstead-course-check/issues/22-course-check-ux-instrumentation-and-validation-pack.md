# 22 — Course Check UX instrumentation and validation pack

**What to build:** Add privacy-safe interaction instrumentation plus reproducible seeded task scenarios and an evaluator pack that measures whether the redesigned Course Check is understood and completed accurately without requiring production personal or message content.

**Blocked by:** Course Check 15 — Clean Decision Course Check fast path; Course Check 16 — Exception-first batches and partial processing; Course Check 18 — Connected decision-to-draft Course Check workspace; Course Check 21 — Unified publication and external-effect review.

**Status:** blocked

## Source

`.research/chartstead-course-check-ux-research.md`, especially migration step 7 and section 12.

## Acceptance criteria

- [ ] Privacy-safe events capture time from batch action to commit, issues shown, fix versus exclusion versus acknowledgement, route changes, abandonment, stale rechecks, Outbox continuation, message correction, and post-action correction or compensation.
- [ ] Instrumentation records stable action and issue classifications, counts, durations, and stage outcomes without message bodies, email addresses, speaker names, credentials, signed links, or other personal payloads.
- [ ] Seeded scenarios cover a clean 20-item batch, one missing contact, shared-address and prior-message ambiguity, mixed eligible/skipped outcomes, relevant stale data, and post-completion outcome comprehension.
- [ ] Browser task scripts exercise every seeded scenario and assert the observable product truth: decisions changed, records created, drafts present, items unchanged, and whether any external message was sent.
- [ ] A concise evaluator guide contains the target participant profile, six task prompts, neutral observation questions, comprehension questions, success thresholds, and the report's kill conditions.
- [ ] The pack clearly distinguishes automated behavioral verification from a future session with real representative administrators and never reports seeded or agent-run checks as human usability evidence.
- [ ] An evidence export summarizes task duration, context changes, repair paths, errors, and final-state comprehension assertions without exposing private payloads.
- [ ] Tests verify event emission, redaction, idempotent counting, abandoned journeys, resumed journeys, and instrumentation failure that never blocks Course Check operation.

## Comments

- 2026-08-12 — This ticket makes every overnight-verifiable part of the research validation plan agent-executable. Real participant observation remains a morning human activity, not a blocker in this ticket graph.
