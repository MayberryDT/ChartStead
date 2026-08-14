# 43 — Match the premium Speakers List embed source of truth

**Status:** in-review

## Parent

Competition 19 — Public program and embed visual polish

## What to build

Rebuild the attendee-facing Speakers List embed as a top-of-the-line, premium implementation of [`design/source-of-truth/embeds/speakers-list.png`](../../../design/source-of-truth/embeds/speakers-list.png), the locked Direction 05 — Atlas Modules reference. Preserve the existing public-safe speaker-directory, revision, filtering, field-visibility, theme, and embed-resolution semantics while matching the reference’s composition and polish.

## Acceptance criteria

- [ ] The Speakers List embed treats the selected source-of-truth image as its visual acceptance contract: layout, hierarchy, density, spacing, typography, colors, borders, controls, speaker rows/modules, and footer attribution match at the 1536×1024 reference viewport.
- [ ] Deterministic demo fixtures populate the comparison route with the same kinds and volume of visible content as the reference: event identity, search/filter controls, speaker names, roles, organizations, biographies or supporting metadata, session relationships, and any reference-visible actions. Fake content must be realistic, public-safe, stable between runs, and must not alter production data semantics.
- [ ] Speaker portraits use committed demo-safe images with deterministic URLs, consistent crops, and accurate alt text; do not use unstable external hotlinks. Use the approved ChartStead mark rather than generated logo artifacts.
- [ ] The implementation remains responsive and keyboard accessible, retains 44px targets and visible focus, and has intentional loading, empty, filtered-empty, missing-portrait, error, disabled, and narrow states derived from the locked direction.
- [ ] Create or reuse a Tailscale-reachable fixture route that renders only this embed with deterministic data at a fixed 1536×1024 capture viewport; record the route and capture command in the ticket comments.
- [ ] Run a documented build → screenshot → Vision comparison → correction loop against `speakers-list.png`. After every comparison, record the visible mismatches, correct them, and compare again. Continue until Vision reports no meaningful mismatch in structure, alignment, scale, spacing, typography, color, borders, imagery, or content density; a subjective “looks good” pass is not sufficient.
- [ ] Save the final implementation screenshot and the final Vision comparison result as durable QA evidence, including the number of iterations. The ticket cannot move to `in-review` while any identified visual mismatch remains unresolved.
- [ ] Existing public directory/embed resolution, revision pinning, filters, field visibility, privacy boundaries, and focused tests continue to pass.

## Blocked by

None — Competition 09 and Rubric 23 already provide the working public embed foundation.

## Comments

- 2026-08-14 — Coordinator verification passed after integration: 12/12 cumulative focused UI tests, TypeScript, and production build. Demo: `http://100.105.117.93:5443/fixtures/embeds/speakers-list`. Human QA: compare the 1536×1024 three-by-five directory, exercise search/track/role/clear controls, verify portrait crops and missing-portrait fallback, and check narrow/focus behavior.
- 2026-08-14 — Completed three build → 1536×1024 capture → Vision inspection passes. Evidence: `.scratch/qa/ticket-43/final.png`; mismatch history and capture command: `.scratch/qa/ticket-43/parity-ledger.md`. Final inspection found no meaningful mismatch in structure, alignment, scale, spacing, typography, color, borders, controls, portrait crops, imagery treatment, or density. Demo: `http://100.105.117.93:5443/fixtures/embeds/speakers-list`.
- 2026-08-14 — Claimed by worker branch `ticket-43-premium-speakers-list` in `/home/halla/ChartStead/.worktrees/ticket-43-premium-speakers-list`.
- 2026-08-14 — Created from Tyler’s locked public embed source-of-truth decision. This ticket owns only the Speakers List renderer and its visual parity loop.
