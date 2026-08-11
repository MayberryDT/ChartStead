# ChartStead Airtable base template

Airtable is an **optional** synchronization target. ChartStead Durable Object SQLite remains the operational primary. The interactive app never depends on Airtable availability.

Consequential outbound Airtable writes and inbound consequence classification are owned by Course Check 07. This document covers the base template, field map, and pull foundation shipped in Competition Ticket 10.

## Create the base

1. In Airtable, create a base named **ChartStead Program**.
2. Create the tables and fields below (names are exact — they match `shared/airtable-field-map.ts`).
3. Copy the base id (`app…`) from Airtable base settings.
4. Create a personal access token with `data.records:read` on that base (write scopes come later with Course Check 07).
5. In ChartStead: open the event → **Settings** → paste Base ID + token → **Connect and pull**.

Credentials are stored per event in ChartStead (token is never shown again in the UI). Optional worker env vars `AIRTABLE_ACCESS_TOKEN` / `AIRTABLE_BASE_ID` still work as a fallback for ops, but Settings is the normal path.

## Tables and field map

Every table includes a **ChartStead … ID** field. That value is the stable ChartStead identifier. Never use Airtable record ids or display names as ChartStead identity.

### Events

| Airtable field | ChartStead field | Pull wins |
| --- | --- | --- |
| ChartStead Event ID | `id` (link key) | — |
| Name | `name` | yes |
| Starts On | `startsOn` | yes |
| Ends On | `endsOn` | yes |

Local-only (never overwritten by pull): `submissionCount`, `unreviewedCount`, `tracks`, `rooms`, `themeAccent`.

### Submissions

| Airtable field | ChartStead field | Pull wins |
| --- | --- | --- |
| ChartStead Submission ID | `id` (e.g. `SUB-…`) | — |
| Title | `title` | yes |
| Abstract | `abstract` | yes |
| Track ID | `trackId` | yes |
| Speaker Name | `speakerName` | yes |
| Speaker Email | `speakerEmail` | yes |
| Biography | `biography` | yes |
| Supporting Link | `supportingLink` | yes |

Local-only: `status`, `programOutcome`, `committeeNote`, `privateNote`, `reviewVersion`, confirmation/outbox state, form version, answers bag, co-speakers, files.

### Speakers

| Airtable field | ChartStead field | Pull wins |
| --- | --- | --- |
| ChartStead Speaker ID | `id` | — |
| Name | `name` | yes |
| Email | `email` | yes |
| Biography | `biography` | yes |

### Sessions

| Airtable field | ChartStead field | Pull wins |
| --- | --- | --- |
| ChartStead Session ID | `id` | — |
| Title | `title` | yes |
| Format | `format` | yes |
| Track ID | `trackId` | yes |
| Room ID | `roomId` | yes |
| Starts At | `startsAt` | yes |
| Ends At | `endsAt` | yes |

Local-only: calendar UID/sequence, course-check plan linkage, speaker membership.

### Tasks

| Airtable field | ChartStead field | Pull wins |
| --- | --- | --- |
| ChartStead Task ID | `id` | — |
| Title | `title` | yes |
| Instructions | `instructions` | yes |
| Due At | `dueAt` | yes |
| Status | `status` (`open` / `completed`) | yes |

## Pull behavior

- Pull runs on admin **Retry pull**, and can run on interval when configured (cron).
- **Airtable wins** only for mapped pull-wins fields on rows that already exist in ChartStead and carry a matching ChartStead id.
- Pull never creates local rows from unknown Airtable records in Ticket 10 (link-by-id only).
- Unconfigured, rate-limited, or failed Airtable leaves ChartStead fully usable. Settings shows `unconfigured` / `healthy` / `pending` / `delayed` / `failed` with recovery guidance.

## Code references

- Template + map: `shared/airtable-field-map.ts`
- Sync state types: `shared/airtable.ts`
- Client + pull: `worker/airtable/`
- Admin UI: Settings → Airtable sync
- HTTP: `GET/POST /api/events/:eventId/integrations/airtable[ /pull ]` and `/api/v1/...` twins
