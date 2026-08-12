# 05 — Calendar delivery lifecycle

**What to build:** Course Check planning and effect recovery for real calendar invitation creation, schedule update, and cancellation while preserving one stable calendar identity and keeping private schedule edits immediate.

**Blocked by:** 04 — External sends and effect recovery; Competition 08 — Fluid agenda builder.

**Status:** in-progress

- [ ] Private schedule placement and movement remain immediate ordinary writes, including TBD and conflicting states.
- [ ] A Communication Course Check can plan calendar create, update, or cancel delivery for affected session participants.
- [ ] Calendar evidence shows exact recipients, session delta, stable UID, next sequence, pending room/time state, and reversibility class.
- [ ] Calendar creation may proceed before room assignment with pending location represented honestly.
- [ ] Time or room changes prepare an update using the same UID and a higher sequence.
- [ ] Cancellation uses the same UID and valid cancellation semantics.
- [ ] Calendar delivery remains separately approved from decision application and public-program release.
- [ ] Every recipient operation has independent effect, attempt, provider, failure, unknown, retry, and compensation state.
- [ ] A corrective update or cancellation is a new reviewed compensation rather than history mutation.
- [ ] Golden fixtures validate create, update, and cancel output for Gmail, Outlook, and Apple-compatible clients.
- [ ] Tests cover direct invite, TBD location, reschedule, cancellation, duplicate-request prevention, partial recipient failure, unknown reconciliation, and stable identity through public rollback.

## Comments

Blocked by Course Check 04 — External sends and effect recovery. Competition Ticket 08 is done.

- 2026-08-12 — frontier-reconcile: All blockers done → ready-for-agent.
