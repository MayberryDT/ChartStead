# 04 — External sends and effect recovery

**What to build:** Explicit Course Check send execution with one durable effect per deliverable address, truthful partial outcomes, bounded retry, unknown-outcome reconciliation, and reviewed corrective communication.

**Blocked by:** 03 — Communication drafts and recipient reasoning.

**Status:** blocked

- [ ] `Send messages` approves and begins delivery of the exact frozen Communication Course Check version.
- [ ] Internal send intent, audit history, idempotency receipts, and address-level outbox effects commit atomically before network delivery.
- [ ] Each deliverable address has stable effect identity, frozen payload identity, provider reference, attempts, last error, and next eligible retry.
- [ ] Delivery continues durably after browser navigation, Worker eviction, or alarm replay.
- [ ] Successful effects never repeat when the stage, alarm, API request, or manual retry is replayed.
- [ ] Classified transient failures retry with bounded backoff; permanent recipient, authorization, and payload failures surface immediately.
- [ ] Exhausted retries remain durable failures with a manual recovery action.
- [ ] Ambiguous provider outcomes become `Needs attention` and cannot retry blindly.
- [ ] Provider webhook or staff reconciliation can resolve an unknown effect before retry or compensation.
- [ ] Batch status distinguishes In progress, Partially complete, Needs attention, and Complete from address-level truth.
- [ ] A sent message cannot be undone; correction creates a linked compensating Communication Course Check with a reason and original-effect reference.
- [ ] Staff can leave and return to exact live effect state through the shared workspace and event activity history.
- [ ] Tests cover provider idempotency, at-least-once alarms, crash windows, partial failure, retry classification, unknown reconciliation, permanent failure, correction compensation, and no green batch optimism.

## Comments

Blocked by Course Check 03 — Communication drafts and recipient reasoning.

- 2026-08-11 — frontier-reconcile: Still blocked on: Course Check 03 (in-review).
