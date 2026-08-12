# Competition walkthrough

Judge-facing path through ChartStead from public CFP to published program. Uses the seeded **Pacific Open Data Summit 2026** event on the isolated demo Worker.

## URLs

| Surface | URL |
| --- | --- |
| **Deployed demo** | https://chartstead-demo.mayberrydt.workers.dev |
| Production (auth required) | https://chartstead.mayberrydt.workers.dev |
| Local demo | `npm run dev:demo -- --host 0.0.0.0 --port 5173` → `http://100.105.117.93:5173` |

Event id: `pacific-open-data-summit-2026`  
Demo principal: **Demo Administrator** (no Google/magic-link on the demo entrypoint).

Deep Course Check narrative: [course-check-killer-walkthrough.md](./course-check-killer-walkthrough.md).

## Uninterrupted path (about 15 minutes)

### 1. Organizer shell

1. Open the demo root.
2. Confirm **Pacific Open Data Summit 2026**, sidebar **ChartStead**, and **Demo Administrator**.
3. Note submission / track / room counts (seed starts at **57** submissions, **5** tracks including Course Check Demo, **3** rooms).

### 2. Published CFP (public)

1. Open `/e/pacific-open-data-summit-2026/cfp`.
2. Confirm the live form (title, abstract, track, format, speakers, optional file).
3. Optional builder check (admin): `/e/.../cfp/builder` — draft edits must not change the public form until **Publish**.

### 3. Submit a proposal

1. Fill a talk or workshop and submit.
2. Land on the confirmation page with a stable `SUB-…` id.
3. Reload — confirmation and id remain.

### 4. Submissions queue

1. Open `/e/.../submissions`.
2. Search by the new id or title; open the inspector.
3. Confirm full answers (and upload metadata if you attached a file).
4. On mobile (≈390px), open a row, use **Back to queue**, confirm focus returns.

### 5. Internal review (no email)

1. Set **Maybe** or **Approve** on a proposal.
2. Save a committee note.
3. Confirm the toast states that **no speaker email is sent**.
4. Reload — decision and note persist under **Review history**.

### 6. Acceptance Course Check (seeded fixtures)

Use track **Course Check Demo** (`SUB-PODS0048`–`SUB-PODS0057`):

1. Multi-select accepts/declines → open **Course Check**.
2. Confirm a full-page workspace (not a modal): evidence, stages, plan state.
3. **Apply decisions** — speakers/sessions/tasks appear; **no email sent**.
4. Optional: open linked Communication Course Check and stop after **Create drafts**.

Details: [course-check-killer-walkthrough.md](./course-check-killer-walkthrough.md).

### 7. Speaker portal shape

1. After accept, onboarding/tasks exist for speakers.
2. Portal is signed-link only (`/e/.../portal/<token>`). Bad tokens show a safe error — no committee leakage.

### 8. Agenda

1. Open `/e/.../agenda`.
2. Place or move a session; leave another **unplaced** / **TBD**.
3. Force a room overlap if desired — conflict **saves** with a live count (no blocking modal).
4. Prefer keyboard **Move Session** once.

### 9. Publish public program

1. Run **Publish program** (Program Publication Course Check) or, in automated tests, the valid-subset publish path.
2. Open public `/e/.../program` and `/e/.../program/embed`.
3. Confirm only public fields (titles, speakers as published, schedule) — no committee notes, internal status, or emails.

### 10. Airtable optional

1. Settings → Airtable should show **unconfigured** when secrets are absent.
2. Core path (submit → review → accept → agenda → program) still works.
3. Template + field map: [airtable-base-template.md](./airtable-base-template.md).

### 11. HTTP API smoke

```bash
curl -sS https://chartstead-demo.mayberrydt.workers.dev/api/v1/health
curl -sS https://chartstead-demo.mayberrydt.workers.dev/api/events/pacific-open-data-summit-2026/program
```

Authenticated vertical slice: [http-api-v1.md](./http-api-v1.md).  
Scoped agents / Course Check: [course-check-agent-api-v1.md](./course-check-agent-api-v1.md).

### 12. Provider honesty

| Capability | Without secrets | With secrets |
| --- | --- | --- |
| Demo organizer UI | Full (demo principal) | Same |
| Production UI | Sign-in required | Google / magic-link |
| Confirmation email | Outbox **queued** | Resend delivery via cron |
| Calendar ICS | Generated in Course Check / fixtures | Same payload; client import |
| Uploads | Needs R2 `ASSETS` bucket | Works |
| Airtable | Degraded / unconfigured | Pull + Course Check effects |

## Automated evidence

```bash
npm test
npm run test:e2e -- test/e2e/competition-spine.spec.ts
npm run test:e2e -- test/e2e/accessibility.spec.ts
npm run test:worker -- test/worker/course-check-killer-demo.test.ts
npm run test:worker -- test/worker/demo-isolation.test.ts
```

## What not to expect

- Visual polish tickets (Competition 12–19) are human-tandem and separate.
- Live Resend/Airtable are optional gates — unit/worker tests use injected clients.
- Production has **no** demo-admin bypass (`worker/index.ts` vs `worker/demo.ts`).
