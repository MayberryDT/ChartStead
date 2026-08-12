# 25 — Import speakers from CSV

**Status:** blocked

**Blocked by:** 24 — Manage the organizer speaker directory.

## What to build

Add a reviewable CSV import into the existing event speaker directory. Organizers should be able to preview parsed people, correct mapping problems, understand duplicates and invalid rows, and then create or reuse the same durable speaker identities that manual directory operations use.

## User stories covered

- Competition build stories 29, 33, 53–56.

## Acceptance criteria

- [ ] An organizer can upload a CSV and map common speaker columns including name, email, biography, title, and organization.
- [ ] A preview shows the intended create, reuse, update, skip, and invalid outcome for every row before anything is applied.
- [ ] Duplicate emails, duplicate rows, ambiguous identity matches, missing required values, and malformed files receive actionable row-level feedback.
- [ ] Applying an approved preview creates or reuses speakers through the same identity rules as the manual directory and reports exact totals.
- [ ] Imported speakers appear immediately in directory search, readiness, task assignment, and eligible session-linking flows.
- [ ] Reapplying the same import is idempotent and cannot duplicate speakers or event participations.
- [ ] Authorization and acceptance tests cover preview, mapping, partial invalid input, identity reuse, apply, audit history, and cross-event isolation.

## Blocked by

- 24 — Manage the organizer speaker directory.

## Comments

- 2026-08-12 — Created blocked on Competition 24 so CSV import reuses one authoritative speaker identity and directory command path.


- 2026-08-12 — frontier-reconcile: Still blocked on: Competition 24 (in-progress).
