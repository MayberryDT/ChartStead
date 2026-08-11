# 01 — Single Decision Course Check tracer

**What to build:** One complete Course Check path in which an administrator reviews and applies a final accepted or declined outcome for one proposal, with an idempotent acceptance cascade when accepted and no implicit communication.

**Blocked by:** Competition 03 — Guided CFP publishing and submitter follow-up; Competition 04 — Shared track review queue.

**Status:** ready-for-agent

- [ ] Reversible `unreviewed / approve / maybe / deny` review dispositions remain immediate ordinary writes and never open Course Check.
- [ ] An administrator can create a Decision Course Check for one final accepted or declined outcome through the organizer UI and authenticated HTTP API.
- [ ] The plan freezes the proposal, final outcome, relevant record revisions, exact before/after deltas, findings, stages, stable plan identity, version, and digest.
- [ ] An accepted outcome shows speaker identity creation or reuse, event-participation snapshots, co-speakers, one session, default onboarding tasks, and portal-access intent before application.
- [ ] A declined outcome changes final program state without creating accepted-speaker records or sending communication.
- [ ] Missing authority, relevant changed inputs, identity ambiguity, and durable-integrity violations block application with exact recovery guidance.
- [ ] Unplaced, TBD, readiness, and soft scheduling consequences remain warnings rather than blockers.
- [ ] `Apply decision` records approval of the exact plan version and atomically commits internal records, audit history, and idempotency receipt.
- [ ] Retrying plan creation or application with the same idempotency key returns the existing plan or receipt and never duplicates cascade records.
- [ ] Applying the decision creates no message, calendar, public-program, or integration delivery implicitly.
- [ ] Direct guaranteed-speaker creation uses the same compact Course Check when it creates or reuses speaker, participation, session, and task records.
- [ ] Tests prove HTTP/UI parity, ordinary-review speed, relevant-change rejection, transactional rollback, retry idempotency, role boundaries, and absence of implicit external effects.
