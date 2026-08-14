# 46 — Match the premium Speaker Gallery embed source of truth

**Status:** in-review

## Parent

Competition 19 — Public program and embed visual polish

## What to build

Rebuild the attendee-facing Speaker Gallery embed as a top-of-the-line, premium implementation of [`design/source-of-truth/embeds/speaker-gallery.png`](../../../design/source-of-truth/embeds/speaker-gallery.png), the locked Direction 03 — Signal Rail reference. Preserve the existing public-safe speaker-gallery, revision, filtering, field-visibility, theme, and embed-resolution semantics while matching the reference’s composition and polish.

## Acceptance criteria

- [ ] The Speaker Gallery embed treats the selected source-of-truth image as its visual acceptance contract: gallery composition, hierarchy, density, spacing, typography, colors, borders, portrait treatment, controls, and footer attribution match at the 1536×1024 reference viewport.
- [ ] Deterministic demo fixtures populate the comparison route with the same kinds and volume of visible content as the reference: event identity, search/filter controls, a diverse speaker roster, names, roles, organizations, supporting metadata, session relationships, and reference-visible actions. Fake content must be realistic, public-safe, stable between runs, and must not alter production data semantics.
- [ ] Speaker portraits use committed demo-safe images with deterministic URLs, consistent crops and focal treatment, and accurate alt text; do not use unstable external hotlinks. Use the approved ChartStead mark rather than generated logo artifacts.
- [ ] The implementation remains responsive and keyboard accessible, retains 44px targets and visible focus, and has intentional loading, empty, filtered-empty, missing-portrait, error, disabled, and narrow states derived from the locked direction.
- [ ] Create or reuse a Tailscale-reachable fixture route that renders only this embed with deterministic data at a fixed 1536×1024 capture viewport; record the route and capture command in the ticket comments.
- [ ] Run a documented build → screenshot → Vision comparison → correction loop against `speaker-gallery.png`. After every comparison, record the visible mismatches, correct them, and compare again. Continue until Vision reports no meaningful mismatch in structure, alignment, scale, spacing, typography, color, borders, portrait treatment, imagery, or content density; a subjective “looks good” pass is not sufficient.
- [ ] Save the final implementation screenshot and the final Vision comparison result as durable QA evidence, including the number of iterations. The ticket cannot move to `in-review` while any identified visual mismatch remains unresolved.
- [ ] Existing gallery/embed resolution, revision pinning, filters, field visibility, privacy boundaries, and focused tests continue to pass.

## Blocked by

None — Competition 09 and Rubric 23 already provide the working public embed foundation.

## Comments

- 2026-08-14 — Coordinator verification passed after rejecting and correcting footer clipping: 12/12 cumulative focused UI tests and production build/TypeScript pass. Demo: `http://100.105.117.93:5446/e/pacific-open-data-summit-2026/program/embed?widget=speaker-gallery&fixture=signal-rail`. Human QA: compare the split gallery/dossier at 1536×1024, verify all third-row metadata clears the footer, exercise search/track/role/profile/session controls, and check narrow/focus behavior.
- 2026-08-14 — Claimed by worker branch `ticket-46-premium-speaker-gallery` in `/home/halla/ChartStead/.worktrees/ticket-46-premium-speaker-gallery`.
- 2026-08-14 — Created from Tyler’s locked public embed source-of-truth decision. This ticket owns only the Speaker Gallery renderer and its visual parity loop.
- 2026-08-14 — Deterministic comparison route: `http://100.105.117.93:5446/e/pacific-open-data-summit-2026/program/embed?widget=speaker-gallery&fixture=signal-rail`. Capture: `npx playwright screenshot --viewport-size=1536,1024 --wait-for-timeout=900 '<route>' .scratch/qa/ticket-46/final.png`.
- 2026-08-14 — Visual comparison ledger (3 iterations): (1) structure constrained by inherited 960px widget width, missing Role control, page chrome and oversized rows; corrected with full-width embed shell and widget-local grid. (2) correct four-column rail and detail structure, but selected portrait sat 18px low, rows were too tall, footer below viewport, and source ordering was lost; corrected rail density, intro spacing, fixed attribution, and stable fixture order. (3/final) no meaningful mismatch remains in structure, alignment, scale, spacing, typography, color, borders, controls, portrait crops, imagery, or density. Final evidence: `design/qa/ticket-46/speaker-gallery-final-1536x1024.png`; narrow evidence: `.scratch/qa/ticket-46/narrow-390x844.png`.
- 2026-08-14 — Verification: `npm run build`; `npm run test:ui -- --run test/ui/public-program.test.tsx` (10/10); `/api/events` JSON 200; fixture 200; listener confirmed on `0.0.0.0:5446`. Status intentionally remains `in-progress` for orchestrator review.
- 2026-08-14 — Independent review found the fixed footer obscured third-row metadata in iteration 3. Iteration 4 reduced gallery-only portrait/card vertical density and replaced the improvised search slash with a local CSS magnifier. At exactly 1536×1024, Litia, Ben, and Sina now show complete role, organization, and track metadata above the footer while the selected-speaker dossier geometry is unchanged. Re-captured committed final evidence; Vision comparison reports no remaining bottom collision or meaningful mismatch.
