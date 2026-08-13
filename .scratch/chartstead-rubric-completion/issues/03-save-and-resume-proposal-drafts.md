# 03 — Save and resume proposal drafts

**Status:** done

**Blocked by:** Rubric 02 — submitter identity and dashboard ownership must exist first.

## What to build

Let authenticated submitters preserve incomplete proposals with as little as a title, find those drafts in their personal dashboard, and resume them later without weakening final-submission validation or the CFP open/close rules.

## User stories covered

- Rubric criterion CFP-07.

## Acceptance criteria

- [x] A submitter can save a draft when required final-submission fields are still empty.
- [x] The dashboard distinguishes drafts from submitted proposals and offers a clear resume action.
- [x] Draft answers, attachments, form-version identity, and conditional values survive reload and sign-in return.
- [x] Final submission applies the published form's complete validation and creates the normal confirmation and notification effects exactly once.
- [x] CFP closure prevents final submission while preserving readable draft data and truthful next-step guidance.
- [x] Tests cover minimal save, resume, edit, submit, form-version drift, closure, and ownership isolation.

## Blocked by

- Rubric 02 — Add submitter accounts and a proposal dashboard.

## Comments

- 2026-08-12 — Initial blocker recorded; frontier reconciliation should promote this ticket when Rubric 02 is done.

- 2026-08-13 — frontier-reconcile: Still blocked on: Rubric 02 (in-review).

### 2026-08-12 agent update

Tyler explicitly authorized clearing all remaining non-human-tandem tickets; moved from `blocked` to `in-progress` for active implementation in the main checkout.

### 2026-08-13 implementation update

Durable submitter draft storage is implemented in the event store and exposed through authenticated draft APIs. The CFP runtime can save/resume drafts without final validation, dashboard lists drafts separately with resume links, draft form-version drift and optimistic stale saves are surfaced, and final submission consumes a draft exactly once while still using published-form validation and CFP lifecycle checks. Focused worker/UI checks passed; user waived human review, so status moved to `done`.
