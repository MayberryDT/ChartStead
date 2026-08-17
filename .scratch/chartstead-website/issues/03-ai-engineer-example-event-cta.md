# 03 — Publish the AI Engineer example event as the second CTA

**Status:** ready-for-agent

**Blocked by:** Competition 47; Competition 61

## What to build

Create the public example event that looks like a real AI Engineer World's Fair program running on ChartStead. It uses the finished public program pages and all five embeds (Sessions List, Speakers List, Agenda, Schedule Itinerary, Speaker Gallery). This is the website's second CTA, after Try the demo.

## Acceptance criteria

- [ ] The example event is the same program as Competition 61 (names, dates, tracks, rooms, speakers, sessions, IDs).
- [ ] Visitors can open a ChartStead-hosted public program plus Sessions List, Speakers List, Agenda, Itinerary, and Speaker Gallery embeds without organizer chrome.
- [ ] The website second CTA label and destination are explicit (example event / see a live program), distinct from the primary demo-app CTA.
- [ ] The composition looks like a real event site, not a marketing collage of disconnected screenshots.
- [ ] Public-safe only: no organizer notes, reviewer state, signed tokens, or demo-admin bypass in the example-event URLs.
- [ ] A Tailscale preview URL and five-embed checklist are recorded before `in-review`.

## Comments

- 2026-08-16 — Tyler: second CTA; base it on a real AI Engineer event; use all ChartStead embeds and pages.
- 2026-08-16 — Research: AI Engineer World's Fair 2026, June 29–July 2, Moscone West, San Francisco; public site `https://ai.engineer/wf`. Seed already has a thin unused `ai-engineer-worlds-fair-2026` event with incorrect June 25–27 dates.

- 2026-08-17 — frontier-reconcile: All blockers done → ready-for-agent.
- 2026-08-16 — Competition 61 in-review. Shared source is ChartStead `docs/demo-event.md` / `shared/demo-event.ts`. Event id `ai-engineer-worlds-fair-2026`. Sample IDs: proposal `SUB-AEWF0017`, speaker `aewf-speaker-000`, session `aewf-session-000`, speaker Nora Ellison, co-speaker Priya Raman.
