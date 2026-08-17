# ChartStead

Conference programming and speaker management: CFP → shared review → Course Check acceptance → speaker portal → agenda → public program, with optional Airtable sync and an authenticated HTTP API for scoped agents.

## Live demos

| Environment | URL | Auth |
| --- | --- | --- |
| **Demo (judges)** | https://demo.chartstead.com/demo | Isolated demo-admin (no login) |
| Production | https://app.chartstead.com | Better Auth (Google / magic link) |

The previous demo host `https://chartstead-demo.mayberrydt.workers.dev` permanently redirects (308) to `https://demo.chartstead.com`. The previous production host `https://chartstead.mayberrydt.workers.dev` permanently redirects (308) to `https://app.chartstead.com`.

**Public docs:** https://chartstead.com/docs/ (docmd, in the marketing site repo)  
**Competition walkthrough:** [docs/competition-walkthrough.md](docs/competition-walkthrough.md)  
**Submission package (form blurbs):** [docs/competition-submission.md](docs/competition-submission.md)  
**Course Check deep dive:** [docs/course-check-killer-walkthrough.md](docs/course-check-killer-walkthrough.md)

## Source repositories

- **Forge:** https://forge.smol.ai/tylermayberry/ChartStead
- **GitHub:** https://github.com/MayberryDT/ChartStead

Both repositories publish the same `main` source tree. Forge is the competition-native mirror; GitHub is the public source mirror.

## Requirements

- Node.js 22.12 or newer
- npm 10 or newer
- A Cloudflare account for remote deployment

## App entry points

- React client: `src/main.tsx` → `src/App.tsx`
- Production Worker: `worker/index.ts` (Better Auth + membership checks; **no** demo bypass)
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
| `BETTER_AUTH_SECRET` | Better Auth signing secret (≥32 characters). **Required for signed submitter edit links** — proposal submissions return `503` without it. |
| `GOOGLE_CLIENT_ID` | Google OAuth client id |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `RESEND_API_KEY` | Resend API key for magic-link auth and submission confirmation delivery |
| `AUTH_EMAIL_FROM` | From address for magic-link auth and confirmation email |
| `AIRTABLE_ACCESS_TOKEN` | Optional Airtable personal access token for pull sync |
| `AIRTABLE_BASE_ID` | Optional Airtable base id for the ChartStead Program template |

Remote production and demo Workers use the same secret names via `wrangler secret put`. Binding names (not secrets) live in `wrangler.jsonc`: `AUTH_DB`, `EVENT_STORE`, `ASSETS`, and environment-specific D1 / R2 resource ids.

Airtable is optional. When unset, Settings shows **unconfigured** and the core app stays fully usable. Base template and field map: `docs/airtable-base-template.md`. Authenticated HTTP API: `docs/http-api-v1.md`.

### Deployment gates

- **`BETTER_AUTH_SECRET`** must be set before public submissions work. Without it, the Worker refuses to create proposals (signed edit links cannot be issued) and returns `503`.
- **`RESEND_API_KEY` + `AUTH_EMAIL_FROM`** are required for real confirmation email delivery. When either is missing, confirmation messages stay **queued** in the Durable Object outbox (they are not pretended sent). A `*/5 * * * *` cron flushes due outbox rows when Resend is configured.
- **`ASSETS` R2 buckets** (`chartstead-assets` default, `chartstead-assets-demo` for demo) must exist before file uploads work.
- **`AIRTABLE_*`** are optional. Missing values leave sync degraded (`unconfigured`); they never block submissions, review, agenda, or public program.
- Local Worker tests inject an in-memory email sender. They prove outbox state transitions and React Email rendering; they do **not** prove live Resend provider delivery.
- Local Worker tests inject an in-memory Airtable client for mapping, pull precedence, and degraded-state contracts. They do **not** call live Airtable.

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
- `http://localhost:5858/api/auth/callback/google`
- `https://app.chartstead.com/api/auth/callback/google`

After first sign-in, grant organizer access by inserting the Better Auth user id into `event_memberships` on the production D1 database.

The production entrypoint has no demo bypass. For the isolated demo path:

```bash
npm run dev:demo -- --host 0.0.0.0 --port 5173
```

Share Tailscale URLs as `http://100.105.117.93:5173/…` — never localhost — for human review.

## Remote deploy and migrations

