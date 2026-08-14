# 55 — Give the public Agenda final premium grid polish

**Status:** in-review

**Blocked by:** Competition 50

## Parent

Competition 50 — Public Agenda functional time grid

## What to build

Polish the functional public Agenda into a minimal attendee-facing schedule that inherits the strongest visual and interaction qualities of the organizer Agenda without carrying organizer chrome.

## Acceptance criteria

- [ ] Remove the ChartStead name and logo from the upper-left agenda header; event identity and schedule controls lead the composition.
- [ ] Session cards never overlap; duration, gaps, simultaneous items, and expanded content remain legible with clean time-slot boundaries.
- [ ] Remove nested-card clutter and tighten whitespace while retaining clear time, room, track, speaker, and session hierarchy.
- [ ] Clear filters and itinerary actions look like intentional restrained controls; no action is styled as stray text.
- [ ] Day/filter/result/save changes use premium reduced-motion-safe transitions consistent with the organizer Agenda interaction vocabulary.
- [ ] One quiet centered `Powered by ChartStead` attribution sits at the bottom without a separate bar and matches all other embeds exactly.
- [ ] Exact desktop and narrow screenshots plus dense-overlap fixtures show no clipping, collisions, overflow, or unreadable compressed cards.
- [ ] A Tailscale demo and what-to-test checklist are recorded before `in-review`.

## Comments

- 2026-08-14 — Ready for QA at `http://100.105.117.93:5450/fixtures/agenda-embed`. Verify desktop/narrow layout, filter/day/search/clear behavior, itinerary save/remove persistence, duration-proportional rows, keyboard focus, and centered footer. Evidence: `.scratch/visual-qa/ticket-55/agenda-desktop.png` and `agenda-narrow.png`.
- 2026-08-14 — Started after Competition 50 completed on `ticket-50-agenda-functionality`.

- 2026-08-14 — Created from Tyler's agenda overlap, shared-tech, branding-removal, and premium-polish notes.

- 2026-08-14 — frontier-reconcile: Still blocked on: Competition 50 (blocked — waiting for competition 44).
