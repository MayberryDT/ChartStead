# 22 — Invite reviewers into track-scoped queues

**Status:** in-progress

**Blocked by:** None — can start immediately.

## What to build

Let an organizer grant track-scoped reviewer access before the reviewer has previously signed in. The invitation must connect the intended email, selected tracks, authenticated identity, and existing shared review queue without creating a second review model or giving the reviewer administrator authority.

## User stories covered

- Competition build stories 17–23, 25–26, 53–56.

## Acceptance criteria

- [ ] An organizer can enter a reviewer email, select one or more tracks, and create an invitation without requiring a pre-existing ChartStead account.
- [ ] The invitation is queued through the existing auditable email boundary and exposes a truthful queued, delivered, failed, or retryable state.
- [ ] Following the valid invitation and completing authentication creates or reuses the intended identity and grants exactly the selected event and track access.
- [ ] Accepting or retrying the same invitation is idempotent and cannot create duplicate memberships or assignments.
- [ ] The reviewer lands in the shared queue, sees only assigned-track submissions, and cannot access administrator-only event operations.
- [ ] Expired, revoked, mismatched, and already-consumed invitations fail safely without exposing committee data.
- [ ] Organizer and reviewer acceptance tests cover invite, delivery boundary, acceptance, queue scoping, revocation, and retry.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-12 — Started for agent implementation after Tyler authorized the incoming Competition Build frontier; demos, reviews, and human QA are deferred.
