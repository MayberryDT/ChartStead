# Public embed functionality and premium-polish follow-up

**Approved:** 2026-08-14

## Decision

Create two follow-up tickets for each attendee-facing embed. The first ticket makes every visible control and state truthful using Base UI and the existing TanStack stack wherever those libraries own the relevant interaction. The second ticket performs the consumer-facing hierarchy, whitespace, motion, and visual-polish pass only after the functional foundation is complete.

## Shared functional contract

- Use Base UI primitives for buttons, selects, dialogs/popovers, tabs, toggles, tooltips, and other accessible interaction patterns when a matching primitive exists. Do not imitate a Base UI control with an unlabelled `div`, decorative link, or bespoke pseudo-button.
- Use TanStack Router for shareable filter, search, date, selected-speaker, and selected-session state where URL persistence is useful.
- Use TanStack Query for public-program loading, mutations, optimistic itinerary changes, invalidation, retries, and explicit pending/error recovery.
- Every visible control must perform its advertised action. Disabled, loading, empty, filtered-empty, error, and recovery states must be reachable and tested.
- Preserve published-revision pinning, current-following behavior, field visibility, public privacy, feeds, and itinerary persistence.
- Use the organizer Agenda workspace's proven interaction vocabulary where it transfers cleanly, without importing organizer-only mutation authority into a public embed.

## Shared polish contract

- Keep the existing locked per-widget composition, but remove nested-card clutter, ornamental bars, ambiguous text actions, oversized empty containers, and wasteful whitespace.
- Make actions visibly actionable with restrained button hierarchy and 44px targets.
- Use one centered, quiet `Powered by ChartStead` attribution at the bottom of every embed. It must not occupy a separate full-width bar.
- Add premium, reduced-motion-safe transitions for filter/result changes, selection, saving, inspector updates, and responsive rearrangement. Motion must explain state change, never delay it.
- Re-run exact 1536×1024 and narrow visual comparisons, interaction tests, keyboard/focus checks, and browser overflow checks.

## Ticket graph

| Embed | Functional ticket | Polish ticket |
| --- | --- | --- |
| Sessions List | Competition 48 | Competition 53 |
| Speakers List | Competition 49 | Competition 54 |
| Agenda | Competition 50 | Competition 55 |
| Schedule Itinerary | Competition 51 | Competition 56 |
| Speaker Gallery | Competition 52 | Competition 57 |

Competition 47 remains blocked by Competition 42–46 and all ten follow-up tickets. It must consume the completed standalone implementations rather than repair them inside the builder.

## Widget-specific locks

- Sessions List: search/filter/session navigation and itinerary actions work; the itinerary action is inline with the main header/control composition, never isolated in a top bar.
- Speakers List: search/filter/profile/session navigation works and the directory stays minimal and scannable.
- Agenda: remove the upper-left ChartStead identity; eliminate overlaps by deriving row/slot height from duration and content; reuse the organizer Agenda interaction model where appropriate.
- Schedule Itinerary: saved state, filtering, day changes, overlaps, gaps, and narrow horizontal navigation work without losing the Indexed Folio hierarchy.
- Speaker Gallery: the selected-speaker inspector is a persistent right column at desktop widths, not appended below the gallery; selection updates it with premium transitions and correct responsive fallback behavior.

## Verification

Each functional ticket requires focused UI and browser interaction coverage plus public-program/revision/privacy regression tests. Each polish ticket requires a documented multi-pass screenshot ledger at desktop and narrow widths, reduced-motion verification, and a Tailscale demo. No ticket passes with placeholder handlers, console-only behavior, overlapping content, page-level overflow, or controls that merely look interactive.
