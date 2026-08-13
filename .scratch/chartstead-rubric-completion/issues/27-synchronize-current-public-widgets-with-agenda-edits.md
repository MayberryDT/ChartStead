# 27 — Synchronize current public widgets with eligible agenda edits

**Status:** done

**Priority:** P2

## What to build

Make current public pages and current-following embeds receive eligible agenda changes without requiring an organizer to regenerate embed code or perform a separate publication action. Preserve ChartStead's safety boundary: only approved, public-safe content may advance automatically, while revision-pinned embeds remain immutable and blocked changes explain why they stayed private.

## User stories covered

- Rubric criterion EMB-16, while preserving CNT-12 publication safety.

## Acceptance criteria

- [x] Saving an eligible placement or schedule edit atomically advances the current public program consumed by all current-following widget routes.
- [x] Existing current-following embed snippets and feed URLs show the new schedule after refresh without being regenerated or manually republished.
- [x] Revision-pinned embeds remain bound to their selected immutable revision.
- [x] Unapproved or otherwise ineligible content never reaches public output; the organizer receives a clear explanation when an edit cannot advance the public view.
- [x] Sessions List, Agenda, Itinerary, and saved embeds agree on session identity, date/time, room, track, and speaker values after an eligible edit.
- [x] Worker, UI, and fresh browser acceptance checks prove both automatic freshness and the approval/privacy guardrails.

## Blocked by

None — can start immediately.

## Comments

- 2026-08-13 — Created from manual-audit finding EMB-16. Current widgets remained on seed publication revision 1 until a new Publication Course Check was applied. This ticket preserves Course Check eligibility rules while removing the separate republish step for safe changes.
- 2026-08-13 — Claimed by orchestrator for parallel remediation. Isolated worktree `.worktrees/rubric-27-widget-freshness`. Human review waived; close to `done` after independent review.
- 2026-08-12 — Implementation in `.worktrees/rubric-27-widget-freshness`. Eligible already-public placement edits insert a new current public revision atomically; current-following embeds keep their snippet/feed URL; pinned embeds stay frozen; unpublished sessions stay private with an organizer explanation. First publication still requires Course Check. Focused tests passed; demo on :5243. Left in-progress for orchestrator review.
- 2026-08-13 — Orchestrator review: live current program is `pubrev_..._2` with Opening keynote at 18:00 Chart Room. Pinned seed revision stays 15:00 Harbor Hall. Placement-only overlay does not publish draft titles. Focused UI 12/12 and worker public-program/agenda 19/19. Demo http://100.105.117.93:5243/e/pacific-open-data-summit-2026/program/sessions. Human review waived. Closed to done.
