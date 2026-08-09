# ChartStead

Conference programming and speaker management.

## Requirements

- Node.js 22.12 or newer
- npm 10 or newer
- A Cloudflare account for remote deployment

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars
npm run cf-typegen
npx wrangler d1 migrations apply chartstead-auth --local
npm run dev
```

Production auth requires a Better Auth secret, Google OAuth client, and Resend credentials for the magic-link fallback. Register callbacks for `http://localhost:5173/api/auth/callback/google` and `https://chartstead.mayberrydt.workers.dev/api/auth/callback/google`. Add the authenticated user's Better Auth ID to `event_memberships` before granting organizer access.

The production entrypoint has no demo bypass. To run the isolated demo entrypoint over local disposable bindings:

```bash
npm run dev:demo
```

## Commands

- `npm run dev` — production-shaped local Worker and React development
- `npm run dev:demo` — isolated demo-admin entrypoint
- `npm test` — UI and Worker/Durable Object behavior
- `npm run typecheck` — TypeScript and Cloudflare binding checks
- `npm run build` — production Worker and client build
- `npm run deploy:dry` — build and validate a Cloudflare deployment without publishing
- `npm run deploy` — deploy after real D1 IDs and secrets are configured

## Persistence

- Better Auth users, sessions, accounts, and event memberships use D1.
- Event operational data uses SQLite-backed Durable Objects.
- Local Cloudflare state is stored under `.wrangler/state` and can be removed to reset local data.

Production and demo use distinct checked-in D1 resource IDs and separate Durable Object namespaces. Keep all secrets in `.dev.vars` locally and Cloudflare secrets remotely.

## Project sources

- Product requirements: `context.md`
- Locked build plan: `context/BUILD-PLAN.md`
- Design system: `design/DESIGN.md`
- Visual source of truth: `design/source-of-truth/organizer-submissions.html`
- Current implementation ticket: `.scratch/chartstead-competition-build/issues/01-walking-skeleton-and-seeded-event.md`
