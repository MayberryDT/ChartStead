# 04 — Shared track review queue

**What to build:** A conversational small-committee review workspace where reviewers see the shared submission queue for their assigned tracks, open stable proposal permalinks, leave committee notes, and change reversible internal decisions without contacting speakers.

**Blocked by:** 02 — First proposal end to end.

**Status:** done

- [x] An administrator can grant a reviewer responsibility for one or more tracks.
- [x] A reviewer sees all submissions in assigned tracks and no submissions outside those tracks.
- [x] An administrator retains event-wide submission visibility.
- [x] Every submission row and detail view resolves through its stable permalink.
- [x] The review workspace follows the locked submissions master-detail visual direction.
- [x] Reviewers can search, filter by status and track, sort, and preserve their list context while opening proposals.
- [x] Reviewers can read the full proposal and speaker context and add committee-only notes.
- [x] Reviewers can mark unreviewed, approve, maybe, or deny and later change that internal decision.
- [x] Changing a decision records an audit event and never queues or sends speaker email.
- [x] Speakers and unauthorized reviewers cannot read committee notes or internal decisions.
- [x] Acceptance tests cover track authorization, stable deep links, reversible decisions, audit history, and absence of implicit email.

## Comments

Implemented on `main` in `c116483` and verified with the full test suite.
