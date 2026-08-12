# Automation access (API + MCP)

Organizers connect agents and automation to ChartStead through **Settings → Automation access**.

There are two equal methods that share the same scoped agent API key:

1. **API** — HTTP bearer calls to `/api/v1/…`
2. **MCP** — Streamable HTTP at `/mcp` with the same bearer token

This matches the simple pattern used by products like [Postiz](https://github.com/gitroomhq/postiz-app): create a key, copy a URL and Authorization header, paste into the client. There is no OAuth provider wizard, PKCE handoff, or unstyled setup page.

## Create access

1. Open the event → **Settings**.
2. Under **Automation access**, choose **API** or **MCP**.
3. Name the key, pick operating mode, and grant Course Check stages.
4. Click **Create API key** / **Create MCP token**.
5. **Copy the secret immediately** — it is shown once (`cs_live_…`).
6. **Revoke** from the table when access should end (live before the next call).

Defaults remain propose-only with no stages until you grant them (Course Check 08).

## API

```http
GET /api/v1/events/:eventId/course-checks
Authorization: Bearer cs_live_…
```

Optional provenance:

```http
X-ChartStead-Initiating-Human: user-id|Display Name
```

Full contract: [course-check-agent-api-v1.md](./course-check-agent-api-v1.md) and [http-api-v1.md](./http-api-v1.md).

## MCP

- **URL:** `https://<host>/mcp`
- **Auth:** `Authorization: Bearer cs_live_…`
- **Transport:** Streamable HTTP (JSON-RPC over POST)

### Cursor / generic config

```json
{
  "mcpServers": {
    "chartstead": {
      "url": "https://<host>/mcp",
      "headers": {
        "Authorization": "Bearer cs_live_…"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add --transport http chartstead https://<host>/mcp \
  --header "Authorization: Bearer cs_live_…"
```

### Tools

| Tool | Purpose |
| --- | --- |
| `chartstead_list_event_work` | Read submissions, speakers, sessions, tasks, communications, program |
| `chartstead_list_course_checks` | List Course Checks |
| `chartstead_prepare_decision` | Create a frozen decision plan (does not apply) |
| `chartstead_event_api` | Call a relative v1 event path under the key’s scopes |

Credential and integration-configuration paths are blocked from MCP tools. Course Check stage execution still re-checks scopes and mode on every call.

## Security notes

- Treat tokens like passwords; never commit them.
- Revocation is immediate on the next API or MCP request.
- Agents cannot mint other keys or manage Airtable credentials.
- Prefer propose-only until staff are ready to grant execution stages.
