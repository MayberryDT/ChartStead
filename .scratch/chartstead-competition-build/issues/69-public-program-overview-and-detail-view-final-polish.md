# 69 — Public program overview and detail view final polish

**Status:** done

## What to build

Polish remaining details on the public program overview layout (`/e/$eventId/program`), schedule cards, speaker gallery cards, and floating inspector detail pop-ups for both sessions and speakers.

## Acceptance criteria

- [x] Schedule cards maintain uniform grid dimensions and clear typography across all days.
- [x] Speaker gallery cards maintain uniform grid dimensions, centered portrait layout, and clear subtitle details.
- [x] Floating detail pop-up for sessions and speakers has clean embed styling, fluid spring transitions, and fits within viewport without unwanted scrollbars.
- [x] Full navigation between sessions and speakers works smoothly without resetting page scroll.
- [x] All UI and worker tests pass.

## Comments

- 2026-08-17 — Done after Tyler QA. Public program overview + speakers-list regression restored; schedule cards, gallery fill, calendar button, and header/toolbar polish landed and approved.
- 2026-08-17 — Restored modern speakers-list from `5758ff1` (hover motion, no View profile / Speakers list label / filter count). Program: full-width gallery, calendar trigger as outline button, 22px avatars on schedule cards.
- 2026-08-17 — In progress: restored speakers-list embed primitives deleted in Ticket 62 CSS rewrite; fixed schedule left-accent paint (was using pale `--schedule-blue` wash); session popup speakers now match embed inspector rows; gallery cards show name/subtitle again.
- 2026-08-17 — Claimed for implementation (agent session). Scope: public program overview + schedule/speaker cards + floating session/speaker inspector polish.
- 2026-08-17 — Opened as follow-up to Ticket 62 walkthrough for final visual and interaction polish on the public program overview page.
