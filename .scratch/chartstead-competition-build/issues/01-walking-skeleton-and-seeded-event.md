# 01 — Walking skeleton and seeded event

**What to build:** A deployable ChartStead application that opens in the locked Harbor Master Desk organizer shell, authenticates an organizer, persists operational data, and lets the organizer open a realistic seeded event. This establishes one working path through the browser, HTTP API, Cloudflare runtime, and Durable Object storage.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] The application runs locally and deploys through the selected Cloudflare architecture.
- [x] The organizer shell matches the locked source-of-truth structure, hierarchy, spacing, and navigation behavior.
- [x] An organizer can authenticate through the production auth engine; the documented demo-admin path is deliberate and isolated.
- [x] An organizer can open the seeded event and see its dates, tracks, rooms, and realistic summary data.
- [x] Event data survives a page reload through Durable Object SQLite.
- [x] Event-scoped authorization prevents an unauthenticated user from reading organizer data.
- [x] A deployed-equivalent smoke test covers sign-in, event selection, persistence, and shell rendering.
- [x] The repository documents the app entry points, local commands, environment-variable names, and deployment command without including credentials.

## Comments

### 2026-08-09 closeout

Verified on branch `ticket-01-walking-skeleton`:

- Fresh `npm test` (2 UI + 4 worker/DO + 1 Playwright), `npm run typecheck`, `npm run build`, `npm run deploy:dry`
- Deployed production `https://chartstead.mayberrydt.workers.dev` (sign-in surface; `/api/events` → 401)
- Deployed demo `https://chartstead-demo.mayberrydt.workers.dev` (demo-admin shell; seeded events; event switcher)
- Browser checks at 1280×800 and iPhone 12 Pro
- Seed path is insert-once (`seedIfEmpty`); DO mutation + eviction test proves no reseed overwrite
- Better Auth core D1 schema matches current official docs; long sessions configured (30d / 1d update)
- Production Google/magic-link login remains **credential-blocked** until host-local secrets + membership row are supplied; demo-admin is the deliberate isolated acceptance path for ticket 01
