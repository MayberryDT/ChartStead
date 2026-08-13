# 24 — Restore the persistent personal schedule

**Status:** done

**Priority:** P1

## What to build

Restore the attendee personal-schedule journey that Rubric 22 intended to deliver. Public session and itinerary cards must let a logged-out attendee add and remove sessions, open a My Schedule view containing exactly those selections, retain the selections after reload, and export the selected schedule without introducing an attendee account requirement.

## User stories covered

- Rubric criteria EMB-10 and EMB-11.

## Acceptance criteria

- [x] Public session and itinerary cards expose an accessible add/remove control with clear selected state.
- [x] My Schedule contains exactly the attendee's selected sessions and updates immediately after add or remove.
- [x] Selections persist across a full reload and remain isolated by event and publication identity.
- [x] The attendee can export one valid ICS containing exactly the selected sessions.
- [x] Empty, removed-session, and publication-revision changes behave truthfully without corrupting saved selections.
- [x] Focused UI tests and a fresh logged-out browser acceptance run prove add, remove, exact membership, persistence, and export on the competition demo.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-13 — Created from manual-audit finding EMB-10. Rubric 22 was marked done, but the live public renderer had no add, star, bookmark, or My Schedule control. This remediation ticket does not reopen or modify Rubric 22.
- 2026-08-13 — Claimed by orchestrator for parallel remediation. Isolated worktree `.worktrees/rubric-24-personal-schedule`. Human review waived; close to `done` after independent review.
- 2026-08-13 — Implementation in `.worktrees/rubric-24-personal-schedule` (do not mark done). Files: `src/PublicProgramRenderer.tsx`, `src/api.ts`, `src/styles.css`, `test/ui/public-program.test.tsx`. Focused tests: `npm run test:ui -- test/ui/public-program.test.tsx` (13/13 pass). Logged-out demo: http://100.105.117.93:5240/e/pacific-open-data-summit-2026/program/itinerary (`ss` bind `0.0.0.0:5240`). Browser run: add/remove on itinerary and sessions cards, My Schedule membership exact, persist after full reload keyed by `eventId` + `revision.id`, ICS export `GET /api/events/pacific-open-data-summit-2026/program/calendar.ics?sessionIds=demo-ses-keynote` returned one VEVENT (`Opening keynote: charts that hold`). Missing-session and revision-change cases covered in UI tests without rewriting saved ids.
- 2026-08-13 — Orchestrator review: live logged-out itinerary and sessions at http://100.105.117.93:5240 prove add/remove, exact My Schedule membership, reload persistence, and a two-VEVENT ICS. Focused UI tests 13/13. Human review waived. Closed to done.
