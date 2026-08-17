# 01 — Replace every marketing image with real product UI

**Status:** ready-for-agent

**Blocked by:** Competition 61

## What to build

Retire every conceptual, stock, or fictional-sample marketing image on the ChartStead website. Replace them with current screenshots or stills of the real Harbor Ledger product UI, using the shared AI Engineer World's Fair 2026 demo program. Brand marks may stay. Every other visual must be the live product, not a concept render.

## Acceptance criteria

- [ ] Inventory every image under `chartstead-web/public/` (marketing, product-proof, social card, and page-level assets). Record which stay as brand marks and which are replaced.
- [ ] Homepage, Product, Open Source, and any remaining content pages no longer caption or present conceptual / fictional-sample UI.
- [ ] Replacements are cropped from the finished product at current desktop and narrow widths, using the Competition 61 demo event data.
- [ ] Alt text and captions describe the real surface (Overview, Submissions, Agenda, Speakers, Course Check, public program, embeds) without inventing capabilities.
- [ ] Social card and Open Graph image use the same real-UI standard.
- [ ] No leftover Harborline, concept-v1, or stock conference-desk imagery remains in the shipped site.
- [ ] A Tailscale preview URL and before/after image list are recorded before `in-review`.

## Comments

- 2026-08-16 — Filed in the board-review session. Current homepage still uses `/marketing/chartstead-ui-concept-v1.webp` and related conceptual stills; `site.sampleEvent` is Harborline Technical Summit 2026.

- 2026-08-17 — frontier-reconcile: All blockers done → ready-for-agent.
