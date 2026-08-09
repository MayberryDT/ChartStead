# 05 — Acceptance cascade and speaker portal

**What to build:** An idempotent acceptance action that turns an approved proposal into durable speaker, historical event-participation, session, and onboarding-task records, then gives the speaker a secure portal showing the resulting work.

**Blocked by:** 03 — Guided CFP publishing and submitter follow-up; 04 — Shared track review queue.

**Status:** ready-for-agent

- [ ] An administrator can explicitly accept a proposal without sending the acceptance letter yet.
- [ ] Acceptance creates or reuses the current speaker identity and preserves event-time title and organization on participation.
- [ ] Acceptance creates one session and the event's configured default onboarding tasks.
- [ ] Retrying acceptance cannot duplicate speakers, participation records, sessions, or tasks.
- [ ] Co-speakers receive distinct identities, participation records, and appropriate portal access.
- [ ] An administrator can create a direct session for a guaranteed speaker without a proposal.
- [ ] A speaker can open a secure signed portal and see the relevant proposal, acceptance state, session, profile, tasks, and deadlines.
- [ ] The portal clearly distinguishes current profile information from event-specific participation information where needed.
- [ ] Revoked or expired portal links fail safely.
- [ ] Acceptance tests verify the full cascade, retry idempotency, direct-session entry, and speaker authorization.

## Comments
