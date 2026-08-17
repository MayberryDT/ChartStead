# ChartStead HTTP API v1

Authenticated HTTP foundation over the competition vertical slice. UI routes under `/api/events/...` remain supported; agents and integrations should prefer **`/api/v1`**.

Course Check plan/approval/execute parity for scoped agents: **[course-check-agent-api-v1.md](./course-check-agent-api-v1.md)**. Agent handoff brief: **[course-check-agent-handoff-brief.md](./course-check-agent-handoff-brief.md)**.

## Authentication

1. **Session cookie** — Better Auth organizer session (same as the UI). On the **demo** Worker, the isolated demo-admin principal is used instead.
2. **Bearer API key** — `Authorization: Bearer cs_live_…`

Mint an event-scoped key (admin session or existing key with grant rights):

```http
POST /api/v1/events/:eventId/api-keys
Content-Type: application/json

{
  "name": "CI automation",
  "scopes": ["course_check:read", "course_check:write", "course_check:execute"],
  "operatingMode": "delegated_execution"
}
```

Response includes the raw token **once**. Keys are stored hashed in D1 (`api_keys`).

List and revoke:

```http
GET /api/v1/events/:eventId/api-keys
PATCH /api/v1/events/:eventId/api-keys/:keyId
Content-Type: application/json

{ "revoked": true }
```

## Authorization

- Event membership required (`admin` or `reviewer`), or a valid API key bound to that event.
- Reviewers only see assigned-track submissions; off-track detail returns **404**.
- Speakers, tasks, communications, agenda placement, Airtable admin, and API key minting require **admin** (or equivalent agent scopes).
- Committee notes appear only on organizer/admin submission payloads — never on public program or speaker portal routes.
- Production entrypoint (`worker/index.ts`) has **no** demo-admin bypass.

## Stable identifiers

All resources use ChartStead ids (`event` slug, `SUB-…` submissions, UUID speakers/sessions/tasks). Mutable titles and emails are never identity.

## Endpoints

### Health and discovery

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/v1/health` | public |
| GET | `/api/v1/events` | member |
| GET | `/api/v1/events/:eventId` | member |

`GET /api/v1/health` reports API version, stable-id flag, and closed Course Check action types / agent modes.

### Forms and submissions

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/v1/events/:eventId/forms` | admin |
| GET | `/api/v1/events/:eventId/forms/:formId` | admin |
| GET | `/api/v1/events/:eventId/submissions` | member (track-scoped) |
| GET | `/api/v1/events/:eventId/submissions/:submissionId` | member (track-scoped) |
| PATCH | `/api/v1/events/:eventId/submissions/:submissionId/review` | member (track-scoped) |

Review body (internal only — never sends email):

```json
{
  "status": "maybe",
  "committeeNote": "Strong abstract; check speaker availability."
}
```

`status` values align with organizer review: e.g. `submitted`, `approved`, `maybe`, `denied` (see `shared/events.ts`).

### Speakers, sessions, tasks, communications

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/v1/events/:eventId/speakers` | admin |
| GET | `/api/v1/events/:eventId/sessions` | admin |
| PATCH | `/api/v1/events/:eventId/sessions/:sessionId` | admin |
| GET | `/api/v1/events/:eventId/tasks` | admin |
| GET | `/api/v1/events/:eventId/communications` | admin |

Session placement patch accepts day/room/time fields and allows partial/`TBD` placement. Conflicts are warnings, not hard failures.

Speaker responses keep `name`, `email`, and `biography` as the current reusable identity. Their separate `participation` object contains this event's preserved title, organization, role, workflow status, travel preferences, and logistics fields.

### Public program (member + public UI route)

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/v1/events/:eventId/program` | member |

Unauthenticated public HTML/API for attendees uses `/api/events/:eventId/program` (and the React routes `/e/:eventId/program` and `/program/embed`). Payloads are filtered — no committee notes or internal delivery state.

### Airtable integration

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/v1/events/:eventId/integrations/airtable` | admin |
| PUT | `/api/v1/events/:eventId/integrations/airtable` | admin |
| DELETE | `/api/v1/events/:eventId/integrations/airtable` | admin |
| POST | `/api/v1/events/:eventId/integrations/airtable/pull` | admin |

When credentials are missing, GET reports **unconfigured**. Core app features remain available. Field map: [airtable-base-template.md](./airtable-base-template.md).

### API keys

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/v1/events/:eventId/api-keys` | admin |
| POST | `/api/v1/events/:eventId/api-keys` | admin |
| PATCH | `/api/v1/events/:eventId/api-keys/:keyId` | admin |

### Course Check action gate

| Method | Path | Role |
| --- | --- | --- |
| POST | `/api/v1/events/:eventId/course-checks/actions` | member / agent |

Validates closed `actionType` values (`decision`, `guaranteed_speaker`, `publication`, `communication`). Full create/approve/apply/retry routes live under the Course Check agent API doc (UI and v1 parity).

## Examples

### Health

```bash
curl -sS "$BASE/api/v1/health"
```

### List submissions (API key)

```bash
curl -sS \
  -H "Authorization: Bearer $CHARTSTEAD_API_KEY" \
  "$BASE/api/v1/events/pacific-open-data-summit-2026/submissions"
```

### Internal review (no email)

```bash
curl -sS -X PATCH \
  -H "Authorization: Bearer $CHARTSTEAD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"approved","committeeNote":"Ship it."}' \
  "$BASE/api/v1/events/pacific-open-data-summit-2026/submissions/SUB-PODS0001/review"
```

### Sessions + program

```bash
curl -sS -H "Authorization: Bearer $CHARTSTEAD_API_KEY" \
  "$BASE/api/v1/events/pacific-open-data-summit-2026/sessions"

curl -sS -H "Authorization: Bearer $CHARTSTEAD_API_KEY" \
  "$BASE/api/v1/events/pacific-open-data-summit-2026/program"
```

### Mint then revoke a key (session cookie)

```bash
# After signing in via the UI, reuse the session cookie:
curl -sS -X POST -b cookies.txt -H "Content-Type: application/json" \
  -d '{"name":"agent-demo"}' \
  "$BASE/api/v1/events/pacific-open-data-summit-2026/api-keys"

curl -sS -X PATCH -b cookies.txt -H "Content-Type: application/json" \
  -d '{"revoked":true}' \
  "$BASE/api/v1/events/pacific-open-data-summit-2026/api-keys/$KEY_ID"
```

`$BASE` examples:

- Demo: `https://demo.chartstead.com`
- Local: `http://127.0.0.1:5173`
