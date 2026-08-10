# ChartStead

Conference programming and speaker management.

## Requirements

- Node.js 22.12 or newer
- npm 10 or newer
- A Cloudflare account for remote deployment

## App entry points

- React client: `src/main.tsx` → `src/App.tsx`
- Production Worker: `worker/index.ts` (Better Auth + membership checks; no demo bypass)
- Demo Worker: `worker/demo.ts` (isolated disposable demo-admin principal)
- Shared event contract: `shared/events.ts`
- Durable Object event store: `worker/event-store.ts`
- Auth configuration: `worker/auth.ts`
- D1 migrations: `migrations/`
- Cloudflare bindings: `wrangler.jsonc`

## Environment variables

Copy `.dev.vars.example` to `.dev.vars`. Names only — never commit values:

| Name | Purpose |
| --- | --- |
| `BETTER_AUTH_URL` | Public origin used by Better Auth callbacks |
| `BETTER_AUTH_SECRET` | Better Auth signing secret (≥32 characters) |
| `GOOGLE_CLIENT_ID` | Google OAuth client id |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `RESEND_API_KEY` | Resend API key for magic-link delivery |
| `AUTH_EMAIL_FROM` | From address for magic-link email |

Remote production and demo Workers use the same secret names via `wrangler secret put`. Binding names (not secrets) live in `wrangler.jsonc`: `AUTH_DB`, `EVENT_STORE`, and environment-specific D1 database ids.

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars
npm run cf-typegen
npx wrangler d1 migrations apply chartstead-auth --local
npm run dev
```

Production auth requires the variables above. Register Google callbacks for:

- `http://localhost:5173/api/auth/callback/google`
- `https://chartstead.mayberrydt.workers.dev/api/auth/callback/google`

After first sign-in, grant organizer access by inserting the Better Auth user id into `event_memberships` on the production D1 database.

The production entrypoint has no demo bypass. For the isolated demo path:

```bash
npm run dev:demo
```

## Commands

- `npm run dev` — production-shaped local Worker and React development
- `npm run dev:demo` — isolated demo-admin entrypoint
- `npm test` — UI, Worker/Durable Object, and Playwright smoke tests
- `npm run typecheck` — TypeScript and Cloudflare binding checks
- `npm run build` — production Worker and client build
- `npm run deploy:dry` — build and validate a Cloudflare deployment without publishing
- `npm run deploy` — deploy the default (production) Worker
- `npm run deploy:demo` — build and deploy the isolated demo Worker (`CLOUDFLARE_ENV=demo`)

## Persistence

- Better Auth users, sessions, accounts, and event memberships use D1.
- Event operational data uses SQLite-backed Durable Objects.
- Seed data is inserted once per event Durable Object (`seedIfEmpty`) and does not overwrite later operational writes.
- Local Cloudflare state is stored under `.wrangler/state` and can be removed to reset local data.

Production and demo use distinct checked-in D1 resource IDs and separate Durable Object namespaces. Keep all secrets in `.dev.vars` locally and Cloudflare secrets remotely.

## Project sources

- Product requirements: `context.md`
- Locked build plan: `context/BUILD-PLAN.md`
- Design system: `design/DESIGN.md`
- Visual source of truth: `design/source-of-truth/organizer-submissions.html`
- Current implementation ticket: `.scratch/chartstead-competition-build/issues/01-walking-skeleton-and-seeded-event.md`
