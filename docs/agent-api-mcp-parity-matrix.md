# Agent API + MCP parity matrix (Course Check 25)

Organizer desk capabilities reachable by a scoped agent. **Human UI/session**, **HTTP bearer `/api/v1`**, and **MCP** (`chartstead_event_api` or a dedicated tool) must produce equivalent durable outcomes under the same scopes and mode.

Connection: [ai-connections.md](./ai-connections.md). Contracts: [http-api-v1.md](./http-api-v1.md), [course-check-agent-api-v1.md](./course-check-agent-api-v1.md). QA script: [course-check-agent-handoff-brief.md](./course-check-agent-handoff-brief.md).

## Legend

| Column | Meaning |
| --- | --- |
| UI | Organizer desk surface |
| HTTP | Path under `/api/v1/events/:eventId` (or Course Check twin under `/api/events/.../course-checks`) |
| MCP | Tool + relative path for `chartstead_event_api` |
| Scopes / mode | Course Check scopes and agent mode when the action is consequential |
| Activity | How attribution appears in Settings → Activity (Course Check 24) |

**Intentional non-goals (blocked from agents / MCP):** minting or revoking API keys; creating/updating/deleting Airtable credentials (`/api-keys`, `/integrations`). Agents may still *execute* Airtable consequence stages when scoped.

## Matrix

| UI action | HTTP | MCP | Scopes / mode | Activity / attribution |
| --- | --- | --- | --- | --- |
| Health / discovery | `GET /api/v1/health` | n/a (HTTP) | none | — |
| List event workspaces | `GET /events` | `chartstead_event_api` `GET /` (event list is top-level; prefer HTTP) | member | — |
| Read event | `GET /events/:id` | via session/HTTP | member | — |
| List / open CFP forms | `GET /forms`, `GET /forms/:formId` | `chartstead_event_api` `GET /forms` | admin | — |
| List / open submissions | `GET /submissions`, `GET /submissions/:id` | `chartstead_list_event_work` `submissions` or `event_api` | member (track-scoped) | — |
| Soft lean / committee note | `PATCH /submissions/:id/review` | `chartstead_event_api` `PATCH /submissions/:id/review` | member | Audit under agent id; also under initiating human when `X-ChartStead-Initiating-Human` set. Label: `{agent} (agent on behalf of {person})` |
| Recusal | `POST /submissions/:id/recusal` | `chartstead_event_api` `POST /submissions/:id/recusal` | member | Same attribution rules |
| List speakers | `GET /speakers` | `chartstead_list_event_work` `speakers` | admin | — |
| List sessions | `GET /sessions` | `chartstead_list_event_work` `sessions` | admin | — |
| Place / patch session | `PATCH /sessions/:id` | `chartstead_event_api` `PATCH /sessions/:id` | admin | Agenda audit by actor id (human or agent name) |
| List tasks | `GET /tasks` | `chartstead_list_event_work` `tasks` | admin | — |
| List communications | `GET /communications` | `chartstead_list_event_work` `communications` | admin | — |
| Read program | `GET /program` | `chartstead_list_event_work` `program` | member | — |
| Team activity by actor | `GET /organizer/activity?actorId=` | `chartstead_event_api` `GET /organizer/activity?actorId=` (query strings allowed) | member (admin sees all; reviewer self) | Feed includes agent-on-behalf rows when filtering the initiating human |
| List Course Checks | `GET .../course-checks` | `chartstead_list_course_checks` | any granted CC scope | — |
| Prepare decision (propose) | `POST .../course-checks/decisions` | `chartstead_prepare_decision` or `event_api` | `decisions` + propose_only ok | Mutation under agent; also under initiating human. Label on-behalf-of |
| Apply / revise / defer / drafts / send / retry / reconcile / compensate / Airtable stages | Course Check stage routes (see agent API doc) | `chartstead_event_api` `POST /course-checks/...` | matching scope + execution mode | Same; activity-by-actor for agent **and** initiating human |
| Airtable credential CRUD | `PUT/DELETE /integrations/airtable` | **blocked** | admin human only | — |
| API key mint / revoke | `POST/PATCH /api-keys` | **blocked** | admin human only | — |

## Provenance rules

1. Agents are distinct principals (`principalKind: "agent"`), never silent impersonation.
2. Optional header: `X-ChartStead-Initiating-Human: <id>|<Display Name>`.
3. Stored / displayed label via `formatCourseCheckActorLabel`:
   - with human → `{agent name} (agent on behalf of {person})`
   - without → `{agent name} (agent)`
4. Activity filter for a **person** includes rows where `actor_id` matches **or** `actor_json.initiatingHuman.id` matches.
5. Activity picker lists human members and agents that have written consequential activity.

## Automated coverage

`test/worker/agent-api-mcp-parity.test.ts` exercises high-value rows: read parity (HTTP vs MCP), soft lean attribution, decision create/apply via HTTP and MCP, activity-by-actor for initiating human and agent, propose-only / missing scope / revoke / credential path block regressions.
