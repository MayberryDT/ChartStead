# 50 — Make the public Agenda time grid fully functional

**Status:** in-progress

**Blocked by:** Competition 44

## Parent

Competition 44 — Premium Agenda embed

## What to build

Replace the brittle public Agenda interaction layer with the proven state and grid vocabulary used by the organizer Agenda workspace where it transfers safely. Use Base UI controls and TanStack Router/Query for public filtering, day selection, itinerary changes, and recovery. The public surface remains read-only except for attendee itinerary state.

## Acceptance criteria

- [ ] Time rows and session blocks derive height and placement from actual start, end, duration, and partial/TBD data; adjacent cards never overlap, clip, or cover controls.
- [ ] The time scale expands or contracts to fit content and duration while maintaining readable minimum sizing and deterministic alignment across rooms/tracks.
- [ ] Day, search, track, room, type, speaker, clear, session, and itinerary actions all work and restore useful state through TanStack Router.
- [ ] TanStack Query owns public agenda loading, pinned/current revisions, retry/error state, and itinerary mutation/invalidation.
- [ ] Base UI supplies appropriate tabs, selects, buttons, tooltips, and disclosures with full keyboard and focus behavior.
- [ ] The implementation reuses organizer Agenda helpers/components only where public-safe and presentation-neutral; organizer placement mutations, drag authority, and private conflict data never leak.
- [ ] Tests cover overlaps, simultaneous sessions, long titles, variable durations, gaps, partial/TBD rows, filters, saved state, keyboard access, and narrow horizontal/stacked behavior.
- [ ] A Tailscale demo and interaction checklist are recorded before `in-review`.

## Comments

- 2026-08-14 — Started on integration branch `orchestrate/embed-polish-42-46` in `/home/halla/ChartStead/.worktrees/embed-polish-integration` after Tyler authorized the complete follow-up wave.
- 2026-08-14 — Created from Tyler's functional embed sweep and request to reuse the polished organizer Agenda technology. Visual refinement is Competition 55.

- 2026-08-14 — frontier-reconcile: Still blocked on: Competition 44 (in-review).
