# 05 — Lock website copy and sample data to the live demo event

**Status:** in-review

**Blocked by:** Competition 61

## What to build

Make the marketing site and the demo app tell the same story. Every named event, speaker, proposal, session, track, and sample ID on the website must match the live Competition 61 program. Harborline Technical Summit and other fictional leftovers go away.

## Acceptance criteria

- [x] `site.sampleEvent` and all page-level sample names/IDs match the demo event exactly.
- [x] Homepage, Product, and proof captions use the same event name, dates, and people as `/demo` and the public program.
- [x] No Harborline, Pacific Open Data Summit, or Civic Tech Summit sample facts remain on the shipped marketing site unless they are clearly not the launch demo.
- [x] Changing the shared demo later requires one documented source of names/IDs, not a second invented dataset.
- [x] A side-by-side checklist (site copy vs demo records) is recorded before `in-review`.

## Comments

- 2026-08-16 — Tyler: the demo landing page, demo event, and demo app must connect and share the same data.

- 2026-08-17 — frontier-reconcile: All blockers done → ready-for-agent.
- 2026-08-16 — Competition 61 in-review. `chartstead-web` `site.sampleEvent` now matches ChartStead `docs/demo-event.md`. Harborline is no longer the sample event. Website 05 still owns remaining page-level copy lockup.

- 2026-08-17 — Started with Website 01 and 03 in parallel. Config already matches AEWF; remaining work is page-level captions/IDs, dates, and the side-by-side checklist against `docs/demo-event.md`.

- 2026-08-17 — Ready for human QA.
  - Preview: `http://100.105.117.93:4321/`
  - Single source: ChartStead `docs/demo-event.md` / `shared/demo-event.ts` (`DEMO_SAMPLE`). Website mirrors in `chartstead-web/src/config/site.ts` (`site.sampleEvent`); do not invent a second dataset.
  - Side-by-side (`site.sampleEvent` vs `DEMO_SAMPLE` / `docs/demo-event.md`):
    | Field | Site | Demo |
    | --- | --- | --- |
    | name | AI Engineer World's Fair 2026 | AI Engineer World's Fair 2026 |
    | eventId | ai-engineer-worlds-fair-2026 | ai-engineer-worlds-fair-2026 |
    | dates | June 29–July 2, 2026 | June 29–July 2, 2026 |
    | venue | Moscone West, San Francisco | Moscone West, San Francisco |
    | proposalId | SUB-AEWF0017 | SUB-AEWF0017 |
    | speakerId | aewf-speaker-000 | aewf-speaker-000 |
    | sessionId | aewf-session-000 | aewf-session-000 |
    | track | Agents | Agents |
    | speaker | Nora Ellison | Nora Ellison |
    | coSpeaker | Priya Raman | Priya Raman |
    | talkTitle | Shipping reliable agent workflows in production | Shipping reliable agent workflows in production |
  - Homepage/Product captions and CTA notes now name AEWF; no Harborline / Pacific Open / Civic Tech launch-sample leftovers in shipped pages.
