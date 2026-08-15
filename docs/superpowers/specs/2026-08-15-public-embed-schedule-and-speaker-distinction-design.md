# Public Embed Schedule and Speaker Distinction Design

**Date:** 2026-08-15
**Status:** Authoritative after corrective review pass 4 on 2026-08-15

## Goal

Keep ChartStead's rubric-required personal schedule with one minimal row-level bookmark, make the schedule entry point visibly functional, restore a clear distinction between Speakers List and Speaker Gallery, and use blue only for restrained borders, icons, and focus states.

## Product decisions

### Personal schedule

The personal schedule remains a real public feature because rubric criteria EMB-10 and EMB-11 require logged-out attendees to add and remove sessions, see exactly their selections after reload, and export those selections. Persistence remains browser-local, event/revision-scoped, mirrored in TanStack Router search, and owned by the existing TanStack Query mutation boundary.

Sessions List shows one minimal Base UI/Lucide bookmark on every row. Clicking anywhere else on a row opens Session Details. Both controls update the same TanStack Query/Router-backed schedule state. There is no separate session-count strip: the compact `My schedule (n)` action lives directly in the search/filter row and remains visible while an inspector is open. The inspector contains exact saved membership and a combined ICS export.

The desktop Sessions List reserves the inspector width immediately; the inspector never overlays rows or filters. At narrow widths the inspector becomes a full-viewport surface. Session rows and Session Details both resolve existing local speaker portraits and render speaker identity metadata.

The Schedule Itinerary keeps its visible saved-session rail. Its redundant `View my itinerary` button is removed because the rail already is the itinerary view. Grid cards remain directly openable and retain their independent save control because itinerary construction is the purpose of that embed. Opening Session Details reserves inspector width on desktop instead of overlaying the grid.

Agenda rows are directly openable and use the same Session Details surface. The Agenda reserves inspector width at desktop, reflows to a compact four-column row while details are open, and keeps its independent itinerary bookmark above the row-open target.

### Speaker surfaces

The two speaker surfaces are deliberately different:

- **Speakers List:** an information-first, alphabetized three-column card grid with 96px rounded-rectangle portraits, name, title, organization, and linked-session summaries. It is deliberately card-only: no profile inspector, profile buttons, selected state, or auto-selection.
- **Speaker Gallery:** portrait-first, multi-column tiles, 120px circular portraits, minimal identity metadata, and a persistent selected-speaker inspector. It optimizes visual browsing.

The List retains its connected card grid and materially denser information layout than the Gallery. The Gallery keeps its larger portrait-first tiles and circular inspector portrait. Headshot containers with real images have transparent fallback backgrounds so no off-center blue halo leaks around antialiased circular images.

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
- Gallery tiles retain pressed selection semantics, 44px minimum targets, focus-visible rings, and reduced-motion-safe panel behavior. Speakers List cards are semantic, non-interactive articles.
- Existing itinerary persistence, optimistic rollback, URL restoration, filtering, privacy, and publication-revision boundaries do not change.

## Responsive behavior

At desktop widths, session inspectors remain fixed to the right and reserve content space. On narrow screens they become full-width panels. The Speakers List uses three columns when space allows, two at medium widths, and one at narrow widths; Gallery remains multi-column until its existing narrow breakpoint. Sessions rows use container-responsive grids so logistics wrap before the page overflows.

## Verification contract

- Component tests prove Sessions List has a minimal row bookmark, row and detail portraits resolve, My Schedule opens with exact membership, Agenda mounts Session Details, and combined ICS contains the selected IDs.
- Component tests prove Speakers List renders non-interactive directory cards with no profile inspector while Gallery retains selectable portrait cards.
- Browser tests prove the two speaker discovery panes remain materially different and the Gallery inspector portrait is circular with no fallback-background halo.
- Agenda and Itinerary browser geometry proves their content right edges stop before the fixed inspector.
- Focused UI tests, focused Playwright regressions, typecheck, production build, API JSON smoke, and listener binding all pass before completion.

## Scope boundary

This pass does not add attendee accounts, server-side itinerary synchronization, new Sessionboard parity claims, organizer Embed Builder changes, or competition-ticket status changes.
