# 57 — Give the Speaker Gallery inspector premium motion and polish

**Status:** done

**Blocked by:** Competition 52

## Parent

Competition 52 — Speaker Gallery functional inspector

## What to build

Finish the Signal Rail gallery as a premium split-view attendee experience. The desktop inspector is always present on the right; selecting a speaker updates it gracefully rather than pushing details below the gallery.

## Acceptance criteria

- [x] At desktop widths the gallery and selected-speaker inspector form stable left/right columns; the inspector never renders beneath the gallery or causes page-level overflow.
- [x] The inspector remains open and preserves its column while speaker changes animate content with restrained crossfade/slide choreography, stable geometry, and correct focus/announcement behavior.
- [x] Narrow behavior deliberately transforms the inspector into an accessible Base UI-backed overlay/disclosure or dedicated stacked state without duplicating content or trapping focus.
- [x] Gallery filtering, selection, portrait loading, linked sessions, profile navigation, and responsive changes use premium reduced-motion-safe transitions.
- [x] Clean up excess whitespace, nested-card framing, and control hierarchy while retaining Signal Rail's strong gallery/dossier composition.
- [x] One quiet centered `Powered by ChartStead` attribution sits at the bottom without a separate bar and matches all other embeds exactly.
- [x] Exact desktop and narrow screenshots cover first selection, rapid reselection, filtered selection, missing portrait, empty/error, and long dossier content without clipping or layout jump.
- [x] A Tailscale demo and what-to-test checklist are recorded before `in-review`.

## Comments

- 2026-08-14 — Completed with reduced-motion-safe inspector reveal/content crossfade, stable desktop split, deliberate narrow stacked state, cleaned controls/cards, and centered quiet attribution. Demo: `http://100.105.117.93:5457/e/pacific-open-data-summit-2026/program/embed?widget=speaker-gallery&fixture=signal-rail&speaker=priya`. Test selection, keyboard activation, URL restoration, filters/clear, linked sessions/profile, rapid reselection, desktop/narrow layout, and reduced motion. Evidence: `design/qa/ticket-57/`.
- 2026-08-14 — Started after Competition 52 completed, in `/home/halla/ChartStead/.worktrees/ticket-52-57-speaker-gallery-functional`.
- 2026-08-14 — Created from Tyler's persistent-right-inspector and premium-animation direction.

- 2026-08-14 — frontier-reconcile: Still blocked on: Competition 52 (in-progress).
