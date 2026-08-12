# 21 — Schedule and enforce CFP opening and closure

**Status:** in-progress

**Blocked by:** None — can start immediately.

## What to build

Complete the lifecycle of each submission form with organizer-controlled opening and closing behavior. The public CFP and signed submitter edit path must share one authoritative lifecycle so the displayed deadline, accepted writes, and organizer state cannot disagree.

## User stories covered

- Competition build stories 4, 10–12, 15, 54, and 56.

## Acceptance criteria

- [x] An administrator can configure an opening time and closing time for each form, using the event timezone with the resulting instant shown clearly.
- [x] The public CFP displays the relevant opening or closing state and deadline for the selected form.
- [x] Before opening, the form is read-only or unavailable for submission with a clear explanation of when it opens.
- [x] After closing, new submissions and signed-link edits are rejected by the server and the public UI explains that the call is closed.
- [x] An authorized administrator can deliberately reopen or close a form, and the resulting state survives reload.
- [x] Draft settings do not change the live form until the normal publish action succeeds.
- [x] Boundary-time, stale-client, and direct-HTTP tests prove that UI restrictions cannot be bypassed.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-12 — Started for agent implementation after Tyler authorized the incoming Competition Build frontier; demos, reviews, and human QA are deferred while automated acceptance verification remains required.
- 2026-08-12 — Implemented server-authoritative per-form scheduling in the event timezone, exact public deadlines, pre-open/post-close proposal and signed-edit enforcement, durable explicit close/reopen overrides, and draft/publish isolation. Focused lifecycle UI/worker/browser tests pass; full UI (105/105), worker (226/226), browser (30/30), typecheck, and build pass after rebasing through current main.
