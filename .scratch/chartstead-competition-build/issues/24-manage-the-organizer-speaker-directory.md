# 24 — Manage the organizer speaker directory

**Status:** ready-for-agent

**Blocked by:** None — can start immediately.

## What to build

Extend the organizer's readiness board into a usable event speaker directory. Organizers need to find, add, inspect, and correct speaker identities while preserving event-time participation history and continuing to use the existing onboarding, guaranteed-speaker, session, and portal workflows.

## User stories covered

- Competition build stories 27–35, 53–56.

## Acceptance criteria

- [ ] The organizer can browse and search the event's speakers by name or email and filter by readiness or outstanding-work state.
- [ ] The organizer can add a speaker manually with the minimum identity and event-participation details needed for later assignment.
- [ ] The organizer can edit allowed current-profile fields and immediately see the corrected values in readiness and portal projections.
- [ ] Editing current identity does not rewrite preserved event-time title or organization snapshots from earlier submissions or events.
- [ ] Existing identities are reused deliberately when email or another stable identity signal matches; ambiguous matches require an explicit choice.
- [ ] Direct or guaranteed-speaker session linkage uses the existing consequential-action path rather than silently creating external effects.
- [ ] Authorization and acceptance tests cover search, filtering, create, edit, identity reuse, historical snapshots, and cross-event isolation.

## Blocked by

None — can start immediately.

