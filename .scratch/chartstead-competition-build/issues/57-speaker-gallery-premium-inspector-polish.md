# 57 — Give the Speaker Gallery inspector premium motion and polish

**Status:** blocked — waiting for Competition 52

**Blocked by:** Competition 52

## Parent

Competition 52 — Speaker Gallery functional inspector

## What to build

Finish the Signal Rail gallery as a premium split-view attendee experience. The desktop inspector is always present on the right; selecting a speaker updates it gracefully rather than pushing details below the gallery.

## Acceptance criteria

- [ ] At desktop widths the gallery and selected-speaker inspector form stable left/right columns; the inspector never renders beneath the gallery or causes page-level overflow.
- [ ] The inspector remains open and preserves its column while speaker changes animate content with restrained crossfade/slide choreography, stable geometry, and correct focus/announcement behavior.
- [ ] Narrow behavior deliberately transforms the inspector into an accessible Base UI-backed overlay/disclosure or dedicated stacked state without duplicating content or trapping focus.
- [ ] Gallery filtering, selection, portrait loading, linked sessions, profile navigation, and responsive changes use premium reduced-motion-safe transitions.
- [ ] Clean up excess whitespace, nested-card framing, and control hierarchy while retaining Signal Rail's strong gallery/dossier composition.
- [ ] One quiet centered `Powered by ChartStead` attribution sits at the bottom without a separate bar and matches all other embeds exactly.
- [ ] Exact desktop and narrow screenshots cover first selection, rapid reselection, filtered selection, missing portrait, empty/error, and long dossier content without clipping or layout jump.
- [ ] A Tailscale demo and what-to-test checklist are recorded before `in-review`.

## Comments

- 2026-08-14 — Created from Tyler's persistent-right-inspector and premium-animation direction.

- 2026-08-14 — frontier-reconcile: Still blocked on: Competition 52 (blocked — waiting for competition 46).
