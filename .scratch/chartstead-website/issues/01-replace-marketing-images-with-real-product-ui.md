# 01 — Replace every marketing image with real product UI

**Status:** done

**Blocked by:** Competition 61

## What to build

Retire every conceptual, stock, or fictional-sample marketing image on the ChartStead website. Replace them with current screenshots or stills of the real Harbor Ledger product UI, using the shared AI Engineer World's Fair 2026 demo program. Brand marks may stay. Every other visual must be the live product, not a concept render.

## Acceptance criteria

- [x] Inventory every image under `chartstead-web/public/` (marketing, product-proof, social card, and page-level assets). Record which stay as brand marks and which are replaced.
- [x] Homepage, Product, Open Source, and any remaining content pages no longer caption or present conceptual / fictional-sample UI.
- [x] Replacements are cropped from the finished product at current desktop and narrow widths, using the Competition 61 demo event data.
- [x] Alt text and captions describe the real surface (Overview, Submissions, Agenda, Speakers, Course Check, public program, embeds) without inventing capabilities.
- [x] Social card and Open Graph image use the same real-UI standard.
- [x] No leftover Harborline, concept-v1, or stock conference-desk imagery remains in the shipped site.
- [x] A Tailscale preview URL and before/after image list are recorded before `in-review`.

## Comments

- 2026-08-16 — Filed in the board-review session. Current homepage still uses `/marketing/chartstead-ui-concept-v1.webp` and related conceptual stills; `site.sampleEvent` is Harborline Technical Summit 2026.

- 2026-08-17 — frontier-reconcile: All blockers done → ready-for-agent.

- 2026-08-17 — Started with Website 03 and 05 in parallel. Capturing real Harbor Ledger stills from the Competition 61 AEWF program on `demo.chartstead.com`; brand marks stay, conceptual UI / stock desk art goes.

- 2026-08-17 — Ready for human QA.
  - Preview: `http://100.105.117.93:4321/`
  - Stills captured from local Competition 61 demo (`:5824`), not the stale thin AEWF stub still on production `demo.chartstead.com`.
  - **Keep:** `public/brand/*`, `public/favicon.svg`, `public/marketing/chartstead-bathymetry-hero.svg` (brand substrate).
  - **Replace → `public/product-proof/`:** overview, submissions, speakers, agenda, speaker-portal, course-check, public-program (+ mobile crops), embeds, social-card.png from overview.
  - **Removed from `public/marketing/`:** all concept-v1 UI stills, stock conference-desk / outcomes / scope photos, proposal-foundation-concept, course-check-concept, speaker-readiness chart-paper rasters, etc.
  - Before/after: hero `/marketing/chartstead-ui-concept-v1.webp` → `/product-proof/overview.webp`; workflow/proposal/schedule/portal/course-check concept rasters → matching product-proof stills; Product/Open Source concept backgrounds → submissions/embeds/overview crops.

- 2026-08-17 — Follow-up: homepage/product section proofs now use 8–10s real-UI HyperFrames-packaged videos (speakers directory is the dense 100+ list; Course Check shows submissions finalize + agenda publish plan).

- 2026-08-17 — Tyler: complete → done. Real product-proof videos shipped on chartstead.com.
