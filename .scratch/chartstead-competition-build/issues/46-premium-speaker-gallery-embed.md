# 46 — Match the premium Speaker Gallery embed source of truth

**Status:** ready-for-agent

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

- 2026-08-14 — Created from Tyler’s locked public embed source-of-truth decision. This ticket owns only the Speaker Gallery renderer and its visual parity loop.
