# 09 — Team policy, privacy, and durable operations

**What to build:** Production-grade shared Course Check operation with optional stronger approvals, role-aware evidence, privacy-preserving history, background completion, and accessible recovery across supported organizer widths.

**Blocked by:** 02 — Batch decisions and shared workspace; 04 — External sends and effect recovery; 06 — Program Publication Course Check; 08 — Complete agent API control.

**Status:** in-review

- [x] Event policy can require two-person approval, separate roles, mandatory reasons, or stricter agent controls without weakening baseline protections.
- [x] Authorized administrators and agents see complete evidence; reviewers see only assigned-track decision evidence; speakers and public users see no internal plans.
- [x] Shared activity distinguishes requester, reviewer, approving actor, executing actor, agent provenance, attempts, outcomes, and compensation.
- [x] Plan and audit storage excludes credentials, signed links, and unnecessary private payloads.
- [x] Privacy erasure redacts personal plan/message payloads while preserving stable operational references, authorization, outcome, and compensation history.
- [x] Background execution resumes after navigation, alarm replay, or Worker eviction and updates the shared workspace durably.
- [x] In-app activity and status badges surface Complete, Partially complete, and Needs attention without implicit speaker-facing notification.
- [x] Linked decision, communication, publication, integration, and compensation plans remain navigable as one operation history without sharing approval.
- [x] The workspace remains keyboard-operable and screen-reader legible, including evidence disclosures, stage controls, warning reasons, effect states, and live progress.
- [x] Desktop remains the organizer priority while mobile supports status inspection, warning review, and recovery without clipped evidence or controls.
- [x] Performance checks keep ordinary writes independent of external services and Course Check planning bounded against realistic seeded event volume.
- [x] Security and privacy tests cover role projection, stricter policy, dual approval, agent scopes, redaction, erasure, concurrent actors, and malicious plan/effect access.

## Comments

Blocked by Course Check 02 — Batch decisions and shared workspace, Course Check 04 — External sends and effect recovery, Course Check 06 — Program Publication Course Check, and Course Check 08 — Complete agent API control.

- 2026-08-12 — frontier-reconcile: All blockers done → ready-for-agent.
- 2026-08-12 — claimed by agent; worktree `.worktrees/course-check-09-team-policy`, branch `course-check-09-team-policy`.
- 2026-08-12 — implementation complete → **in-review**. Demo `http://100.105.117.93:5190/`. Delivered: event Course Check policy (two-person, distinct approver, mandatory reason, max agent mode), role/track projection, activity model, privacy erasure API, storage secret scrub, Airtable alarm resume hook, linked operation history + a11y open defaults, Settings policy card, `test/worker/course-check-policy-privacy.test.ts` (10).
