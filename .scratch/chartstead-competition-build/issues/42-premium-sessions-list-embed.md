# 42 — Match the premium Sessions List embed source of truth

**Status:** in-progress

## Parent

Competition 19 — Public program and embed visual polish

## What to build

Rebuild the attendee-facing Sessions List embed as a top-of-the-line, premium implementation of [`design/source-of-truth/embeds/sessions-list.png`](../../../design/source-of-truth/embeds/sessions-list.png), the locked Direction 05 — Atlas Modules reference. Preserve the existing public-safe revision, filtering, field-visibility, theme, and embed-resolution semantics while matching the reference’s composition and polish.

## Acceptance criteria

- [ ] The Sessions List embed treats the selected source-of-truth image as its visual acceptance contract: layout, hierarchy, density, spacing, typography, colors, borders, controls, session modules, and footer attribution match at the 1536×1024 reference viewport.
- [ ] Deterministic demo fixtures populate the comparison route with the same kinds and volume of visible content as the reference: event identity, dates, search, track/room/type filters, session titles, times, speakers, tracks, rooms, durations, and itinerary actions. Fake content must be realistic, public-safe, stable between runs, and must not alter production data semantics.
- [ ] Any required illustrative imagery or avatars are committed demo-safe assets with deterministic URLs and useful alt text; do not use unstable external hotlinks. Use the approved ChartStead mark rather than generated logo artifacts.
- [ ] The implementation remains responsive and keyboard accessible, retains 44px targets and visible focus, and has intentional loading, empty, filtered-empty, error, disabled, and narrow states derived from the locked direction.
- [ ] Create or reuse a Tailscale-reachable fixture route that renders only this embed with deterministic data at a fixed 1536×1024 capture viewport; record the route and capture command in the ticket comments.
- [ ] Run a documented build → screenshot → Vision comparison → correction loop against `sessions-list.png`. After every comparison, record the visible mismatches, correct them, and compare again. Continue until Vision reports no meaningful mismatch in structure, alignment, scale, spacing, typography, color, borders, imagery, or content density; a subjective “looks good” pass is not sufficient.
- [ ] Save the final implementation screenshot and the final Vision comparison result as durable QA evidence, including the number of iterations. The ticket cannot move to `in-review` while any identified visual mismatch remains unresolved.
- [ ] Existing public embed/feed resolution, revision pinning, filters, field visibility, privacy boundaries, and focused tests continue to pass.

## Blocked by

None — Competition 09 and Rubric 23 already provide the working public embed foundation.

## Comments

- 2026-08-14 — Parity QA completed in 4 correction iterations at 1536×1024. Fixture: `http://100.105.117.93:5442/demo/embeds/sessions-list`; capture: `npx playwright screenshot --viewport-size="1536,1024" --wait-for-timeout=400 http://127.0.0.1:5442/demo/embeds/sessions-list .scratch/visual-qa/ticket-42/final-1536x1024.png`.
- 2026-08-14 — Mismatch ledger: I1 — filter facets split/wrapped, excessive vertical whitespace, only 7.5 rows visible, UTC fixture times wrong, track palette unstable, weekday date copy differed; fixed facet grid, dates/times, deterministic track colors, and density. I2 — row modules remained 10–11px too tall and footer fell below viewport; fixed border-box sizing and compact internal anatomy while preserving 44px actions. I3 — rows matched density but canonical footer proved to be a persistent bottom rail and column starts remained 25–30px right; fixed footer positioning and measured six-column geometry. I4 — footer background allowed the next row to show through; fixed opaque rail and recaptured final evidence.
- 2026-08-14 — Final Vision inspection: no meaningful mismatch remains in structure, alignment, scale, spacing, typography hierarchy, palette, borders, controls, or visible content density. Demo-safe initials replace photographic headshots because no approved portrait assets exist; this preserves deterministic/public-safe semantics without hotlinks. Evidence: `.scratch/visual-qa/ticket-42/final-1536x1024.png`.
- 2026-08-14 — Claimed by worker branch `ticket-42-premium-sessions` in `/home/halla/ChartStead/.worktrees/ticket-42-premium-sessions`.
- 2026-08-14 — Created from Tyler’s locked public embed source-of-truth decision. This ticket owns only the Sessions List renderer and its visual parity loop.
