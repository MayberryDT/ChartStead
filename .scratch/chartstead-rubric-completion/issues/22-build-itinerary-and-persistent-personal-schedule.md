# 22 — Build itinerary and a persistent personal schedule

**Status:** done

**Blocked by:** None — can start immediately.

## What to build

Create a public chronological itinerary grouped by day, with complete session and speaker metadata, and let attendees select sessions into a local personal schedule that persists across reload and can be exported to calendar formats.

## User stories covered

- Rubric criteria EMB-09, EMB-10, and EMB-11.

## Acceptance criteria

- [x] The itinerary groups sessions by day and orders each day chronologically.
- [x] Cards show track, title, description, full date/time, room, and every speaker with title and company.
- [x] Attendees can add and remove sessions and view a personal schedule containing exactly the selected sessions.
- [x] Personal selections survive a full reload without requiring an account and remain scoped to event and published revision identity.
- [x] Attendees can export the selection through a combined ICS download or documented calendar workflow.
- [x] Tests cover chronological ordering, complete metadata, add/remove, exact selection, persistence, revision changes, export contents, accessibility, and mobile layout.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-12 — Created as a self-contained attendee surface; server-side attendee accounts are not required for rubric persistence.
- 2026-08-12 — Started in isolated worktree for itinerary and persistent personal schedule implementation and review.

### 2026-08-12 agent update

Moved to `in-review` after integration into the main checkout. Focused verification passed:

- `npm run typecheck`
- `npm run test:ui -- test/ui/organizer-shell.test.tsx test/ui/cfp-runtime.test.tsx test/ui/submitter-dashboard.test.tsx test/ui/settings-airtable.test.tsx test/ui/speaker-directory.test.tsx test/ui/onboarding-file-constraints.test.ts test/ui/agenda.test.tsx test/ui/agenda-auto-place.test.ts test/ui/public-program.test.tsx test/ui/public-program-helpers.test.ts`
- `npm run test:worker -- test/worker/submitter-dashboard.test.ts test/worker/evaluation-plans.test.ts test/worker/speaker-directory.test.ts test/worker/speaker-csv-import.test.ts test/worker/rubric-11-multi-speaker-invitations.test.ts test/worker/onboarding.test.ts test/worker/session-content.test.ts test/worker/course-check-publication.test.ts test/worker/agenda.test.ts test/worker/public-program.test.ts`
- `npm run test:worker -- test/worker/guided-cfp.test.ts`
- 2026-08-12 — Human review explicitly waived by Tyler. Integrated self-verification passed: typecheck, full UI suite (140/140), and full worker suite (265/265); moved to done.
