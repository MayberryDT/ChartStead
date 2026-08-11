# 09 — Public program renderer and embed

**What to build:** A responsive public-program renderer for approved immutable revisions, with useful filters, stable session details, calendar actions, and a simple embeddable presentation using the same renderer.

**Blocked by:** 06 — Onboarding and assisted chasing; 08 — Fluid agenda builder.

**Status:** ready-for-agent

- [ ] The renderer can display a selected immutable public revision without owning publication transitions.
- [ ] The public schedule shows only publishable sessions and current approved speaker information.
- [ ] The public speaker lineup uses consistent headshots, names, biographies, and session links.
- [ ] Attendees can filter the schedule by day, track, room, type, or speaker where data exists.
- [ ] Session details include time or `TBD`, room or pending location, track, description, and all speakers.
- [ ] Add-to-calendar output uses the session's stable public calendar identity.
- [ ] Public pages are usable and visually coherent on desktop and mobile.
- [ ] A simple embed uses the same data and renderer without requiring a generalized CMS.
- [ ] Event theming can affect approved public tokens without replacing ChartStead structure or accessibility rules.
- [ ] Unpublished, private, committee-only, and incomplete onboarding data never leaks publicly.
- [ ] Acceptance tests cover revision rendering, filters, responsive layouts, embed output, calendar output, and data privacy.

## Comments

Publication, unpublish, restore, public-delta review, and linked calendar consequences are owned by Course Check 06 — Program Publication Course Check.
