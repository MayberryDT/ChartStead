# 09 — Complete review results and exports

**Status:** done

**Blocked by:** None — implemented with stored review evidence and compatible scorecard criteria fields.

## What to build

Complete the organizer results surface with co-speaker role context and downloadable review evidence. CSV output must faithfully represent submissions, reviewer completion, configured criteria, recommendations, and aggregate scores without leaking private data to unauthorized roles.

## User stories covered

- Rubric criteria ABS-11 and ABS-13.

## Acceptance criteria

- [x] Organizer review and results views show every co-speaker with the role captured at submission time.
- [x] Results expose review completion, per-criterion values, recommendation, and aggregate score for each submission.
- [x] An organizer can download a CSV with one stable row shape per submission or documented normalized rows per review.
- [x] Exported values match on-screen results after reload and handle incomplete reviews explicitly.
- [x] Only authorized event administrators can export unblinded review evidence.
- [x] Tests parse the generated CSV and compare fixture identities, roles, scores, recommendations, and statuses with stored results.

## Blocked by

- None.

## Comments

- 2026-08-12 — Initial blocker recorded; ABS-14 AI triage remains deliberately excluded and not applicable.

- 2026-08-13 — frontier-reconcile: Still blocked on: Rubric 05 (blocked).

### 2026-08-12 agent update

Tyler explicitly authorized clearing all remaining non-human-tandem tickets; moved from `blocked` to `in-progress` for active implementation in the main checkout.

### 2026-08-12 implementation update

Implemented review evidence persistence, score aggregation, admin-only JSON/CSV result surfaces, organizer results UI, co-speaker role display, and a CSV round-trip worker test. Targeted verification passed with `npx vitest run --config vitest.worker.config.ts test/worker/review-results-export.test.ts`. Parent waived human review; moved to `done`.
