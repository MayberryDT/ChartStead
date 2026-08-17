# 03 — Publish the AI Engineer example event as the second CTA

**Status:** done

**Blocked by:** Competition 47; Competition 61

## What to build

Create the public example event that looks like a real AI Engineer World's Fair program running on ChartStead. It uses the finished public program pages and all five embeds (Sessions List, Speakers List, Agenda, Schedule Itinerary, Speaker Gallery). This is the website's second CTA, after Try the demo.

## Acceptance criteria

- [x] The example event is the same program as Competition 61 (names, dates, tracks, rooms, speakers, sessions, IDs).
- [x] Visitors can open a ChartStead-hosted public program plus Sessions List, Speakers List, Agenda, Itinerary, and Speaker Gallery embeds without organizer chrome.
- [x] The website second CTA label and destination are explicit (example event / see a live program), distinct from the primary demo-app CTA.
- [x] The composition looks like a real event site, not a marketing collage of disconnected screenshots.
- [x] Public-safe only: no organizer notes, reviewer state, signed tokens, or demo-admin bypass in the example-event URLs.
- [x] A Tailscale preview URL and five-embed checklist are recorded before `in-review`.

## Comments

- 2026-08-16 — Tyler: second CTA; base it on a real AI Engineer event; use all ChartStead embeds and pages.
- 2026-08-16 — Research: AI Engineer World's Fair 2026, June 29–July 2, Moscone West, San Francisco; public site `https://ai.engineer/wf`. Seed already has a thin unused `ai-engineer-worlds-fair-2026` event with incorrect June 25–27 dates.

- 2026-08-17 — frontier-reconcile: All blockers done → ready-for-agent.
- 2026-08-16 — Competition 61 in-review. Shared source is ChartStead `docs/demo-event.md` / `shared/demo-event.ts`. Event id `ai-engineer-worlds-fair-2026`. Sample IDs: proposal `SUB-AEWF0017`, speaker `aewf-speaker-000`, session `aewf-session-000`, speaker Nora Ellison, co-speaker Priya Raman.

- 2026-08-17 — Started with Website 01 and 05 in parallel. Live public program + five embeds already 200 on `demo.chartstead.com`; wiring the marketing second CTA to that program (Website 04 still owns any leftover workers.dev → ChartStead-domain CTA cleanup).

- 2026-08-17 — Ready for human QA.
  - Marketing preview: `http://100.105.117.93:4321/`
  - Second CTA: **See a live program** → `https://demo.chartstead.com/e/ai-engineer-worlds-fair-2026/program`
  - Config: `site.exampleEventUrl`, `nav.exampleEventCta`, `exampleEventEmbeds` in `chartstead-web/src/config/site.ts`
  - Five-embed checklist (public-safe paths, no organizer chrome):
    1. Sessions List — `/e/ai-engineer-worlds-fair-2026/embed/aewf-embed-sessions`
    2. Speakers List — `/e/ai-engineer-worlds-fair-2026/embed/aewf-embed-speakers`
    3. Agenda — `/e/ai-engineer-worlds-fair-2026/embed/aewf-embed-agenda`
    4. Schedule Itinerary — `/e/ai-engineer-worlds-fair-2026/embed/aewf-embed-itinerary`
    5. Speaker Gallery — `/e/ai-engineer-worlds-fair-2026/embed/aewf-embed-speaker-gallery`
  - **QA note:** production `demo.chartstead.com` still serves the thin AEWF stub (June 25–27). Local Competition 61 on `:5824` is the correct program (June 29–July 2). Redeploy demo before treating the live CTA destination as final.
- 2026-08-17 — QA feedback: second CTA now opens `/live-program` with a Base UI toolbar (Program + five embeds). Demo note trimmed to “Explore the full app.” Background rasters restored; product-proof UI stills use object-fit contain and full-viewport captures.

- 2026-08-17 — Tyler: complete → done. Live program CTA + embeds surface shipped.
