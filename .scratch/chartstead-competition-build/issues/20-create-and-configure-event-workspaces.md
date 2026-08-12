# 20 — Create and configure event workspaces

**Status:** in-progress

**Blocked by:** None — can start immediately.

## What to build

Give an authorized event administrator a complete path from the existing organizer shell to a new, durable event workspace. The administrator should be able to establish the event identity, operating dates, tracks, and rooms, then enter that event through the normal switcher and continue into CFP, review, speaker, and agenda work without seeded-data assumptions.

## User stories covered

- Competition build stories 1, 3, 39–45, 53, and 55–56.

## Acceptance criteria

- [ ] An authorized administrator can create an event with a name, date range, and timezone from the organizer interface.
- [ ] The administrator can add, rename, and remove the new event's tracks and rooms before program work begins.
- [ ] The new event appears in the event switcher and opens with truthful empty states for submissions, speakers, sessions, and tasks.
- [ ] Forms, submissions, reviewer access, speakers, agenda, and settings created under the new event remain scoped to that event.
- [ ] Reloading or signing back in preserves the event and its configuration without changing either seeded event.
- [ ] Invalid date ranges, duplicate identifiers, and destructive removal of in-use tracks or rooms produce actionable errors without losing entered work.
- [ ] HTTP and browser acceptance tests cover creation, configuration persistence, switching, and cross-event isolation.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-12 — Started for agent implementation after Tyler authorized the incoming Competition Build frontier; demos, reviews, and human QA are deferred while automated acceptance verification remains required.
