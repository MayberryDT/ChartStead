# Course Check agent API v1

Versioned authenticated contract for humans and scoped AI agents. Organizer UI routes under `/api/events/.../course-checks` and agent routes under `/api/v1/events/.../course-checks` share the same planning, authorization re-check, application, effect, failure, and audit kernel.

Full resource foundation: [http-api-v1.md](./http-api-v1.md).

## Principles

1. **Closed action types** — `decision`, `guaranteed_speaker`, `publication`, `communication`. Unknown types fail closed (`unknown_action_type`). Apply never invokes a model or reinterprets the frozen plan.
2. **Agents are distinct principals** — `principalKind: "agent"` with `agentId`, not silent human impersonation. Optional request provenance: header `X-ChartStead-Initiating-Human: <id>|<display name>`.
3. **No default consequential authority** — new agent keys are `propose_only` with **no** Course Check scopes until an administrator grants them.
4. **Scopes are per event and expanded** — granting `all` stores every individual scope on the durable grant.
5. **Modes** — `propose_only` | `delegated_execution` | `autonomous_policy`. Propose-only may create/revise/defer/inspect; it cannot apply, send, draft-freeze, retry, reconcile, compensate, or execute integrations.
6. **Revocation is live** — scopes and mode are re-checked immediately before every stage execution, including plans approved earlier.
7. **Event policy may tighten** approval (two-person, etc.) but cannot disable the baseline Course Check kernel.

## Scopes

| Scope | Capabilities |
| --- | --- |
| `decisions` | create/apply decision & guaranteed-speaker plans, revise, defer |
| `drafts` | create communication plans, create drafts stage, revise, defer |
| `sends` | Send messages |
| `calendars` | calendar delivery (includes send) |
| `publication` | create/apply publication plans |
| `integrations` | Airtable disposition + execute |
| `retries` | retry failed effects |
| `reconciliation` | reconcile unknown outcomes |
| `compensation` | correction / compensation Course Checks |
| `all` | expands to every row above (stored expanded) |

## Where organizers mint keys (UI)

**Settings → Agent API keys** in the organizer app.

1. Open the event → **Settings** (left nav).
2. In **Agent API keys**, set name, operating mode, and Course Check stages.
3. Click **Create agent key**.
4. **Copy the token immediately** — it is shown once.
5. Give the agent: base URL (this origin), `Authorization: Bearer <token>`, and optional `X-ChartStead-Initiating-Human: id|Name`.
6. **Revoke** from the same table when access should end (takes effect before the next stage call).

Default for a new key is propose-only; grant stages (or all) deliberately.

## Mint an agent key (HTTP)

```http
POST /api/v1/events/:eventId/api-keys
Content-Type: application/json

{
  "name": "Program ops agent",
  "principalKind": "agent",
  "agentMode": "delegated_execution",
  "courseCheckScopes": ["all"]
}
```

```http
GET /api/v1/events/:eventId/api-keys
```

Response (token once):

```json
{
  "apiKey": {
    "id": "…",
    "token": "cs_live_…",
    "principalKind": "agent",
    "agentMode": "delegated_execution",
    "courseCheckScopes": [
      "decisions", "drafts", "sends", "calendars", "publication",
      "integrations", "retries", "reconciliation", "compensation"
    ]
  }
}
```

### Update or revoke (takes effect before next execution)

```http
PATCH /api/v1/events/:eventId/api-keys/:keyId
Content-Type: application/json

{ "agentMode": "propose_only", "courseCheckScopes": ["decisions", "drafts"] }
```

```http
PATCH /api/v1/events/:eventId/api-keys/:keyId
{ "revoke": true }
```

## Endpoints (human UI prefix and agent v1 prefix)

Replace `{base}` with:

- Human / session: `/api/events/:eventId/course-checks`
- Agent / bearer: `/api/v1/events/:eventId/course-checks`

| Method | Path | Scope / notes |
| --- | --- | --- |
| GET | `{base}` | read (any granted scope or human member) |
| GET | `{base}/:planId` | read; reviewers get redacted communication evidence |
| POST | `{base}/decisions` | decisions |
| POST | `{base}/guaranteed-speakers` | decisions |
| POST | `{base}/communications` | drafts |
| POST | `{base}/publications` | publication |
| POST | `{base}/:planId/revise` | revise |
| POST | `{base}/:planId/defer` | defer |
| POST | `{base}/:planId/apply` | stage-scoped execute (`apply-decision`, `publish-program`, …) |
| POST | `{base}/:planId/create-drafts` | drafts execute |
| POST | `{base}/:planId/send` | sends |
| POST | `{base}/:planId/effects/:effectId/retry` | retries |
| POST | `{base}/:planId/effects/:effectId/reconcile` | reconciliation |
| POST | `{base}/:planId/effects/:effectId/correction` | compensation |
| POST | `{base}/:planId/airtable/disposition` | integrations (plan) |
| POST | `{base}/:planId/airtable/execute` | integrations (execute) |
| POST | `{base}/:planId/airtable/reconcile` | reconciliation |
| POST | `{base}/:planId/airtable/effects/:effectId/compensations` | compensation |
| POST | `/api/v1/events/:eventId/course-checks/actions` | validate closed action type |

