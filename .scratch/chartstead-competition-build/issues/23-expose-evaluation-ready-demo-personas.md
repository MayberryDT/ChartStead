# 23 — Expose evaluation-ready demo personas

**Status:** blocked

**Blocked by:** 22 — Invite reviewers into track-scoped queues.

## What to build

Make the isolated demo deployment prove ChartStead's existing multi-role spine without requiring a real inbox or undocumented route guessing. An evaluator should be able to enter clearly labeled organizer, reviewer, and signed-link speaker journeys backed by realistic seeded records while production remains fully protected from every demo-only access mechanism.

## User stories covered

- Competition build stories 2, 17–23, 30–34, and 55–56.

## Acceptance criteria

- [ ] The demo entrypoint clearly offers organizer, track-reviewer, and accepted-speaker journeys with a short explanation of each role.
- [ ] Reviewer entry opens a seeded, track-scoped shared queue and supports a persistent approve, maybe, or deny decision plus committee note.
- [ ] Speaker entry opens a valid signed portal containing only that speaker's profile, sessions, tasks, uploads, and communication state.
- [ ] Each journey starts from deterministic seeded data or an explicit safe reset and can be repeated without accumulating misleading duplicates.
- [ ] Demo role switching never leaks administrator authority, committee notes, another speaker's data, signing secrets, or reusable production credentials.
- [ ] The production Worker contains no demo-principal or demo-persona bypass, verified at the deployed-equivalent boundary.
- [ ] The competition walkthrough and end-to-end tests cover all three entrypoints and their principal role assertions.

## Blocked by

- 22 — Invite reviewers into track-scoped queues.

## Comments

- 2026-08-12 — Created blocked on Competition 22 so the demo proves the same reviewer invitation and authorization path that production uses.


- 2026-08-12 — frontier-reconcile: Still blocked on: Competition 22 (in-progress).
