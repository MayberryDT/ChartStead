# 04 — External sends and effect recovery

**What to build:** Explicit Course Check send execution with one durable effect per deliverable address, truthful partial outcomes, bounded retry, unknown-outcome reconciliation, and reviewed corrective communication.

**Blocked by:** 03 — Communication drafts and recipient reasoning.

**Status:** done

- [x] `Send messages` approves and begins delivery of the exact frozen Communication Course Check version.
- [x] Internal send intent, audit history, idempotency receipts, and address-level outbox effects commit atomically before network delivery.
- [x] Each deliverable address has stable effect identity, frozen payload identity, provider reference, attempts, last error, and next eligible retry.
- [x] Delivery continues durably after browser navigation, Worker eviction, or alarm replay.
- [x] Successful effects never repeat when the stage, alarm, API request, or manual retry is replayed.
- [x] Classified transient failures retry with bounded backoff; permanent recipient, authorization, and payload failures surface immediately.
- [x] Exhausted retries remain durable failures with a manual recovery action.
- [x] Ambiguous provider outcomes become `Needs attention` and cannot retry blindly.
- [x] Provider webhook or staff reconciliation can resolve an unknown effect before retry or compensation.
- [x] Batch status distinguishes In progress, Partially complete, Needs attention, and Complete from address-level truth.
- [x] A sent message cannot be undone; correction creates a linked compensating Communication Course Check with a reason and original-effect reference.
- [x] Staff can leave and return to exact live effect state through the shared workspace and event activity history.
- [x] Tests cover provider idempotency, at-least-once alarms, crash windows, partial failure, retry classification, unknown reconciliation, permanent failure, correction compensation, and no green batch optimism.

## Comments

Blocked by Course Check 03 — Communication drafts and recipient reasoning.

- 2026-08-11 — frontier-reconcile: All blockers done → ready-for-agent.
- 2026-08-11 — Claimed for implementation in a dedicated worktree. Course Check 03 is done; both ticket tracks were rescanned and no additional blocked ticket has all blockers cleared.
- 2026-08-11 — Ready for human QA. Demo: `http://100.105.117.93:5184/e/pacific-open-data-summit-2026/course-checks/522609a7-f75a-4923-844a-d6e211cca491`. Verify exact frozen send intent, address-level state after reload, truthful failure/recovery controls, and linked correction creation. Automated evidence: typecheck/build, 123 worker tests, 61 UI tests, and 5 E2E tests pass.
- 2026-08-11 — Merged locally to `main` as `23f5092`; post-merge full suite passed and the ticket is complete.
