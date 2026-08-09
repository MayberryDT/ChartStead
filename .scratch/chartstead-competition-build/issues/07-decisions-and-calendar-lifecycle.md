# 07 — Explicit decisions and calendar lifecycle

**What to build:** Deliberate speaker decision communication and real calendar invitations whose state remains independent from internal review and whose stable identity survives schedule changes and cancellation.

**Blocked by:** 05 — Acceptance cascade and speaker portal.

**Status:** ready-for-agent

- [ ] An administrator can prepare acceptance and denial messages from current proposal and speaker context.
- [ ] Internal approve, maybe, or deny state does not imply that a message has been drafted or sent.
- [ ] An administrator can review and explicitly send a decision message.
- [ ] Communication state distinguishes draft, queued, sent, delivered, and failed independently from proposal state.
- [ ] A failed send retains content and provider context and can be retried idempotently.
- [ ] The interface supports deliberate batch release once individual sends work reliably.
- [ ] An accepted session can produce a real calendar invitation before room assignment with pending location represented clearly.
- [ ] Changing time or room produces an update with the same UID and a higher sequence.
- [ ] Cancellation uses the same UID and valid cancellation semantics.
- [ ] Golden fixtures validate create, update, and cancel behavior for Gmail, Outlook, and Apple-compatible clients.
- [ ] Acceptance tests prove that changing internal decisions sends nothing and that only explicit sends reach the provider boundary.

## Comments
