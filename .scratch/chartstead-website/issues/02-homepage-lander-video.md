# 02 — Create the homepage lander video from real UI

**Status:** done

**Blocked by:** Website 01; Website 03; Competition 61

## What to build

Produce the main homepage lander video with Hyperframes from real ChartStead UI, not motion graphics of mock screens. The cut should quickly walk a visitor through the product (organizer desk, Course Check, public program, and embeds) and the marketing site / example-event pages. This is the hero motion on the lander, not a long tutorial.

## Acceptance criteria

- [x] Source footage is captured from the live demo app and the live website using Hyperframes, against the shared AI Engineer World's Fair 2026 program.
- [x] The cut covers organizer work, public program/embeds, and the website example-event CTA without looking like a slide deck.
- [x] Runtime stays short enough for a hero loop or autoplay-with-controls lander treatment; no stock b-roll.
- [x] Poster frame, reduced-motion fallback still, and caption are real-UI and accessible.
- [x] The video is committed or hosted as a first-party site asset and wired into the homepage hero in place of the conceptual still.
- [x] A Tailscale preview URL and capture notes (viewports, Hyperframes project, source routes) are recorded before `in-review`.

## Comments

- 2026-08-16 — Tyler: use real UI with Hyperframes; someone quickly going through everything in the app and on the website.

- 2026-08-17 — frontier-reconcile: Still blocked on: Website 01 (ready-for-agent); Website 03 (ready-for-agent).
- 2026-08-17 — Website 01 and Website 03 moved to in-progress. Still blocked until both are done.
- 2026-08-17 — Website 01 and Website 03 moved to in-review. Still blocked until both are done.

- 2026-08-17 — Started HyperFrames real-UI section clips (public program, submissions, speakers 100+, agenda DnD, speaker portal, Course Check on submissions+agenda) from local AEWF demo `:5835`. Website 01/03 in-review; Competition 61 done.

- 2026-08-17 — Section UI loops shipped (not the final hero lander cut yet):
  - HyperFrames project: `chartstead-web/videos/chartstead-ui-motion/` (`npx hyperframes check` passes)
  - Source recordings: `videos/product-ui-clips/raw/` from AEWF demo `:5835` (111 speakers; Course Check finalize + publication plan)
  - Site embeds (muted autoplay loops + webp posters): public-program, submissions, speakers, agenda, speaker-portal, course-check under `/product-proof/*.mp4`
  - Preview: `http://100.105.117.93:4321/`
  - Remaining for this ticket: one short homepage **hero** lander cut assembling organizer + Course Check + public program.

- 2026-08-17 — Ready for human QA.
  - Hero uses `/product-proof/hero-montage.mp4` (~49s stitch of all section UI clips).
  - Section proofs are video-only (no stacked fallback `<img>`).
  - Preview: `http://100.105.117.93:4321/`
  - HyperFrames project: `chartstead-web/videos/chartstead-ui-motion/`

- 2026-08-17 — Tyler: complete → done. Hero montage + section UI clips live on chartstead.com.
