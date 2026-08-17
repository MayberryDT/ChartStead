# 05 — Lock website copy and sample data to the live demo event

**Status:** ready-for-agent

**Blocked by:** Competition 61

## What to build

Make the marketing site and the demo app tell the same story. Every named event, speaker, proposal, session, track, and sample ID on the website must match the live Competition 61 program. Harborline Technical Summit and other fictional leftovers go away.

## Acceptance criteria

- [ ] `site.sampleEvent` and all page-level sample names/IDs match the demo event exactly.
- [ ] Homepage, Product, and proof captions use the same event name, dates, and people as `/demo` and the public program.
- [ ] No Harborline, Pacific Open Data Summit, or Civic Tech Summit sample facts remain on the shipped marketing site unless they are clearly not the launch demo.
- [ ] Changing the shared demo later requires one documented source of names/IDs, not a second invented dataset.
- [ ] A side-by-side checklist (site copy vs demo records) is recorded before `in-review`.

## Comments

- 2026-08-16 — Tyler: the demo landing page, demo event, and demo app must connect and share the same data.

- 2026-08-17 — frontier-reconcile: All blockers done → ready-for-agent.
- 2026-08-16 — Competition 61 in-review. `chartstead-web` `site.sampleEvent` now matches ChartStead `docs/demo-event.md`. Harborline is no longer the sample event. Website 05 still owns remaining page-level copy lockup.
