# 44 — Match the premium Agenda embed source of truth

**Status:** in-review

## Parent

Competition 19 — Public program and embed visual polish

## What to build

Rebuild the attendee-facing Agenda embed as a top-of-the-line, premium implementation of [`design/source-of-truth/embeds/agenda.png`](../../../design/source-of-truth/embeds/agenda.png), the locked Direction 05 — Atlas Modules reference with the top-left “ChartStead Agenda” control intentionally removed. Preserve the existing public-safe revision, schedule, filtering, itinerary, field-visibility, theme, and embed-resolution semantics while matching the reference’s composition and polish.

## Acceptance criteria

- [ ] The Agenda embed treats the selected source-of-truth image as its visual acceptance contract: layout, hierarchy, density, spacing, typography, colors, borders, controls, chronological session rows, and footer attribution match at the 1536×1024 reference viewport.
- [ ] The top-left “ChartStead Agenda” control is absent exactly as locked. Do not restore it. Retain the reference’s top-right itinerary action and compact footer attribution using approved brand treatment.
- [ ] Deterministic demo fixtures populate the comparison route with the same kinds and volume of visible content as the reference: event identity, two dates, search, track/room/type/speaker filters, registration, keynote, panel, workshop, meal, presentation, lightning-talk, and reception rows with realistic times, durations, speakers, tracks, rooms, and save states. Fake content must be public-safe and stable between runs.
- [ ] Any required illustrative imagery or avatars are committed demo-safe assets with deterministic URLs and useful alt text; do not use unstable external hotlinks or generated logo artifacts.
- [ ] The implementation remains responsive and keyboard accessible, retains 44px targets and visible focus, and has intentional loading, empty, filtered-empty, TBD time/room, error, disabled, and narrow states derived from the locked direction.
- [ ] Create or reuse a Tailscale-reachable fixture route that renders only this embed with deterministic data at a fixed 1536×1024 capture viewport; record the route and capture command in the ticket comments.
- [ ] Run a documented build → screenshot → Vision comparison → correction loop against `agenda.png`. After every comparison, record the visible mismatches, correct them, and compare again. Continue until Vision reports no meaningful mismatch in structure, alignment, scale, spacing, typography, color, borders, imagery, or content density; a subjective “looks good” pass is not sufficient.
- [ ] Save the final implementation screenshot and the final Vision comparison result as durable QA evidence, including the number of iterations. The ticket cannot move to `in-review` while any identified visual mismatch remains unresolved.
- [ ] Existing agenda/embed resolution, revision pinning, filters, itinerary actions, field visibility, privacy boundaries, and focused tests continue to pass.

## Blocked by

None — Competition 09 and Rubric 23 already provide the working public embed foundation.

## Comments

- 2026-08-14 — Coordinator verification passed after integration: 11/11 focused UI tests, TypeScript, and production build. Demo: `http://100.105.117.93:5444/fixtures/agenda-embed`. Human QA: compare the 1536×1024 Agenda composition, confirm the top-left Agenda control is absent, exercise search/date/filter/bookmark controls, and check narrow/focus behavior.
- 2026-08-14 — Claimed by worker branch `ticket-44-premium-agenda` in `/home/halla/ChartStead/.worktrees/ticket-44-premium-agenda`.
- 2026-08-14 — Created from Tyler’s locked public embed source-of-truth decision. This ticket owns only the Agenda renderer and its visual parity loop.

- 2026-08-14 — Implemented the dedicated Agenda renderer and deterministic fixture at `/fixtures/agenda-embed`; preserved filters, field visibility, day selection, itinerary save controls, and the locked absence of the top-left “ChartStead Agenda” control.
- 2026-08-14 — Visual parity loop (3 captures at 1536×1024): iteration 1 found malformed date range, missing second day tab, rows ~6px too tall, and footer below frame; iteration 2 resolved those and found filter columns/search/list right edge misaligned; iteration 3 resolved alignment and matched structure, scale, spacing, typography hierarchy, colors, borders, controls, and nine-row density. Remaining glyph differences are intentional approved local SVG icons, not generated/reference artifacts.
- 2026-08-14 — Final capture: `docs/qa/competition-44/agenda-final-1536x1024.png`. Capture command: `npx playwright screenshot --viewport-size=1536,1024 http://127.0.0.1:5444/fixtures/agenda-embed .scratch/qa/ticket-44/agenda-final.png`. Demo: `http://100.105.117.93:5444/fixtures/agenda-embed`. Verification: `npx tsc --noEmit`, focused UI 11/11, production build, `/api/events` JSON 200, listener `0.0.0.0:5444`. Ticket intentionally remains in-progress for coordinator review.
