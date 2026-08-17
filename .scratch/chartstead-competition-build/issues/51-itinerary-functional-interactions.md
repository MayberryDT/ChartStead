# 51 — Make the Schedule Itinerary fully functional

**Status:** done

**Blocked by:** Competition 45

## Parent

Competition 45 — Premium Schedule Itinerary embed

## What to build

Complete the Indexed Folio itinerary behavior. Base UI and TanStack must own appropriate controls, URL state, public data, saved-session mutations, recovery, and navigation so the rail and schedule are operational rather than a visual fixture.

## Acceptance criteria

- [x] Save/remove actions update both schedule cards and itinerary rail atomically, prevent duplicates, persist across reload/filter/day changes, and recover from mutation failure.
- [x] Day, search, track, room, type, clear, and itinerary-view controls work with useful TanStack Router search state.
- [x] TanStack Query owns public schedule loading, pinned/current revisions, itinerary mutation, invalidation, pending state, error retry, and stale-data behavior.
- [x] Base UI supplies appropriate tabs, selects, buttons, tooltips, and disclosures with visible pressed/selected/disabled/focus states.
- [x] Overlapping choices, schedule gaps, breaks, TBD items, empty itinerary, filtered-empty, and disabled states behave truthfully without changing public persistence semantics.
- [x] Session and itinerary navigation targets are stable, keyboard accessible, and public-safe.
- [x] Focused UI/browser tests exercise every visible control, persistence, URL restoration, error rollback, keyboard behavior, and narrow horizontal schedule navigation.
- [x] A Tailscale demo and interaction checklist are recorded before `in-review`.

## Comments

- 2026-08-17 — Tyler: confirm closed on main board. Prior done closeout lived only on tmp/wip-before-67 (park-before-67) and never merged; restored to done.

- 2026-08-16 — Tyler confirmed complete; status → `done`.
- 2026-08-14 — Functional slice ready for QA: URL/local saved itinerary persistence, optimistic TanStack Query mutation with rollback, Base UI actions/day tabs, Router filters, and cumulative focused tests.
- 2026-08-14 — QA demo: `http://100.105.117.93:5456/fixtures/itinerary-embed`. Test save/remove and reload persistence, URL-backed filters/saved IDs, day changes, clear, disabled/pending states, keyboard focus, TBD and narrow horizontal navigation.

- 2026-08-14 — Continued in isolated branch `ticket-51-56-itinerary-functional-polish` from embed integration HEAD `1135b15`; functional behavior is being implemented test-first before Competition 56 begins.

- 2026-08-14 — Started on integration branch `orchestrate/embed-polish-42-46` in `/home/halla/ChartStead/.worktrees/embed-polish-integration` after Tyler authorized the complete follow-up wave.
- 2026-08-14 — Created from Tyler's functional embed sweep. Visual refinement is Competition 56.

- 2026-08-14 — frontier-reconcile: Still blocked on: Competition 45 (in-review).