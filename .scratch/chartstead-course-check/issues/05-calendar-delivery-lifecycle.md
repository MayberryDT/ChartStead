# 05 — Calendar delivery lifecycle

**What to build:** Course Check planning and effect recovery for real calendar invitation creation, schedule update, and cancellation while preserving one stable calendar identity and keeping private schedule edits immediate.

**Blocked by:** 04 — External sends and effect recovery; Competition 08 — Fluid agenda builder.

**Status:** done

- [x] Private schedule placement and movement remain immediate ordinary writes, including TBD and conflicting states.
- [x] A Communication Course Check can plan calendar create, update, or cancel delivery for affected session participants.
- [x] Calendar evidence shows exact recipients, session delta, stable UID, next sequence, pending room/time state, and reversibility class.
- [x] Calendar creation may proceed before room assignment with pending location represented honestly.
- [x] Time or room changes prepare an update using the same UID and a higher sequence.
- [x] Cancellation uses the same UID and valid cancellation semantics.
- [x] Calendar delivery remains separately approved from decision application and public-program release.
- [x] Every recipient operation has independent effect, attempt, provider, failure, unknown, retry, and compensation state.
- [x] A corrective update or cancellation is a new reviewed compensation rather than history mutation.
- [x] Golden fixtures validate create, update, and cancel output for Gmail, Outlook, and Apple-compatible clients.
- [x] Tests cover direct invite, TBD location, reschedule, cancellation, duplicate-request prevention, partial recipient failure, unknown reconciliation, and stable identity through public rollback.

## Comments

Blocked by Course Check 04 — External sends and effect recovery. Competition Ticket 08 is done.

- 2026-08-12 — frontier-reconcile: All blockers done → ready-for-agent.
- 2026-08-11 — in-progress: claimed in worktree `course-check-05-calendar-delivery`.
- 2026-08-11 — in-review: calendar create/update/cancel delivery with stable UID lifecycle, frozen ICS, per-recipient effects, compensation. Demo http://100.105.117.93:5185/e/pacific-open-data-summit-2026/agenda — commit `975128d`.
- 2026-08-11 — done: human QA ok; merged to main. Demo remains on 5185.
