# Public Embed Schedule and Speaker Distinction Design

**Date:** 2026-08-15
**Status:** Superseded in part by the corrective review later on 2026-08-15

## Goal

Keep ChartStead's rubric-required personal schedule with one minimal row-level bookmark, make the schedule entry point visibly functional, restore a clear distinction between Speakers List and Speaker Gallery, and use blue only for restrained borders, icons, and focus states.

## Product decisions

### Personal schedule

The personal schedule remains a real public feature because rubric criteria EMB-10 and EMB-11 require logged-out attendees to add and remove sessions, see exactly their selections after reload, and export those selections. Persistence remains browser-local, event/revision-scoped, mirrored in TanStack Router search, and owned by the existing TanStack Query mutation boundary.

Sessions List shows one minimal Base UI/Lucide bookmark on every row. Clicking anywhere else on a row opens Session Details. Both controls update the same TanStack Query/Router-backed schedule state. A compact toolbar beneath the event heading keeps the session count and `My schedule (n)` visible even while an inspector is open. The inspector contains exact saved membership and a combined ICS export.

The desktop Sessions List reserves the inspector width immediately; the inspector never overlays rows, filters, or the count/schedule toolbar. At narrow widths the inspector becomes a full-viewport surface. Session Details reuses existing local speaker portraits and renders speaker identity metadata.

The Schedule Itinerary keeps its visible saved-session rail. Its redundant `View my itinerary` button is removed because the rail already is the itinerary view. Grid cards remain directly openable and retain their independent save control because itinerary construction is the purpose of that embed.

### Speaker surfaces

Both speaker surfaces retain the persistent full-height desktop inspector and stacked narrow behavior. Their discovery panes become deliberately different:

- **Speakers List:** information-first, alphabetized, compact two-column cards with 76px portraits, name, title, organization, and a linked-session summary. It optimizes scanning and comparison without turning into the Gallery.
- **Speaker Gallery:** portrait-first, multi-column tiles, 120px portraits, minimal identity metadata, and visual browsing. It optimizes discovery.

The List retains compact bordered cards and materially smaller portraits than the Gallery. The Gallery keeps its larger portrait-first tiles. Both use persistent side inspectors at desktop.

### Color and hierarchy

Use the existing design-system colors only:

- Deep Indigo `#081D3A` for headings and structural text.
- Steel Blue `#2F5D98` for active controls, focus, and selected-state borders.
- White for selected surfaces and inspector headers, with Steel Blue borders/rules for state.

White remains the dominant canvas. No gradients, dark full-page panels, new decorative colors, or nested cards are introduced.

## Interaction and accessibility

- Base UI buttons remain the interaction primitive.
- Session-row click and keyboard activation open details; a separate icon-only Base UI bookmark mutates schedule membership without opening details.
- `My schedule (n)` has an accessible expanded state and opens a complementary panel with a close action.
- Combined ICS export uses the existing public calendar URL builder and exactly the selected session IDs.
- Speaker rows and gallery tiles retain pressed selection semantics, 44px minimum targets, focus-visible rings, and reduced-motion-safe panel behavior.
- Existing itinerary persistence, optimistic rollback, URL restoration, filtering, privacy, and publication-revision boundaries do not change.

## Responsive behavior

At desktop widths, session and speaker inspectors remain fixed to the right and reserve content space. On narrow screens they become full-width panels. The compact Speakers List uses two columns when space allows and one column at narrow widths; Gallery remains multi-column until its existing narrow breakpoint. Sessions rows use container-responsive grids so logistics wrap before the page overflows.

## Verification contract

- Component tests prove Sessions List has a minimal row bookmark, My Schedule opens with exact membership, Session Details resolves speaker portraits, Agenda does not mount Session Details, and combined ICS contains the selected IDs.
- Component tests prove Speakers List renders compact directory cards while Gallery renders larger portrait cards.
- Browser tests prove the two speaker master panes have materially different portrait sizes/density and retain full-height inspectors.
- Existing itinerary non-overlap geometry remains green after removal of the redundant action.
- Focused UI tests, focused Playwright regressions, typecheck, production build, API JSON smoke, and listener binding all pass before completion.

## Scope boundary

This pass does not add attendee accounts, server-side itinerary synchronization, new Sessionboard parity claims, organizer Embed Builder changes, or competition-ticket status changes.
