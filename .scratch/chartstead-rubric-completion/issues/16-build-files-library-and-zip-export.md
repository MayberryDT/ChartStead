# 16 — Build the files library and ZIP export

**Status:** done

**Blocked by:** Rubric 13; Rubric 14 — the library depends on authorized file access and explicit versions.

## What to build

Create an event-level files library aggregating speaker deliverables with speaker, session, task, date, type, status, and version metadata. Organizers can filter and select files or sessions, then generate and download a ZIP containing only the requested latest versions with deterministic grouping.

## User stories covered

- Rubric criteria CNT-13 and CNT-14.

## Acceptance criteria

- [x] The library lists uploaded deliverables across the event with speaker, session, task, upload date, type, current version, and status.
- [x] Organizers can search and filter by speaker, session, task status, file type, and due state.
- [x] Selection works at file and session scope and clearly reports the included latest versions before export.
- [x] ZIP generation produces safe deterministic names, handles duplicate file names, and never includes unselected or historical versions by default.
- [x] Export progress, readiness, failure, expiry, and retry states are truthful and authorized.
- [x] Tests open the generated ZIP and verify grouping, latest-version selection, file contents, authorization, and cross-event isolation.

## Blocked by

- Rubric 13 — Inspect and download speaker deliverables.
- Rubric 14 — Version deliverables and support file comments.

## Comments

- 2026-08-12 — Initial blockers recorded; large export generation must remain bounded for the Worker runtime.

- 2026-08-13 — frontier-reconcile: Still blocked on: Rubric 13 (in-review); Rubric 14 (blocked).

### 2026-08-12 agent update

Tyler explicitly authorized clearing all remaining non-human-tandem tickets; moved from `blocked` to `in-progress` for active implementation in the main checkout.

### 2026-08-13 implementation

Implemented the organizer files library on onboarding deliverables, added latest-version-only library/export API seams, browser ZIP download UI with filters/grouping/selection, and focused ZIP/authorization/cross-event worker coverage. Focused check passed: `npm exec -- vitest run --config vitest.worker.config.ts test/worker/onboarding.test.ts`.
