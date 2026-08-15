# Public Embed Schedule and Speaker Distinction Design

**Date:** 2026-08-15
**Status:** Approved in conversation

## Goal

Keep ChartStead's rubric-required personal schedule while removing noisy row-level bookmarks, make the schedule entry point visibly functional, restore a clear distinction between Speakers List and Speaker Gallery, and introduce restrained ChartStead-blue structure without turning the embeds into blue canvases.

## Product decisions

### Personal schedule

The personal schedule remains a real public feature because rubric criteria EMB-10 and EMB-11 require logged-out attendees to add and remove sessions, see exactly their selections after reload, and export those selections. Persistence remains browser-local, event/revision-scoped, mirrored in TanStack Router search, and owned by the existing TanStack Query mutation boundary.

Sessions List no longer shows bookmark controls on every row. Clicking a row opens Session Details; that inspector owns one explicit text action: `Add to my schedule` or `Remove from my schedule`. A `My schedule (n)` toolbar button opens a dedicated inspector containing exactly the selected sessions and a combined ICS export. Selecting a saved session from that inspector opens its Session Details.

The Schedule Itinerary keeps its visible saved-session rail. Its redundant `View my itinerary` button is removed because the rail already is the itinerary view. Grid cards remain directly openable and retain their independent save control because itinerary construction is the purpose of that embed.

### Speaker surfaces

Both speaker surfaces retain the persistent full-height desktop inspector and stacked narrow behavior. Their discovery panes become deliberately different:

- **Speakers List:** information-first, alphabetized, dense single-column rows, 52px portraits, name, title, organization, and compact linked-session summary. It optimizes scanning and comparison.
- **Speaker Gallery:** portrait-first, multi-column tiles, 120px portraits, minimal identity metadata, and visual browsing. It optimizes discovery.

The List must not use large portrait cards or a gallery grid. The Gallery must not adopt directory rows.

### Color and hierarchy

Use the existing design-system colors only:

- Deep Indigo `#081D3A` for headings and structural text.
- Steel Blue `#2F5D98` for active controls, focus, and selected-state borders.
- Schedule Blue `#E8F1FB` for selected rows, inspector header bands, and quiet count/action regions.

White remains the dominant canvas. No gradients, dark full-page panels, new decorative colors, or nested cards are introduced.

## Interaction and accessibility

- Base UI buttons remain the interaction primitive.
- Session-row click and keyboard activation open details; schedule mutation is a separate labeled action inside the inspector.
- `My schedule (n)` has an accessible expanded state and opens a complementary panel with a close action.
- Combined ICS export uses the existing public calendar URL builder and exactly the selected session IDs.
- Speaker rows and gallery tiles retain pressed selection semantics, 44px minimum targets, focus-visible rings, and reduced-motion-safe panel behavior.
- Existing itinerary persistence, optimistic rollback, URL restoration, filtering, privacy, and publication-revision boundaries do not change.

## Responsive behavior

At desktop widths, session and speaker inspectors remain fixed to the right and reserve content space. On narrow screens they become full-width stacked panels. The compact Speakers List stays one column at all widths; Gallery remains multi-column until its existing narrow breakpoint.

## Verification contract

- Component tests prove Sessions List has no row bookmark, details owns add/remove, My Schedule opens with exact membership, and combined ICS contains the selected IDs.
- Component tests prove Speakers List renders compact directory rows while Gallery renders portrait cards.
- Browser tests prove the two speaker master panes have materially different portrait sizes/density and retain full-height inspectors.
- Existing itinerary non-overlap geometry remains green after removal of the redundant action.
- Focused UI tests, focused Playwright regressions, typecheck, production build, API JSON smoke, and listener binding all pass before completion.

## Scope boundary

This pass does not add attendee accounts, server-side itinerary synchronization, new Sessionboard parity claims, organizer Embed Builder changes, or competition-ticket status changes.
