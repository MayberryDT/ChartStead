# 07 — Decision communication and calendar integration verification

**What to build:** Verify the complete decision-message and calendar lifecycle delivered through Communication Course Check against the speaker portal, provider boundaries, and supported calendar clients.

**Blocked by:** 05 — Speaker portal from an applied acceptance; Course Check 03 — Communication drafts and recipient reasoning; Course Check 04 — External sends and effect recovery; Course Check 05 — Calendar delivery lifecycle.

**Status:** blocked

- [ ] Internal approve, maybe, or deny state does not imply that a message has been drafted or sent.
- [ ] Communication state distinguishes draft, queued, sent, delivered, and failed independently from proposal state.
- [ ] An accepted session can produce a real calendar invitation before room assignment with pending location represented clearly.
- [ ] Changing time or room produces an update with the same UID and a higher sequence.
- [ ] Cancellation uses the same UID and valid cancellation semantics.
- [ ] Golden fixtures validate create, update, and cancel behavior for Gmail, Outlook, and Apple-compatible clients.
- [ ] Speaker portal and organizer history display the correct independent decision, draft, delivery, and calendar state after success, partial failure, retry, and compensation.
- [ ] Acceptance tests prove that only an authorized Course Check stage reaches providers and that UI, API, and scoped-agent execution have equivalent outcomes.

## Comments

Blocked pending Course Check 03 — Communication drafts and recipient reasoning, Course Check 04 — External sends and effect recovery, and Course Check 05 — Calendar delivery lifecycle. Competition Ticket 05 is done.

- 2026-08-12 — frontier-reconcile: Still blocked on: Course Check 05 (ready-for-agent).
