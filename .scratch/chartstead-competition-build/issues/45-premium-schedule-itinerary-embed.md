# 45 — Match the premium Schedule Itinerary embed source of truth

**Status:** in-review

## Parent

Competition 19 — Public program and embed visual polish

## What to build

Rebuild the attendee-facing Schedule Itinerary embed as a top-of-the-line, premium implementation of [`design/source-of-truth/embeds/schedule-itinerary.png`](../../../design/source-of-truth/embeds/schedule-itinerary.png), the locked Direction 04 — Indexed Folio reference. Preserve the existing public-safe revision, itinerary persistence, schedule, filtering, field-visibility, theme, and embed-resolution semantics while matching the reference’s composition and polish.

## Acceptance criteria

- [ ] The Schedule Itinerary embed treats the selected source-of-truth image as its visual acceptance contract: time-by-room layout, hierarchy, density, spacing, typography, colors, borders, controls, selected states, and footer attribution match at the 1536×1024 reference viewport.
- [ ] Deterministic demo fixtures populate the comparison route with the same kinds and volume of visible content as the reference: event identity, dates, time axis, rooms, overlapping program choices, session titles, speakers, tracks, saved/unsaved itinerary states, breaks, and gaps. Fake content must be realistic, public-safe, stable between runs, and must not alter production itinerary semantics.
- [ ] Any required illustrative imagery or avatars are committed demo-safe assets with deterministic URLs and useful alt text; do not use unstable external hotlinks. Use the approved ChartStead mark rather than generated logo artifacts.
- [ ] The implementation remains responsive and keyboard accessible, retains 44px targets and visible focus, and has intentional loading, empty-itinerary, schedule-gap, conflicting/overlapping, TBD, error, disabled, and narrow states derived from the locked direction.
- [ ] Create or reuse a Tailscale-reachable fixture route that renders only this embed with deterministic data at a fixed 1536×1024 capture viewport; record the route and capture command in the ticket comments.
- [ ] Run a documented build → screenshot → Vision comparison → correction loop against `schedule-itinerary.png`. After every comparison, record the visible mismatches, correct them, and compare again. Continue until Vision reports no meaningful mismatch in structure, alignment, scale, spacing, typography, color, borders, imagery, or content density; a subjective “looks good” pass is not sufficient.
- [ ] Save the final implementation screenshot and the final Vision comparison result as durable QA evidence, including the number of iterations. The ticket cannot move to `in-review` while any identified visual mismatch remains unresolved.
- [ ] Existing itinerary/embed resolution, persistence, revision pinning, filters, field visibility, privacy boundaries, and focused tests continue to pass.

## Blocked by

None — Competition 09 and Rubric 23 already provide the working public embed foundation.

## Comments

- 2026-08-14 — Coordinator verification passed after rejecting and correcting rail density/date formatting: 18/18 cumulative focused UI tests, full typecheck, and production build pass. Demo: `http://100.105.117.93:5445/fixtures/itinerary-embed`. Human QA: compare the 3-saved-session rail and time-by-room grid at 1536×1024, exercise save/remove/day/search/track/room/type/clear controls, and check gaps/TBD/narrow/focus behavior.
- 2026-08-14 — Claimed by worker branch `ticket-45-premium-itinerary` in `/home/halla/ChartStead/.worktrees/ticket-45-premium-itinerary`.
- 2026-08-14 — Created from Tyler’s locked public embed source-of-truth decision. This ticket owns only the Schedule Itinerary renderer and its visual parity loop.
- 2026-08-14 — Implemented the dedicated Indexed Folio time-by-room renderer and deterministic fixture at `/fixtures/itinerary-embed`. Four 1536×1024 screenshot/Vision iterations are recorded in `docs/qa/competition-45/parity-ledger.md`; final evidence is `docs/qa/competition-45/itinerary-final-1536x1024.png`. Capture: `npx playwright screenshot --viewport-size=1536,1024 --wait-for-timeout=500 http://127.0.0.1:5445/fixtures/itinerary-embed docs/qa/competition-45/itinerary-final-1536x1024.png`. Ticket intentionally remains in-progress for coordinator review.
- 2026-08-14 — Fourth comparison corrected review gaps: the deterministic rail now contains three saved sessions at reference density and the heading uses the calendar-correct `October 7–8, 2026` range. Final screenshot and ledger were replaced with the reviewed result.
