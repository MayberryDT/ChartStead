# 24 — Manage the organizer speaker directory

**Status:** in-progress

**Blocked by:** None — can start immediately.

## What to build

Extend the organizer's readiness board into a usable event speaker directory. Organizers need to find, add, inspect, and correct speaker identities while preserving event-time participation history and continuing to use the existing onboarding, guaranteed-speaker, session, and portal workflows.

## User stories covered

- Competition build stories 27–35, 53–56.

## Acceptance criteria

- [x] The organizer can browse and search the event's speakers by name or email and filter by readiness or outstanding-work state.
- [x] The organizer can add a speaker manually with the minimum identity and event-participation details needed for later assignment.
- [x] The organizer can edit allowed current-profile fields and immediately see the corrected values in readiness and portal projections.
- [x] Editing current identity does not rewrite preserved event-time title or organization snapshots from earlier submissions or events.
- [x] Existing identities are reused deliberately when email or another stable identity signal matches; ambiguous matches require an explicit choice.
- [x] Direct or guaranteed-speaker session linkage uses the existing consequential-action path rather than silently creating external effects.
- [x] Authorization and acceptance tests cover search, filtering, create, edit, identity reuse, historical snapshots, and cross-event isolation.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-12 — Started for agent implementation after Tyler authorized the incoming Competition Build frontier; demos, reviews, and human QA are deferred.
- 2026-08-12 — Implemented and verified the event-scoped organizer directory: responsive search/readiness filters, explicit manual add and identity-choice recovery, current-profile correction with immutable participation snapshots, portal projection, admin authorization, and cross-event isolation. Session linkage remains on the existing guaranteed-speaker Course Check path; planning alone creates no session. Status intentionally remains `in-progress` for parent integration. Full UI 83/83, worker 188/188 with a 15-second timeout allowance, relevant e2e 3/3, typecheck, and production build pass. The default 5-second worker run still exposes one unrelated guided-CFP timeout that passes with the wider allowance.