```bash
# Typecheck + validate package without publishing
npm run deploy:dry

# Production Worker (worker/index.ts)
npx wrangler d1 migrations apply chartstead-auth --remote
npm run deploy
# secrets (once per env):
# npx wrangler secret put BETTER_AUTH_SECRET
# npx wrangler secret put GOOGLE_CLIENT_ID
# npx wrangler secret put GOOGLE_CLIENT_SECRET
# npx wrangler secret put RESEND_API_KEY
# npx wrangler secret put AUTH_EMAIL_FROM
# optional: AIRTABLE_ACCESS_TOKEN, AIRTABLE_BASE_ID

# Demo Worker (worker/demo.ts, separate D1/R2/DO namespace)
npx wrangler d1 migrations apply chartstead-auth-demo --remote --env demo
npm run deploy:demo
# same secret names under --env demo
```

### Seed and reset

- Event operational data is seeded **once per Durable Object** via `seedIfEmpty` / `seedProposalsIfNeeded` / Course Check demo fixtures. Later operational writes are not overwritten by seed.
- **Local reset:** stop the dev server and remove `.wrangler/state`, then restart `npm run dev:demo`.
- **Remote reset:** Durable Object SQLite is not wiped by redeploy. To force a fresh seed, use a new DO namespace / binding in `wrangler.jsonc` (deliberate ops change) or delete the DO via Cloudflare dashboard tooling. Prefer a new demo namespace only when you intend to discard live demo state.
- D1 holds auth users, sessions, memberships, and API keys — apply migrations before expecting sign-in or API keys.

### Provider setup notes

| Provider | Setup |
| --- | --- |
| Resend | Verify sending domain; set `AUTH_EMAIL_FROM` to an allowed from-address |
| Google OAuth | Web client; authorized redirect URIs for each public origin |
| R2 | Create `chartstead-assets` and `chartstead-assets-demo`; bindings already named in `wrangler.jsonc` |
| Airtable | Optional base from `docs/airtable-base-template.md`; PAT with base access |

## Verification checklist

```bash
# Automated
npm test
npm run typecheck
npm run deploy:dry

# Live demo smoke (no secrets required for health)
curl -sS https://demo.chartstead.com/api/health
curl -sS https://demo.chartstead.com/api/v1/health
curl -sS https://demo.chartstead.com/api/events | head -c 200   # demo principal lists events
curl -sS -o /dev/null -w "%{http_code}\n" \
  https://demo.chartstead.com/e/pacific-open-data-summit-2026/cfp
curl -sS -o /dev/null -w "%{http_code}\n" \
  https://demo.chartstead.com/e/pacific-open-data-summit-2026/program
# Legacy workers.dev host should 308 to the first-party origin
curl -sSI https://chartstead-demo.mayberrydt.workers.dev/demo | head

# Production must not expose organizer data unauthenticated
curl -sS -o /dev/null -w "%{http_code}\n" https://app.chartstead.com/api/events
# expect 401
# Legacy production host should 308 to the first-party origin
curl -sSI https://chartstead.mayberrydt.workers.dev/api/events | head
```

Manual UI path: [docs/competition-walkthrough.md](docs/competition-walkthrough.md).

Optional live Resend: submit a proposal with Resend configured and confirm delivery (or outbox **queued** if keys missing — both are honest).

Optional Airtable: leave unset and confirm Settings shows unconfigured while submissions still work.

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

## Documentation map

| Doc | Purpose |
| --- | --- |
| [docs/competition-walkthrough.md](docs/competition-walkthrough.md) | Judge path CFP → program |
| [docs/competition-submission.md](docs/competition-submission.md) | Form blurbs + links |
| [docs/course-check-killer-walkthrough.md](docs/course-check-killer-walkthrough.md) | Course Check fixtures |
| [docs/http-api-v1.md](docs/http-api-v1.md) | Authenticated vertical-slice API |
| [docs/course-check-agent-api-v1.md](docs/course-check-agent-api-v1.md) | Agent Course Check parity |
| [docs/airtable-base-template.md](docs/airtable-base-template.md) | Airtable template + field map |
| [context.md](context.md) | Product requirements |
| [context/BUILD-PLAN.md](context/BUILD-PLAN.md) | Locked architecture |
| [design/DESIGN.md](design/DESIGN.md) | Design system |
| [design/ORGANIZER-DESK-CHROME.md](design/ORGANIZER-DESK-CHROME.md) | Cross-screen organizer shell and work-surface contract |
| [design/source-of-truth/organizer-submissions.html](design/source-of-truth/organizer-submissions.html) | Visual SOT |
