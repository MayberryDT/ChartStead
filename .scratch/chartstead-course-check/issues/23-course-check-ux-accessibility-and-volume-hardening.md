# 23 — Course Check UX accessibility and volume hardening

**What to build:** Close the redesigned interaction with cross-action accessibility, realistic-volume, responsive, and regression hardening so every functional ticket is independently verifiable before optional human visual polish.

**Blocked by:** Course Check 19 — Truthful communication results and Outbox handoff; Course Check 20 — Shared approval, scoped freshness, and progressive disclosure; Course Check 21 — Unified publication and external-effect review; Course Check 22 — Course Check UX instrumentation and validation pack.

**Status:** ready-for-agent

## Source

`.research/chartstead-course-check-ux-research.md`, especially the complete agent implementation acceptance checklist and proposed success thresholds.

## Acceptance criteria

- [ ] An automated acceptance matrix maps every checklist item in the research report to a passing test, an explicitly preserved kernel invariant, or a documented real-human validation item.
- [ ] Keyboard-only users can enter review, filter issues, expand details, invoke inline actions, follow and return from deep repairs, approve permitted stages, and reach persistent results with logical focus order.
- [ ] Severity, state, pending work, completion, and partial failure remain understandable without color and are announced without duplicate or disruptive live-region output.
- [ ] Desktop review remains efficient at realistic event scale; mobile supports status, exception review, recovery, and safe stage actions without horizontal overflow or hidden consequences.
- [ ] Large batches, linked split plans, repeated grouped findings, dense recipient sets, partial provider results, and long activity histories stay responsive and retain exact aggregate counts.
- [ ] Clean actions do not regress into empty evidence ceremony, and exception-heavy actions never hide blockers or irreversible external effects behind default-collapsed disclosure.
- [ ] End-to-end coverage proves the complete decision → draft → Outbox → send progression plus publication, calendar, Airtable, stale data, team approval, partial failure, retry, reconciliation, and compensation.
- [ ] Existing API and scoped-agent parity remains intact; no presentation adapter becomes an alternate execution path or weakens idempotency, approval, audit, redaction, or external-effect boundaries.
- [ ] The production build, typecheck, relevant unit and integration suites, browser suite, accessibility scan, and realistic-volume checks pass from the integrated main candidate.
- [ ] The ticket handoff includes a Tailscale-reachable demo and a short what-to-test checklist suitable for the subsequent independent human-tandem visual-polish pass.

## Comments

- 2026-08-12 — Final agent-owned functional closeout. Course Check 11 and 12 remain untouched, independent morning polish tickets and do not block completion.

- 2026-08-12 — frontier-reconcile: All blockers done → ready-for-agent.
