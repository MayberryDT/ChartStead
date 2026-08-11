# ChartStead HTTP API v1

Authenticated HTTP foundation over the competition vertical slice. UI routes under `/api/events/...` remain supported; agents and integrations should prefer **`/api/v1`**.

Full Course Check plan/approval/execute parity for agents is Course Check 08. Ticket 10 ships stable resource access with the same event-role authorization as the organizer UI.

## Authentication

1. **Session cookie** — Better Auth organizer session (same as the UI).
2. **Bearer API key** — `Authorization: Bearer cs_live_…`

Mint an event-scoped admin key (session required):

```http
POST /api/v1/events/:eventId/api-keys
Content-Type: application/json

{ "name": "CI automation" }
```

Response includes the raw token **once**. Keys are stored hashed in D1 (`api_keys`).

## Authorization

- Event membership required (`admin` or `reviewer`).
- Reviewers only see assigned-track submissions; off-track detail returns **404**.
- Speakers, tasks, communications, agenda placement, and Airtable admin require **admin**.
- Committee notes appear only on organizer/admin submission payloads — never on public program or speaker portal routes.

## Stable identifiers

All resources use ChartStead ids (`event` slug, `SUB-…` submissions, UUID speakers/sessions/tasks). Mutable titles and emails are never identity.

## Endpoints

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/v1/health` | public |
| GET | `/api/v1/events` | member |
| GET | `/api/v1/events/:eventId` | member |
| GET | `/api/v1/events/:eventId/forms` | admin |
| GET | `/api/v1/events/:eventId/forms/:formId` | admin |
| GET | `/api/v1/events/:eventId/submissions` | member (track-scoped) |
| GET | `/api/v1/events/:eventId/submissions/:submissionId` | member (track-scoped) |
| PATCH | `/api/v1/events/:eventId/submissions/:submissionId/review` | member (track-scoped) |
| GET | `/api/v1/events/:eventId/speakers` | admin |
| GET | `/api/v1/events/:eventId/sessions` | admin |
| PATCH | `/api/v1/events/:eventId/sessions/:sessionId` | admin |
| GET | `/api/v1/events/:eventId/tasks` | admin |
| GET | `/api/v1/events/:eventId/communications` | admin |
| GET | `/api/v1/events/:eventId/program` | member |
| GET | `/api/v1/events/:eventId/integrations/airtable` | admin |
| POST | `/api/v1/events/:eventId/integrations/airtable/pull` | admin |
| POST | `/api/v1/events/:eventId/api-keys` | admin |

## Example

```bash
curl -sS \
  -H "Authorization: Bearer $CHARTSTEAD_API_KEY" \
  "https://chartstead.example/api/v1/events/pacific-open-data-summit-2026/submissions"
```
