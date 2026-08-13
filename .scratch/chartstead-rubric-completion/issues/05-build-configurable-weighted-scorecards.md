# 05 — Build configurable weighted scorecards

**Status:** done

**Blocked by:** Rubric 04 — scorecards attach to persistent review rounds.

## What to build

Let organizers define round-specific scorecards containing numeric ratings, dropdown choices, and free-text criteria, optionally weight scored criteria, and show reviewers the correct scorecard while producing a transparent aggregate result for organizers.

## User stories covered

- Rubric criteria ABS-03, ABS-04, and ABS-10.

## Acceptance criteria

- [x] The scorecard editor creates numeric, dropdown, and free-text criteria with labels, guidance, and required flags.
- [x] Numeric and scored dropdown criteria accept explicit weights and explain the aggregate calculation.
- [x] Reviewers see and can persist every configured field for the active round.
- [x] Organizer results show per-review values and a weighted aggregate that matches stored inputs.
- [x] Results can be sorted by aggregate score without hiding incomplete or unscored submissions.
- [x] Tests cover editing, rendering, validation, persistence, aggregation, sorting, and scorecard version changes.

## Blocked by

- Rubric 04 — Create multi-round evaluation plans.

## Comments

- 2026-08-12 — Initial blocker recorded; this ticket owns scorecard depth rather than expanding the basic CFP review criterion.

- 2026-08-13 — frontier-reconcile: Still blocked on: Rubric 04 (in-review).

### 2026-08-12 agent update

Tyler explicitly authorized clearing all remaining non-human-tandem tickets; moved from `blocked` to `in-progress` for active implementation in the main checkout.

### 2026-08-13 implementation update

Implemented configurable round scorecards with numeric, dropdown, and text criteria; persisted reviewer scorecard values; calculated weighted aggregates per review and per proposal; surfaced scorecard details in reviewer/admin proposal detail and aggregate sorting in proposal queues. Focused worker evaluation-plan test now covers weighted scorecard persistence and aggregate sorting.
