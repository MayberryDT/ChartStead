# Competition submission package

Paste-ready material for the open-source competition form and judges.

## One-liner

**ChartStead** is conference programming software: CFP → shared review → acceptance Course Check → speaker portal → agenda → public program, with optional Airtable sync and a full authenticated HTTP API for scoped agents.

## Links

| Item | Value |
| --- | --- |
| Repository | https://forge.smol.ai/mayberrydt/ChartStead (or the public GitHub mirror if published) |
| License | MIT (`LICENSE`) |
| **Demo (no login)** | https://chartstead-demo.mayberrydt.workers.dev |
| Production | https://chartstead.mayberrydt.workers.dev |
| Walkthrough | [competition-walkthrough.md](./competition-walkthrough.md) |
| Course Check deep dive | [course-check-killer-walkthrough.md](./course-check-killer-walkthrough.md) |
| HTTP API | [http-api-v1.md](./http-api-v1.md) |
| Agent / Course Check API | [course-check-agent-api-v1.md](./course-check-agent-api-v1.md) |
| Airtable template | [airtable-base-template.md](./airtable-base-template.md) |

## Seeded demo event

- **Pacific Open Data Summit 2026** (`pacific-open-data-summit-2026`)
- ~57 submissions, 5 tracks (including **Course Check Demo** fixtures `SUB-PODS0048`–`0057`), 3 rooms
- Second event: **AI Engineer World's Fair 2026** for multi-event switch

## What works without external secrets

- Full organizer demo path (isolated demo-admin principal)
- Public CFP submit, submissions queue, internal approve/maybe/deny
- Course Check apply (internal outcomes), agenda with conflicts, public program
- Airtable **unconfigured** degraded state
- Authenticated API surface (session or API key on configured deploys)

## What needs provider setup

| Secret / binding | Purpose |
| --- | --- |
| `BETTER_AUTH_SECRET` | Sessions + signed submitter/portal links |
| `RESEND_API_KEY` + `AUTH_EMAIL_FROM` | Magic link + confirmation + Course Check email delivery |
| `GOOGLE_CLIENT_ID` / `SECRET` | Production Google sign-in |
| R2 `ASSETS` | File uploads |
| `AIRTABLE_*` | Optional sync (never blocks core path) |

Names only — see README and `.dev.vars.example`. Never commit values.

## Differentiation (Course Check)

Ordinary edits save immediately. **Final decisions, speaker communication, public publish, and related Airtable writes** go through **Course Check**: frozen plan versions, stage verbs, out-of-date detection, independent effect recovery, and the same contract for humans and scoped API agents. It is not a generic confirmation modal.

## Suggested form answers

**Problem:** Conference teams juggle CFP tools, spreadsheets, email, calendars, and a public schedule with no single authority for “what did we decide and who was told?”

**Solution:** ChartStead keeps operational truth in one place, separates deciding from telling, and makes irreversible/external steps reviewable before they leave the building.

**Demo path for judges:** Open the demo URL → filter **Course Check Demo** on Submissions → run Apply decisions → place sessions on Agenda → open public Program. Full script in the walkthrough doc.

**Tech:** React + Vite, Hono on Cloudflare Workers, Durable Object SQLite, R2, Better Auth, Resend + React Email outbox, optional Airtable.

## Verification commands (maintainers)

```bash
npm install
npm test
npm run typecheck
npm run deploy:dry
# optional live demo redeploy (requires Cloudflare auth):
# npm run deploy:demo
```

Live smoke (no auth on demo):

```bash
curl -sS https://chartstead-demo.mayberrydt.workers.dev/api/health
curl -sS https://chartstead-demo.mayberrydt.workers.dev/api/v1/health
```
