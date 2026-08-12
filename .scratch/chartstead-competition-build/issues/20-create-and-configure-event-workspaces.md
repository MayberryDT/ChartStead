# 20 — Create and configure event workspaces

**Status:** done

**Blocked by:** None — can start immediately.

## What to build

Give an authorized event administrator a complete path from the existing organizer shell to a new, durable event workspace. The administrator should be able to establish the event identity, operating dates, tracks, and rooms, then enter that event through the normal switcher and continue into CFP, review, speaker, and agenda work without seeded-data assumptions.

## User stories covered

- Competition build stories 1, 3, 39–45, 53, and 55–56.

## Acceptance criteria

- [x] An authorized administrator can create an event with a name, date range, and timezone from the organizer interface.
- [x] The administrator can add, rename, and remove the new event's tracks and rooms before program work begins.
- [x] The new event appears in the event switcher and opens with truthful empty states for submissions, speakers, sessions, and tasks.
- [x] Forms, submissions, reviewer access, speakers, agenda, and settings created under the new event remain scoped to that event.
- [x] Reloading or signing back in preserves the event and its configuration without changing either seeded event.
- [x] Invalid date ranges, duplicate identifiers, and destructive removal of in-use tracks or rooms produce actionable errors without losing entered work.
- [x] HTTP and browser acceptance tests cover creation, configuration persistence, switching, and cross-event isolation.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-12 — Started for agent implementation after Tyler authorized the incoming Competition Build frontier; demos, reviews, and human QA are deferred while automated acceptance verification remains required.
- 2026-08-12 — Implemented durable dynamic workspaces, administrator configuration, reviewer-aware removal safeguards, switcher integration, truthful empty states, and scheduled-processing discovery. After rebasing onto `b3991ae`, full UI (98/98), Worker (218/218), typecheck, and production build pass; the event-workspace and merged demo-persona browser flows pass together (2/2). A prior full browser run reached 19/27 before an unrelated Course Check assertion and demo-server exit caused cascading connection failures; the Course Check case passes in isolation. Tyler waived demo, review, and human QA for this ticket, so automated acceptance closes it as done.
