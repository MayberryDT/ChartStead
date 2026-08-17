# 09 — YouTube guided demo PIP on /demo

**Status:** blocked — human-tandem only (not agent-ready)

**Blocked by:** None (player can scaffold on a placeholder; final ship waits on the YouTube URL Tyler records)

## What to build

When a visitor opens the product demo (`https://demo.chartstead.com/demo` and the organizer desk after a persona choice), show a **bottom-right picture-in-picture** player for Tyler’s guided YouTube walkthrough. The visitor can follow along in the live app while the video narrates what to click.

This is not Website 02 (short hero montage). This is a longer, spoken guided demo published on YouTube and embedded only in the demo app.

## Acceptance criteria

- [ ] Shoot outline + talking points live in this ticket (or a linked doc) and are good enough for Tyler to record in one pass.
- [ ] Video is uploaded to YouTube (unlisted or public) and the id/URL is recorded here.
- [ ] Demo app shows a dismissible bottom-right PIP (desktop + usable on narrow) after entering `/demo` / demo session; does not block primary UI.
- [ ] Player supports play/pause, open-on-YouTube, mute/unmute, and close; respects reduced-motion / prefers not to autoplay with sound.
- [ ] PIP does not appear on production `app.chartstead.com` or on public program/embed routes — demo Worker / demo entry only.
- [ ] Copy near the player is clear (“Guided demo” / “Follow along”) and does not compete with persona choice CTAs.
- [ ] Tailscale or production demo URL + what-to-test notes are recorded before `in-review`.

## Shoot outline (draft — refine while filming)

**Goal:** ~8–12 minutes. Viewer has the demo open and matches Tyler’s clicks. One event story: AI Engineer World's Fair 2026.

**Setup before record:** fresh `/demo`, wide desktop, quiet room, screen + voice (or face-cam small if preferred). Reset evaluator data if needed.

| # | Section | Show on screen | Say (talking points) | Time |
| --- | --- | --- | --- | --- |
| 0 | Cold open | `/demo` personas | “This is ChartStead — conference program ops. You’re in an isolated demo; nothing here is production. Pick Organizer with me.” | 0:00–0:30 |
| 1 | Organizer shell | Sidebar, event name, Demo Administrator | “Left rail is the desk. Same event the marketing site talks about: AI Engineer World's Fair 2026.” | 0:30–1:00 |
| 2 | Submissions | Queue + one proposal inspector | “Incoming talks land here. Open a proposal — full answers, track, review history. Soft lean and notes stay internal; no email yet.” | 1:00–2:30 |
| 3 | Course Check (decisions) | Multi-select → Course Check workspace | “When you’re ready to accept or decline for real, Course Check is a full plan — evidence, stages, apply. Not a confirm modal.” Prefer Course Check Demo fixtures if still on PODS switcher, or AEWF equivalents. | 2:30–4:30 |
| 4 | Speakers / sessions | Speakers list + session | “Accepts create speakers and sessions. Nora Ellison / Agents track is the sample the site uses.” | 4:30–5:30 |
| 5 | Agenda | Drag/place on agenda | “Agenda is where the day becomes real. Conflicts can save with a warning — publication Course Check decides what goes public.” | 5:30–6:30 |
| 6 | Public program | `/program` or live-program CTA | “Attendees see the published program — not the desk. Same data, public-safe.” | 6:30–7:30 |
| 7 | Embeds (quick) | One embed URL | “Five embeds drop into an external site: sessions, speakers, agenda, itinerary, gallery.” | 7:30–8:30 |
| 8 | Other personas (optional) | Back to `/demo` → reviewer or speaker | “Track reviewer is scoped. Accepted speaker gets a signed portal — profile, tasks, uploads — no committee notes.” | 8:30–10:00 |
| 9 | Close | `/demo` or Settings glance | “Explore freely; reset evaluator data anytime. Docs at chartstead.com/docs. Try the demo again from the homepage.” | 10:00–end |

**Do not cover in v1:** API key minting deep-dive, Airtable credential setup, self-hosting, every Course Check recovery edge.

## Implementation notes (for the agent pass)

- Prefer a small React island on the demo shell: fixed bottom-right, z-index above content but below modals, `iframe` YouTube embed (`youtube-nocookie.com`) or lite-youtube pattern.
- Gate with `CLOUDFLARE_ENV=demo` / demo-only routes — never marketing Astro, never production app.
- Optional query `?guide=1` or localStorage “dismissed” so return visitors stay clean.
- Config: YouTube id in one constant (e.g. `shared/demo-guide-video.ts` or demo env) so the URL can change without a redesign.

## Comments

- 2026-08-17 — Tyler: file ticket. YouTube guided walkthrough plays bottom-right when someone opens the demo; need a shoot outline of what to show and say. Human films; agent wires PIP once URL exists.
