# 61 — Rebuild the demo as AI Engineer World's Fair 2026

**Status:** done (merged to `main`)

**Blocked by:** None — can start immediately.

## What to build

Make one canonical demo program, based on the real AI Engineer World's Fair, and use it everywhere: `/demo`, seeded organizer data, public program, all five embeds, Course Check fixtures that must stay coherent, and the website sample/example event. Today's split (Pacific Open Data Summit as the real demo, a thin unused AI Engineer stub, Harborline on the website) goes away.

This is a completely new demo, not a rename of production. Public host will be `https://demo.chartstead.com` (Competition 60). Production stays on `https://chartstead.mayberrydt.workers.dev`.

Use public-safe, realistic program data inspired by the real event. Do not scrape private speaker emails or invent official partnership claims.

## Acceptance criteria

- [x] The primary seeded/demo event is AI Engineer World's Fair 2026 with truthful public facts: June 29–July 2, 2026, Moscone West, San Francisco, timezone `America/Los_Angeles`.
- [x] Tracks, rooms, speakers, sessions, proposals, tasks, and published revision are fully populated so every organizer tab and every public embed looks like a real program.
- [x] `/demo` personas (organizer, reviewer, speaker) open this event, not Pacific Open Data Summit.
- [x] Public program and Sessions List, Speakers List, Agenda, Itinerary, and Speaker Gallery all resolve against this event.
- [x] The thin stub at `ai-engineer-worlds-fair-2026` is either promoted to this canonical dataset or removed so there is only one AI Engineer demo.
- [x] Website-facing names and IDs are documented for Website 03 and Website 05 (one shared source).
- [x] Existing focused seed/demo tests are updated and pass. A Tailscale `/demo` URL and five-widget checklist are recorded.

## Comments

- 2026-08-16 — Tyler: base the demo and the website example event on a real AI Engineer event; landing page, demo event, and demo app must share the same data.
- 2026-08-16 — Research: official event is AI Engineer World's Fair 2026, June 29–July 2, Moscone West; `https://ai.engineer/wf`. Current seed in `worker/seed-events.ts` already names `AI Engineer World's Fair 2026` but uses June 25–27 and is not the Course Check / `/demo` event (`pacific-open-data-summit-2026`). Website `site.sampleEvent` is still Harborline Technical Summit 2026.
- 2026-08-16 — Tyler: this is a completely new demo, not a rename of production. Public host will be `https://demo.chartstead.com` (Competition 60). Production stays on `https://chartstead.mayberrydt.workers.dev`.
- 2026-08-16 — Claimed by agent; worktree `.worktrees/ticket-61-rebuild-demo`, branch `ticket-61-rebuild-demo`. Stopping for Tyler answers before coding.
- 2026-08-16 — Tyler answers: keep PODS and Civic Tech as switcher events; minimize/hide Course Check; invent public-safe names; 4-day dense program is fine; update ChartStead docs and `chartstead-web` `site.sampleEvent`; reviewer track does not matter; stop at in-review and wait for merge go-ahead. Competition 60 left open.
- 2026-08-16 — Agent recommendation on Competition 60: ticket 61 is seed, docs, local `/demo`, and the shared ID source. Attaching `https://demo.chartstead.com` stays Competition 60. Do not merge 61 until Tyler says so.
- 2026-08-16 — in-review. Canonical event `ai-engineer-worlds-fair-2026` (June 29–July 2, Moscone West, 8 tracks, 10 rooms, published program with 110 public sessions). `/demo` personas open World's Fair. Course Check killer-demo fixtures stay on Pacific Open Data Summit; Settings Course Check section is hidden. Shared source: `shared/demo-event.ts` and `docs/demo-event.md`. `chartstead-web` `site.sampleEvent` updated to the same IDs. Focused worker/demo tests passed. UI `app.test.tsx` still has 5 failures that also fail on `main`.
- 2026-08-16 — Tyler review fixes: speaker portraits on every World's Fair speaker; onboarding due dates moved to November 2026 (none overdue); agenda sessions on Mon–Thu; five managed embeds seeded with stable `aewf-embed-*` IDs; Settings Automation tab relabeled Agents. Focused worker/demo tests 18/18 and UI demo-personas 2/2. Still in-review; do not merge until Tyler says so.
- 2026-08-17 — Tyler approved merge. Merged `ticket-61-rebuild-demo` to `main` (`f188369`, commit `130e0b7`). `chartstead-web` `site.sampleEvent` committed (`ed59348`). Ticket done.

### QA

- Demo: http://100.105.117.93:5191/demo
- Organizer: http://100.105.117.93:5191/e/ai-engineer-worlds-fair-2026/submissions
- Public program: http://100.105.117.93:5191/e/ai-engineer-worlds-fair-2026/program
- Sessions List: http://100.105.117.93:5191/e/ai-engineer-worlds-fair-2026/program/sessions
- Speakers List: http://100.105.117.93:5191/e/ai-engineer-worlds-fair-2026/program/speakers
- Agenda: http://100.105.117.93:5191/e/ai-engineer-worlds-fair-2026/program/agenda
- Itinerary: http://100.105.117.93:5191/e/ai-engineer-worlds-fair-2026/program/itinerary
- Speaker Gallery: http://100.105.117.93:5191/e/ai-engineer-worlds-fair-2026/program/speaker-gallery
- Embeds workspace: http://100.105.117.93:5191/e/ai-engineer-worlds-fair-2026/embeds
- Sessions embed: http://100.105.117.93:5191/e/ai-engineer-worlds-fair-2026/embed/aewf-embed-sessions
- Speakers embed: http://100.105.117.93:5191/e/ai-engineer-worlds-fair-2026/embed/aewf-embed-speakers
- Agenda embed: http://100.105.117.93:5191/e/ai-engineer-worlds-fair-2026/embed/aewf-embed-agenda
- Itinerary embed: http://100.105.117.93:5191/e/ai-engineer-worlds-fair-2026/embed/aewf-embed-itinerary
- Speaker Gallery embed: http://100.105.117.93:5191/e/ai-engineer-worlds-fair-2026/embed/aewf-embed-speaker-gallery
- Settings Agents: http://100.105.117.93:5191/e/ai-engineer-worlds-fair-2026/settings

Check: Nora Ellison / Shipping reliable agent workflows in production; Agents track reviewer; PODS and Civic Tech still in the event switcher; Course Check not in Settings; speaker portraits present; onboarding dues in November 2026; agenda filled Mon–Thu; Settings tab says Agents.
