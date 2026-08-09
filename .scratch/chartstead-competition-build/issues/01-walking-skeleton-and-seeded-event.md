# 01 — Walking skeleton and seeded event

**What to build:** A deployable ChartStead application that opens in the locked Harbor Master Desk organizer shell, authenticates an organizer, persists operational data, and lets the organizer open a realistic seeded event. This establishes one working path through the browser, HTTP API, Cloudflare runtime, and Durable Object storage.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] The application runs locally and deploys through the selected Cloudflare architecture.
- [ ] The organizer shell matches the locked source-of-truth structure, hierarchy, spacing, and navigation behavior.
- [ ] An organizer can authenticate through the production auth engine; the documented demo-admin path is deliberate and isolated.
- [ ] An organizer can open the seeded event and see its dates, tracks, rooms, and realistic summary data.
- [ ] Event data survives a page reload through Durable Object SQLite.
- [ ] Event-scoped authorization prevents an unauthenticated user from reading organizer data.
- [ ] A deployed-equivalent smoke test covers sign-in, event selection, persistence, and shell rendering.
- [ ] The repository documents the app entry points, local commands, environment-variable names, and deployment command without including credentials.

## Comments
