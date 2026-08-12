# 23 — Course Check UX accessibility and volume hardening

**What to build:** Close the redesigned interaction with cross-action accessibility, realistic-volume, responsive, and regression hardening so every functional ticket is independently verifiable before optional human visual polish.

**Blocked by:** Course Check 19 — Truthful communication results and Outbox handoff; Course Check 20 — Shared approval, scoped freshness, and progressive disclosure; Course Check 21 — Unified publication and external-effect review; Course Check 22 — Course Check UX instrumentation and validation pack.

**Status:** done

## Source

`.research/chartstead-course-check-ux-research.md`, especially the complete agent implementation acceptance checklist and proposed success thresholds.

## Acceptance criteria

- [x] An automated acceptance matrix maps every checklist item in the research report to a passing test, an explicitly preserved kernel invariant, or a documented real-human validation item.
- [x] Keyboard-only users can enter review, filter issues, expand details, invoke inline actions, follow and return from deep repairs, approve permitted stages, and reach persistent results with logical focus order.
- [x] Severity, state, pending work, completion, and partial failure remain understandable without color and are announced without duplicate or disruptive live-region output.
- [x] Desktop review remains efficient at realistic event scale; mobile supports status, exception review, recovery, and safe stage actions without horizontal overflow or hidden consequences.
- [x] Large batches, linked split plans, repeated grouped findings, dense recipient sets, partial provider results, and long activity histories stay responsive and retain exact aggregate counts.
- [x] Clean actions do not regress into empty evidence ceremony, and exception-heavy actions never hide blockers or irreversible external effects behind default-collapsed disclosure.
- [x] End-to-end coverage proves the complete decision → draft → Outbox → send progression plus publication, calendar, Airtable, stale data, team approval, partial failure, retry, reconciliation, and compensation.
- [x] Existing API and scoped-agent parity remains intact; no presentation adapter becomes an alternate execution path or weakens idempotency, approval, audit, redaction, or external-effect boundaries.
- [x] The production build, typecheck, relevant unit and integration suites, browser suite, accessibility scan, and realistic-volume checks pass from the integrated main candidate.
- [x] The ticket handoff includes a Tailscale-reachable demo and a short what-to-test checklist suitable for the subsequent independent human-tandem visual-polish pass.

## Comments

- 2026-08-12 — Agent-owned hardening complete on integrated main candidate: executable 36-row research matrix plus separately labelled H1–H6 real-human rows; keyboard/focus and non-color semantics; exact 28-item split-volume and 120-entry history coverage; 390px containment and axe; complete decision → draft → Outbox → reason-required send journey; existing publication/calendar/Airtable/stale/approval/failure/retry/reconciliation/compensation and parity suites preserved. Verified UI 116/116, worker 238/238, browser 33/33, typecheck, and production build. Tyler explicitly waived demo, review agents, and human QA for this ticket, so no demo was started and H1–H6 remain truthfully unclaimed real-human validation work.

- 2026-08-12 — Final agent-owned functional closeout. Course Check 11 and 12 remain untouched, independent morning polish tickets and do not block completion.

- 2026-08-12 — frontier-reconcile: All blockers done → ready-for-agent.

- 2026-08-12 — Started from integrated main after Course Check 19 and 20 closed. Agent-owned accessibility, realistic-volume, responsive, traceability, and regression hardening are in scope; demos, review agents, and human QA remain deferred per Tyler's instruction.
