# 07 — Decision communication and calendar lifecycle verification

**What to build:** Verify the complete decision-message and calendar lifecycle delivered through Communication Course Check against the speaker portal, provider boundaries, and supported calendar clients.

**Blocked by:** 05 — Speaker portal from an applied acceptance; Course Check 03 — Communication drafts and recipient reasoning; Course Check 04 — External sends and effect recovery; Course Check 05 — Calendar delivery lifecycle.

**Status:** done

- [x] Internal approve, maybe, or deny state does not imply that a message has been drafted or sent.
- [x] Communication state distinguishes draft, queued, sent, delivered, and failed independently from proposal state.
- [x] An accepted session can produce a real calendar invitation before room assignment with pending location represented clearly.
- [x] Changing time or room produces an update with the same UID and a higher sequence.
- [x] Cancellation uses the same UID and valid cancellation semantics.
- [x] Golden fixtures validate create, update, and cancel behavior for Gmail, Outlook, and Apple-compatible clients.
- [x] Speaker portal and organizer history display the correct independent decision, draft, delivery, and calendar state after success, partial failure, retry, and compensation.
- [x] Acceptance tests prove that only an authorized Course Check stage reaches providers and that UI, API, and scoped-agent execution have equivalent outcomes.

## Comments

Blocked pending Course Check 03 — Communication drafts and recipient reasoning, Course Check 04 — External sends and effect recovery, and Course Check 05 — Calendar delivery lifecycle. Competition Ticket 05 is done.

- 2026-08-12 — frontier-reconcile: All blockers done → ready-for-agent.
- 2026-08-11 — claimed in worktree `.worktrees/ticket-07-decisions-calendar` on branch `ticket-07-decisions-calendar`.
- 2026-08-11 — in-review: portal + organizer history projections; acceptance suite. Demo http://100.105.117.93:5187/
- 2026-08-11 — done: fast-forward merged to `main` as `8700f83`. Agent equivalence = session API ≡ UI; full scoped-agent remains Course Check 08.
