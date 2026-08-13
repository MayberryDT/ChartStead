# 02 — Add submitter accounts and a proposal dashboard

**Status:** done

**Blocked by:** None — can start immediately.

## What to build

Add an optional authenticated submitter workspace alongside ChartStead's existing accountless signed-link flow. A submitter can create or reuse an identity, submit proposals, see confirmation, and return to a personal event-scoped dashboard showing every proposal and its current submitted, under-review, accepted, or rejected state.

## User stories covered

- Rubric criteria CFP-05 and CFP-13.

## Acceptance criteria

- [x] A logged-out CFP visitor can create or sign into a submitter account without receiving organizer or reviewer capabilities.
- [x] A proposal submitted through the authenticated path appears in that submitter's dashboard with a truthful status.
- [x] Accept and reject decisions propagate to the correct dashboard proposal without exposing committee-only notes.
- [x] Existing accountless submission and signed edit links continue to work and can be safely claimed by the matching submitter identity.
- [x] Submitters cannot view another person's proposals or cross into another event's records.
- [x] Browser and worker tests cover signup/sign-in, submission, dashboard listing, decision propagation, claiming, and access isolation.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-12 — Created as an additive compatibility path; the low-friction accountless CFP remains a supported ChartStead workflow.
- 2026-08-12 — Started in isolated worktree for authenticated submitter workspace implementation and review.
- 2026-08-12 — Ready for human QA. Demo: http://100.105.117.93:5183/e/pacific-open-data-summit-2026/my-proposals. Test: request a submitter magic link; submit while signed in; verify dashboard status after review and final accept/reject; claim an older accountless proposal with the matching email; confirm other accounts and events remain isolated.
- 2026-08-12 — Human review explicitly waived by Tyler. Integrated self-verification passed: typecheck, full UI suite (140/140), and full worker suite (265/265); moved to done.
