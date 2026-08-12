# 21 — Unified publication and external-effect review

**What to build:** Apply the same business-language, exception-first, directly actionable Course Check presentation to program publication, calendar delivery, Airtable writes, provider recovery, and compensation while preserving each action's independent approval and reversibility boundary.

**Blocked by:** Course Check 14 — Truthful decision review projection and receipts; Course Check 17 — Direct repair actions and preserved review context.

**Status:** done

## Source

`.research/chartstead-course-check-ux-research.md`, especially sections 5.4, 6, 8, 9, and 10, applied to every existing Course Check action family.

## Acceptance criteria

- [x] Publication review titles and primary actions name the attendee-facing release, affected session count, and exact publish, unpublish, or restore consequence.
- [x] Publication exceptions distinguish blocking public-data omissions from overridable conflicts, valid-subset exclusions, and informational TBD state with direct repair, exclude, or reasoned-override actions.
- [x] Calendar review describes exact create, update, and cancel operations in organizer language while keeping stable UID, sequence, and provider detail under permission-gated details.
- [x] Airtable review exposes exact records and mapped consequences, allows execute, defer, or remove where safe, and never blocks unrelated internal work because the integration is unavailable.
- [x] Delivery failure, unknown outcome, retry, reconciliation, and compensation each show the affected people or records, what already happened, what remains uncertain, and the only safe next actions.
- [x] Clean effect groups collapse or disappear; attention counts remain visible; complex recovery and irreversible external effects retain a full durable workspace.
- [x] Every action reports an exact persistent result and never collapses partial, pending, unknown, or compensated outcomes into **Done** or **Complete** without qualification.
- [x] Approval never transfers between decision, draft, send, calendar, publication, Airtable, or compensation stages even when the shared presentation connects them.
- [x] API and agent projections expose the same review labels, permitted actions, issue actions, and result truth as the organizer UI without requiring display-only fields to drive execution.
- [x] Contract, UI, worker, and browser tests cover clean and exception paths for publication, calendar, Airtable, failure recovery, and compensation.

## Comments

- 2026-08-12 — Can proceed after the shared projection and direct-action contracts; it is deliberately not blocked by visual-polish tickets 11 or 12.

- 2026-08-12 — frontier-reconcile: All blockers done → ready-for-agent.

- 2026-08-12 — Started after Course Check 17 integrated; automated verification remains required, with demos, reviews, and human QA deferred per Tyler's instruction.

- 2026-08-12 — Implemented the authenticated `externalReview` projection and organizer surface for publication, calendar follow-up, Airtable writes, delivery recovery, and corrections. Durable stage/digest/effect kernels remain authoritative, decision plans retain their existing `decisionReview`, and read-only projections omit mutating/provider details. Verification after rebasing over Competition 22/24/25/26: projection contract 5/5, focused UI 19/19, full UI 95/95, full worker 210/210, focused browser publication and decision-isolation paths pass, typecheck/build pass. A clean broad browser run reached 24/26: the only failures were existing shared-seed interdependence in an earlier decision walkthrough and the intermittently reproduced Agenda contrast defect; neither touches this ticket's code path. GBrain closeout: `sessions/2026/08/chartstead-course-check-21-external-effect-review`. Tyler explicitly deferred demos, reviews, and human QA, so the ticket is closed on automated acceptance evidence.
