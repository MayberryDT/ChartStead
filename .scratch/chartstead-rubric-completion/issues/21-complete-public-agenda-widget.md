# 21 — Complete the public Agenda widget

**Status:** done

**Blocked by:** None — can start immediately.

## What to build

Add a dedicated attendee-facing agenda organized by event day and time with room or track structure, correct session placement, day navigation, and a complete session-detail interaction that returns users to their intact agenda state.

## User stories covered

- Rubric criteria EMB-06, EMB-07, and EMB-08.

## Acceptance criteria

- [x] Sessions render in a clear per-day, time-ordered structure with room/location context and visible title plus track or format.
- [x] Day navigation changes both the selected date and rendered sessions while preserving a direct-linkable state.
- [x] Session blocks appear at the correct published day, start/end time, and room, including truthful TBD handling outside timed slots.
- [x] Opening a session shows full time range, room, description, format, track, and complete speakers.
- [x] Back or close restores the prior day, filters, scroll position, and agenda content.
- [x] Tests cover placement accuracy, day switching, detail fields, return state, empty/TBD cases, accessibility, and mobile behavior.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-12 — Created as a dedicated public agenda surface; organizer scheduling remains owned by the existing agenda workspace.
- 2026-08-12 — Started in isolated worktree for public Agenda widget implementation and review.

### 2026-08-12 agent update

Moved to `in-review` after integration into the main checkout. Focused verification passed:

- `npm run typecheck`
- `npm run test:ui -- test/ui/organizer-shell.test.tsx test/ui/cfp-runtime.test.tsx test/ui/submitter-dashboard.test.tsx test/ui/settings-airtable.test.tsx test/ui/speaker-directory.test.tsx test/ui/onboarding-file-constraints.test.ts test/ui/agenda.test.tsx test/ui/agenda-auto-place.test.ts test/ui/public-program.test.tsx test/ui/public-program-helpers.test.ts`
- `npm run test:worker -- test/worker/submitter-dashboard.test.ts test/worker/evaluation-plans.test.ts test/worker/speaker-directory.test.ts test/worker/speaker-csv-import.test.ts test/worker/rubric-11-multi-speaker-invitations.test.ts test/worker/onboarding.test.ts test/worker/session-content.test.ts test/worker/course-check-publication.test.ts test/worker/agenda.test.ts test/worker/public-program.test.ts`
- `npm run test:worker -- test/worker/guided-cfp.test.ts`
- 2026-08-12 — Human review explicitly waived by Tyler. Integrated self-verification passed: typecheck, full UI suite (140/140), and full worker suite (265/265); moved to done.
