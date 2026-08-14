# 51 — Make the Schedule Itinerary fully functional

**Status:** in-progress

**Blocked by:** Competition 45

## Parent

Competition 45 — Premium Schedule Itinerary embed

## What to build

Complete the Indexed Folio itinerary behavior. Base UI and TanStack must own appropriate controls, URL state, public data, saved-session mutations, recovery, and navigation so the rail and schedule are operational rather than a visual fixture.

## Acceptance criteria

- [ ] Save/remove actions update both schedule cards and itinerary rail atomically, prevent duplicates, persist across reload/filter/day changes, and recover from mutation failure.
- [ ] Day, search, track, room, type, clear, and itinerary-view controls work with useful TanStack Router search state.
- [ ] TanStack Query owns public schedule loading, pinned/current revisions, itinerary mutation, invalidation, pending state, error retry, and stale-data behavior.
- [ ] Base UI supplies appropriate tabs, selects, buttons, tooltips, and disclosures with visible pressed/selected/disabled/focus states.
- [ ] Overlapping choices, schedule gaps, breaks, TBD items, empty itinerary, filtered-empty, and disabled states behave truthfully without changing public persistence semantics.
- [ ] Session and itinerary navigation targets are stable, keyboard accessible, and public-safe.
- [ ] Focused UI/browser tests exercise every visible control, persistence, URL restoration, error rollback, keyboard behavior, and narrow horizontal schedule navigation.
- [ ] A Tailscale demo and interaction checklist are recorded before `in-review`.

## Comments

- 2026-08-14 — Started on integration branch `orchestrate/embed-polish-42-46` in `/home/halla/ChartStead/.worktrees/embed-polish-integration` after Tyler authorized the complete follow-up wave.
- 2026-08-14 — Created from Tyler's functional embed sweep. Visual refinement is Competition 56.

- 2026-08-14 — frontier-reconcile: Still blocked on: Competition 45 (in-review).
