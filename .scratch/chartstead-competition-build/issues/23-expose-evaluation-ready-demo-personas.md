# 23 — Expose evaluation-ready demo personas

**Status:** done

**Blocked by:** 22 — Invite reviewers into track-scoped queues.

## What to build

Make the isolated demo deployment prove ChartStead's existing multi-role spine without requiring a real inbox or undocumented route guessing. An evaluator should be able to enter clearly labeled organizer, reviewer, and signed-link speaker journeys backed by realistic seeded records while production remains fully protected from every demo-only access mechanism.

## User stories covered

- Competition build stories 2, 17–23, 30–34, and 55–56.

## Acceptance criteria

- [x] The demo entrypoint clearly offers organizer, track-reviewer, and accepted-speaker journeys with a short explanation of each role.
- [x] Reviewer entry opens a seeded, track-scoped shared queue and supports a persistent approve, maybe, or deny decision plus committee note.
- [x] Speaker entry opens a valid signed portal containing only that speaker's profile, sessions, tasks, uploads, and communication state.
- [x] Each journey starts from deterministic seeded data or an explicit safe reset and can be repeated without accumulating misleading duplicates.
- [x] Demo role switching never leaks administrator authority, committee notes, another speaker's data, signing secrets, or reusable production credentials.
- [x] The production Worker contains no demo-principal or demo-persona bypass, verified at the deployed-equivalent boundary.
- [x] The competition walkthrough and end-to-end tests cover all three entrypoints and their principal role assertions.

## Blocked by

- 22 — Invite reviewers into track-scoped queues.

## Comments

- 2026-08-12 — Created blocked on Competition 22 so the demo proves the same reviewer invitation and authorization path that production uses.


- 2026-08-12 — frontier-reconcile: All blockers done → ready-for-agent.

- 2026-08-12 — Started immediately after Competition 22 integrated; demo startup and human QA remain deferred, but deterministic evaluator-entry implementation and automated browser coverage are in scope.

- 2026-08-12 — Implemented the isolated `/demo` evaluator entry with organizer, invitation-backed Platform reviewer, and Course-Check-backed signed speaker journeys. Safe reset restores only the named reviewer and speaker fixtures, including uploads, without accumulating review audit or duplicate identity/cascade records. Production isolation, focused Worker/UI contracts, full UI (93/93), full browser (24/24), typecheck, and build verified; the full Worker run passed 200/201 and hit the documented guided-CFP 5 s upload timeout, whose exact targeted case passed 1/1. Status intentionally remains `in-progress` for parent integration.

- 2026-08-12 — Parent-integration verification: rebased cleanly onto current `main` (`b49f740`) containing Competition 25/26 and Course Check 21, then passed typecheck, focused demo Worker isolation/persona tests (8/8), demo UI tests (2/2), and the evaluator browser journey (1/1). Marked `done` for parent integration; no demo server started intentionally and no merge performed.