All mutating calls require `idempotencyKey` (body or `Idempotency-Key` header). Stage execute calls require `planVersion`, `digest`, and `stageId` matching the frozen plan.

## Examples

### Human — Decision Course Check

```bash
curl -sS -X POST "$ORIGIN/api/events/$EVENT/course-checks/decisions" \
  -H "cookie: $SESSION" \
  -H "content-type: application/json" \
  -H "idempotency-key: human-dec-1" \
  -d '{"proposalId":"SUB-PODS0001","outcome":"accepted","idempotencyKey":"human-dec-1"}'
```

Apply decisions:

```bash
curl -sS -X POST "$ORIGIN/api/events/$EVENT/course-checks/$PLAN/apply" \
  -H "cookie: $SESSION" \
  -H "content-type: application/json" \
  -d '{"planVersion":1,"digest":"…","stageId":"apply-decision","idempotencyKey":"human-apply-1"}'
```

### Agent — propose only, then human executes

```bash
# Agent freezes the plan (no apply)
curl -sS -X POST "$ORIGIN/api/v1/events/$EVENT/course-checks/decisions" \
  -H "authorization: Bearer $AGENT_KEY" \
  -H "content-type: application/json" \
  -H "x-chartstead-initiating-human: user_1|Alex Organizer" \
  -d '{"proposalId":"SUB-PODS0001","outcome":"accepted","idempotencyKey":"agent-dec-1"}'

# Human or delegated agent applies the frozen digest
curl -sS -X POST "$ORIGIN/api/v1/events/$EVENT/course-checks/$PLAN/apply" \
  -H "authorization: Bearer $DELEGATED_KEY" \
  -H "content-type: application/json" \
  -d '{"planVersion":1,"digest":"…","stageId":"apply-decision","idempotencyKey":"agent-apply-1"}'
```

### Out-of-date recovery

If inputs changed, apply returns `409` with `code` such as `out_of_date` and `changedInputs`. Create a new plan version (revise or new create) and re-approve the new digest. Do not retry the old digest.

### Partial failure / unknown reconciliation

After `Send messages` or Airtable execute, inspect `effects[]` on the plan. Transient failures: `POST …/effects/:effectId/retry`. Ambiguous provider outcomes: `POST …/effects/:effectId/reconcile` (no blind retry). Successful effects are never re-dispatched.

### Compensation

```bash
curl -sS -X POST \
  "$ORIGIN/api/v1/events/$EVENT/course-checks/$PLAN/effects/$EFFECT/correction" \
  -H "authorization: Bearer $AGENT_KEY" \
  -H "content-type: application/json" \
  -d '{"reason":"Wrong recipient list","idempotencyKey":"comp-1"}'
```

Compensation opens a **new** Course Check; it does not erase the original effect.

### Publication

```bash
curl -sS -X POST "$ORIGIN/api/v1/events/$EVENT/course-checks/publications" \
  -H "authorization: Bearer $AGENT_KEY" \
  -H "content-type: application/json" \
  -d '{"operation":"publish","idempotencyKey":"pub-1"}'

curl -sS -X POST "$ORIGIN/api/v1/events/$EVENT/course-checks/$PLAN/apply" \
  -H "authorization: Bearer $AGENT_KEY" \
  -d '{"planVersion":1,"digest":"…","stageId":"publish-program","idempotencyKey":"pub-apply-1"}'
```

## Contract fields on every plan

- `id`, `eventId`, `actionType`, `state`, `version`, `digest`
- `createdBy` / approval / receipt `actor` (`kind`, optional `agentId`, `agentMode`, `initiatingHuman`)
- `body` frozen deltas, findings, stages, effect identities
- `approval`, `receipt`, `versions`, `mutations`

## Error codes

| code | meaning |
| --- | --- |
| `unauthorized` | missing/invalid auth |
| `missing_authority` | human lacks admin |
| `missing_scope` | agent lacks stage scope |
| `propose_only` | agent mode forbids execution |
| `unknown_action_type` | action not in closed set |
| `out_of_date` | plan digest/inputs stale |

Event policy may add stricter approval requirements; it cannot remove Course Check for consequential stages or open a privileged bypass.
