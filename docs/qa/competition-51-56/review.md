# Competition 51 + 56 itinerary review

- Demo: `http://100.105.117.93:5456/fixtures/itinerary-embed`
- Desktop: `itinerary-functional-polish-desktop.png` (1536×1024)
- Narrow: `itinerary-functional-polish-narrow.png` (390×844)

## Functional review

Saved IDs are controlled by the page through a TanStack Query cache, persisted to local storage, mirrored into the Router `saved` search parameter, de-duplicated, optimistically updated, and rolled back if persistence throws. Filters and selected session remain Router-owned. Base UI buttons own day tabs, save/remove, clear, and itinerary navigation with pressed, selected, pending, disabled, keyboard-focus, and reduced-motion states.

## Visual review

Pass 1 identified duplicate attribution and a footer below the fixed viewport. Pass 2 removed the outer itinerary footer, centered the single attribution without a bar, reserved its grid row, tightened the narrow bottom whitespace, and added restrained reduced-motion-safe transitions. Final desktop and narrow captures show no page-level overflow, clipped rail metadata, card overlap, or blank-space imbalance.

## What to test

1. Save and remove several cards; confirm the rail and card bookmarks update together without duplicates.
2. Reload and share the URL; confirm saved IDs and filters restore.
3. Exercise both days, search, track, room, type, clear, and View my itinerary with keyboard focus.
4. Check empty, TBD, break, gap, overlapping, pending/disabled, narrow horizontal scroll, and reduced-motion states.
