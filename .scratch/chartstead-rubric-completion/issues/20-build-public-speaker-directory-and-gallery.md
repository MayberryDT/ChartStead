# 20 — Build public speaker directory and gallery surfaces

**Status:** done

**Unblocked by:** Rubric 12 profile/public metadata is now consumed from the published projection.

## What to build

Provide two public presentations from one speaker projection: an information-dense Speakers List and a visual Speaker Gallery. Both support surname ordering and name search; their details show biography, professional metadata, photo, and correctly scheduled sessions while handling incomplete profiles gracefully.

## User stories covered

- Rubric criteria EMB-04, EMB-05, EMB-12, and EMB-13.

## Acceptance criteria

- [x] The Speakers List is ordered by surname and shows headshot, name, job title, and company.
- [x] Name search narrows both speaker surfaces and reports the matching count.
- [x] List entries open a detail view with biography and sessions including title, date/time, and room.
- [x] The Gallery renders photo-forward cards with graceful placeholders for missing photo or professional metadata.
- [x] Gallery detail includes photo, name, title, company, expandable biography, sessions, and a close action that preserves gallery state.
- [x] Both surfaces use the same published speaker/session identities and expose no private email, token, or onboarding data.
- [x] Tests cover surname ordering, search, missing data, details, close/return state, projection privacy, accessibility, and mobile layout.

## Former blocker

- Rubric 12 — Complete speaker profiles across organizer and portal.

## Comments

- 2026-08-12 — Initial blocker recorded; list and gallery are distinct renderings over one canonical public projection.

- 2026-08-13 — frontier-reconcile: Still blocked on: Rubric 12 (in-review).

### 2026-08-12 agent update

Tyler explicitly authorized clearing all remaining non-human-tandem tickets; moved from `blocked` to `in-progress` for active implementation in the main checkout.

### 2026-08-13 implementation update

Public program now renders one surname-ordered speaker projection as both a dense Speakers List and photo-forward Speaker Gallery. Shared details expose only public-safe name, professional metadata, biography, social links, headshot URL, and published session title/date-time/room data. The public API sanitizer now preserves title/company while still stripping private fields. Narrow verification: `npx vitest run --config vitest.config.ts test/ui/public-program.test.tsx` and `npx vitest run --config vitest.worker.config.ts test/worker/course-check-publication.test.ts -t "publishes atomically"`.
