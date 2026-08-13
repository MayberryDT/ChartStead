# 19 — Complete the public Sessions List

**Status:** done

**Blocked by:** None — can start immediately.

## What to build

Turn the existing public-program session list into a complete distributable Sessions List surface with full card anatomy, expandable descriptions, keyword search across sessions and speakers, accurate result counts, and track, format, and location facets.

## User stories covered

- Rubric criteria EMB-01, EMB-02, and EMB-03.

## Acceptance criteria

- [x] Each session card shows title, truncated description, date/time, room, speakers with title/company, and format/track tags.
- [x] Show more and collapse update one card without losing filters, search, scroll, or selected state.
- [x] Keyword search matches session titles and speaker names and updates the visible result count.
- [x] Track, format, and location facets compose with search and only show matching sessions.
- [x] The surface renders outside admin from the canonical published revision and degrades truthfully for TBD data.
- [x] UI and worker tests cover card fields, expansion, both search dimensions, composed filters, counts, accessibility, and mobile layout.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-12 — Created as a complete public surface built on the shared program payload, not a second sessions data source.
- 2026-08-12 — Started in isolated worktree for public Sessions List implementation and review.

### 2026-08-12 agent update

Moved to `in-review` after integration into the main checkout. Focused verification passed:

- `npm run typecheck`
- `npm run test:ui -- test/ui/organizer-shell.test.tsx test/ui/cfp-runtime.test.tsx test/ui/submitter-dashboard.test.tsx test/ui/settings-airtable.test.tsx test/ui/speaker-directory.test.tsx test/ui/onboarding-file-constraints.test.ts test/ui/agenda.test.tsx test/ui/agenda-auto-place.test.ts test/ui/public-program.test.tsx test/ui/public-program-helpers.test.ts`
- `npm run test:worker -- test/worker/submitter-dashboard.test.ts test/worker/evaluation-plans.test.ts test/worker/speaker-directory.test.ts test/worker/speaker-csv-import.test.ts test/worker/rubric-11-multi-speaker-invitations.test.ts test/worker/onboarding.test.ts test/worker/session-content.test.ts test/worker/course-check-publication.test.ts test/worker/agenda.test.ts test/worker/public-program.test.ts`
- `npm run test:worker -- test/worker/guided-cfp.test.ts`
- 2026-08-12 — Human review explicitly waived by Tyler. Integrated self-verification passed: typecheck, full UI suite (140/140), and full worker suite (265/265); moved to done.
