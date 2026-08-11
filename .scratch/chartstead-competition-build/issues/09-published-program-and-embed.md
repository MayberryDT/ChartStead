# 09 — Public program renderer and embed

**What to build:** A responsive public-program renderer for approved immutable revisions, with useful filters, stable session details, calendar actions, and a simple embeddable presentation using the same renderer.

**Blocked by:** 06 — Onboarding and assisted chasing; 08 — Fluid agenda builder.

**Status:** done

- [x] The renderer can display a selected immutable public revision without owning publication transitions.
- [x] The public schedule shows only publishable sessions and current approved speaker information.
- [x] The public speaker lineup uses consistent headshots, names, biographies, and session links.
- [x] Attendees can filter the schedule by day, track, room, type, or speaker where data exists.
- [x] Session details include time or `TBD`, room or pending location, track, description, and all speakers.
- [x] Add-to-calendar output uses the session's stable public calendar identity.
- [x] Public pages are usable and visually coherent on desktop and mobile.
- [x] A simple embed uses the same data and renderer without requiring a generalized CMS.
- [x] Event theming can affect approved public tokens without replacing ChartStead structure or accessibility rules.
- [x] Unpublished, private, committee-only, and incomplete onboarding data never leaks publicly.
- [x] Acceptance tests cover revision rendering, filters, responsive layouts, embed output, calendar output, and data privacy.

## Comments

Publication, unpublish, restore, public-delta review, and linked calendar consequences are owned by Course Check 06 — Program Publication Course Check.

### Demo (Ticket 09)

- Full page: http://100.105.117.93:5177/e/pacific-open-data-summit-2026/program
- Embed: http://100.105.117.93:5177/e/pacific-open-data-summit-2026/program/embed
- Branch/worktree: `ticket-09-public-program` / `.worktrees/ticket-09-public-program`
- Not committed (ask to commit)

### What to test

1. Open the full-page program — seeded revision with keynote, ops talk, workshop (TBD), day-2 closing.
2. Filter by day / track / room / type / speaker; counts update.
3. Select a session — detail shows time/room/track/description/speakers + Add to calendar `.ics` (stable `UID`).
4. Workshop session shows **TBD** time and **Location pending**.
5. Open embed route — same renderer, minimal chrome, no organizer nav.
6. Resize narrow — filters and layout stack.
7. Confirm no emails, committee notes, or onboarding fields in Network → `/api/.../program` JSON.
