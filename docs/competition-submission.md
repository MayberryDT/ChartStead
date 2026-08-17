# Competition submission package

Paste-ready material for the open-source competition form and judges.

## One-liner

**ChartStead** is conference programming software: CFP → shared review → acceptance Course Check → speaker portal → agenda → public program, with optional Airtable sync and a full authenticated HTTP API for scoped agents.

## Links

| Item | Value |
| --- | --- |
| Forge repository | https://forge.smol.ai/tylermayberry/ChartStead |
| GitHub mirror | https://github.com/MayberryDT/ChartStead |
| License | MIT (`LICENSE`) |
| **Demo evaluator entry (no login)** | https://demo.chartstead.com/demo |
| Production | https://app.chartstead.com |
| Walkthrough | [competition-walkthrough.md](./competition-walkthrough.md) |
| Course Check deep dive | [course-check-killer-walkthrough.md](./course-check-killer-walkthrough.md) |
| HTTP API | [http-api-v1.md](./http-api-v1.md) |
| Agent / Course Check API | [course-check-agent-api-v1.md](./course-check-agent-api-v1.md) |
| Airtable template | [airtable-base-template.md](./airtable-base-template.md) |

## Seeded demo event

- **Pacific Open Data Summit 2026** (`pacific-open-data-summit-2026`)
- 36 submissions, 5 tracks, 3 rooms, 14 seeded speakers, and a populated public program
- Second event: **AI Engineer World's Fair 2026**; third event: **Civic Tech Summit 2026**

## What works without external secrets

- Labeled organizer, track-reviewer, and signed-link speaker demo journeys
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

**Demo path for judges:** Open the demo URL → choose organizer, track reviewer, or accepted speaker → for the full operational spine, enter Organizer, filter **Course Check Demo** on Submissions, run Apply decisions, place sessions on Agenda, and open public Program. Full script in the walkthrough doc.

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
curl -sS https://demo.chartstead.com/api/health
curl -sS https://demo.chartstead.com/api/v1/health
```
