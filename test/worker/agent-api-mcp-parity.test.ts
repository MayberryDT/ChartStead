import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { formatCourseCheckActorLabel, type CourseCheckPlan } from "../../shared/course-check";
import type {
  OrganizerActivityByActorResponse,
  OrganizerPrincipal,
  OrganizerProposal,
} from "../../shared/events";
import { createApp } from "../../worker/app";
import { ensureApiKeysTable } from "../../worker/api-keys";

const eventId = "pacific-open-data-summit-2026";
const humanId = "cc25-tyler";
const humanName = "Tyler";

const adminPrincipal = {
  id: "cc25-admin",
  displayName: "CC25 Administrator",
  role: "admin",
  eventIds: [eventId],
  rolesByEvent: { [eventId]: "admin" },
} satisfies OrganizerPrincipal;

const tokens = new Map<string, OrganizerPrincipal>();

const app = createApp({
  resolvePrincipal: async () => adminPrincipal,
  resolveApiKeyPrincipal: async (token) => tokens.get(token) ?? null,
  signingSecret: "course-check-25-parity-secret",
});

function bearerApp() {
  return createApp({
    resolvePrincipal: async () => null,
    resolveApiKeyPrincipal: async (token) => tokens.get(token) ?? null,
    signingSecret: "course-check-25-parity-secret",
  });
}

function agentPrincipal(input: {
  id: string;
  name: string;
  mode: "propose_only" | "delegated_execution" | "autonomous_policy";
  scopes: import("../../shared/agent-api").CourseCheckScope[];
  initiatingHuman?: { id: string; displayName: string } | null;
}): OrganizerPrincipal {
  return {
    id: input.id,
    displayName: input.name,
    role: "admin",
    eventIds: [eventId],
    rolesByEvent: { [eventId]: "admin" },
    principalKind: "agent",
    agentId: input.id,
    agentMode: input.mode,
    courseCheckScopesByEvent: { [eventId]: input.scopes },
    initiatingHuman: input.initiatingHuman ?? null,
  };
}

async function mcpCall(token: string, body: unknown, initiatingHuman?: string) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
  };
  if (initiatingHuman) headers["x-chartstead-initiating-human"] = initiatingHuman;
  return bearerApp().request(
    "https://chartstead.test/mcp",
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    env,
  );
}

async function mintAgentKey(input: {
  name: string;
  mode: "propose_only" | "delegated_execution";
  scopes: string[];
}) {
  const response = await app.request(
    `https://chartstead.test/api/v1/events/${eventId}/api-keys`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        principalKind: "agent",
        agentMode: input.mode,
        courseCheckScopes: input.scopes,
      }),
    },
    env,
  );
  expect(response.status).toBe(201);
  const body = await response.json<{
    apiKey: { id: string; token: string; courseCheckScopes: string[] };
  }>();
  return body.apiKey;
}

describe("Course Check 25 — agent API + MCP parity and activity", () => {
  beforeAll(async () => {
    await ensureApiKeysTable(env.AUTH_DB);
    const now = Date.now();
    await env.AUTH_DB.batch([
      env.AUTH_DB.prepare(`CREATE TABLE IF NOT EXISTS "user" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL UNIQUE,
        "emailVerified" INTEGER NOT NULL DEFAULT 0,
        "image" TEXT,
        "createdAt" INTEGER NOT NULL,
        "updatedAt" INTEGER NOT NULL
      )`),
      env.AUTH_DB.prepare(`CREATE TABLE IF NOT EXISTS "event_memberships" (
        "event_id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "role" TEXT NOT NULL CHECK ("role" IN ('admin', 'reviewer')),
        PRIMARY KEY ("event_id", "user_id")
      )`),
      env.AUTH_DB.prepare(
        `INSERT OR REPLACE INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES (?, ?, ?, 1, ?, ?)`,
      ).bind(humanId, humanName, "tyler-cc25@example.com", now, now),
      env.AUTH_DB.prepare(
        `INSERT OR REPLACE INTO event_memberships (event_id, user_id, role) VALUES (?, ?, 'admin')`,
      ).bind(eventId, humanId),
      env.AUTH_DB.prepare(
        `INSERT OR REPLACE INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES (?, ?, ?, 1, ?, ?)`,
      ).bind(adminPrincipal.id, adminPrincipal.displayName, "cc25-admin@example.com", now, now),
      env.AUTH_DB.prepare(
        `INSERT OR REPLACE INTO event_memberships (event_id, user_id, role) VALUES (?, ?, 'admin')`,
      ).bind(eventId, adminPrincipal.id),
    ]);
    const seed = await app.request(
      `https://chartstead.test/api/events/${eventId}`,
      undefined,
      env,
    );
    expect(seed.status).toBe(200);
  });

  it("matches HTTP and MCP reads for submissions and course checks", async () => {
    const apiKey = await mintAgentKey({
      name: "Parity reader",
      mode: "propose_only",
      scopes: ["decisions"],
    });
    tokens.set(
      apiKey.token,
      agentPrincipal({
        id: "parity-reader",
        name: "Parity reader",
        mode: "propose_only",
        scopes: ["decisions"],
      }),
    );

    const httpSubs = await bearerApp().request(
      `https://chartstead.test/api/v1/events/${eventId}/submissions`,
      { headers: { authorization: `Bearer ${apiKey.token}` } },
      env,
    );
    expect(httpSubs.status).toBe(200);
    const httpBody = await httpSubs.json<{ submissions: OrganizerProposal[] }>();

    const mcpSubs = await mcpCall(apiKey.token, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "chartstead_list_event_work",
        arguments: { eventId, resource: "submissions" },
      },
    });
    expect(mcpSubs.status).toBe(200);
    const mcpBody = await mcpSubs.json<{
      result: { isError?: boolean; structuredContent?: { submissions: OrganizerProposal[] } };
    }>();
    expect(mcpBody.result.isError).toBe(false);
    expect(mcpBody.result.structuredContent?.submissions?.length).toBe(
      httpBody.submissions.length,
    );

    const httpCc = await bearerApp().request(
      `https://chartstead.test/api/v1/events/${eventId}/course-checks`,
      { headers: { authorization: `Bearer ${apiKey.token}` } },
      env,
    );
    expect(httpCc.status).toBe(200);

    const mcpCc = await mcpCall(apiKey.token, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "chartstead_list_course_checks",
        arguments: { eventId },
      },
    });
    expect(mcpCc.status).toBe(200);
    const mcpCcBody = await mcpCc.json<{ result: { isError?: boolean } }>();
    expect(mcpCcBody.result.isError).toBe(false);
  });

  it("attributes soft leans as agent on behalf of the initiating human via HTTP and MCP", async () => {
    const apiKey = await mintAgentKey({
      name: "Soft lean agent",
      mode: "delegated_execution",
      scopes: ["decisions"],
    });
    const agentId = "soft-lean-agent";
    tokens.set(
      apiKey.token,
      agentPrincipal({
        id: agentId,
        name: "Soft lean agent",
        mode: "delegated_execution",
        scopes: ["decisions"],
      }),
    );

    const detail = await bearerApp().request(
      `https://chartstead.test/api/v1/events/${eventId}/submissions/SUB-PODS0003`,
      { headers: { authorization: `Bearer ${apiKey.token}` } },
      env,
    );
    expect(detail.status).toBe(200);
    const detailBody = await detail.json<{
      submission: { reviewVersion: number };
    }>();

    const expectedLabel = formatCourseCheckActorLabel({
      displayName: "Soft lean agent",
      kind: "agent",
      initiatingHuman: { id: humanId, displayName: humanName },
    });

    const patch = await bearerApp().request(
      `https://chartstead.test/api/v1/events/${eventId}/submissions/SUB-PODS0003/review`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${apiKey.token}`,
          "content-type": "application/json",
          "x-chartstead-initiating-human": `${humanId}|${humanName}`,
        },
        body: JSON.stringify({
          status: "maybe",
          expectedVersion: detailBody.submission.reviewVersion,
        }),
      },
      env,
    );
    expect(patch.status).toBe(200);

    const humanActivity = await app.request(
      `https://chartstead.test/api/events/${eventId}/organizer/activity?actorId=${humanId}`,
      undefined,
      env,
    );
    expect(humanActivity.status).toBe(200);
    const humanBody = await humanActivity.json<OrganizerActivityByActorResponse>();
    expect(
      humanBody.entries.some(
        (entry) =>
          entry.type === "proposal.review.changed" &&
          entry.actorName.includes("agent on behalf of") &&
          entry.actorName.includes(humanName),
      ),
    ).toBe(true);

    const agentActivity = await app.request(
      `https://chartstead.test/api/events/${eventId}/organizer/activity?actorId=${agentId}`,
      undefined,
      env,
    );
    expect(agentActivity.status).toBe(200);
    const agentBody = await agentActivity.json<OrganizerActivityByActorResponse>();
    expect(agentBody.actors.some((actor) => actor.id === agentId && actor.kind === "agent")).toBe(
      true,
    );
    expect(
      agentBody.entries.some((entry) => entry.actorName === expectedLabel),
    ).toBe(true);

    const afterHttp = await bearerApp().request(
      `https://chartstead.test/api/v1/events/${eventId}/submissions/SUB-PODS0003`,
      { headers: { authorization: `Bearer ${apiKey.token}` } },
      env,
    );
    const afterHttpBody = await afterHttp.json<{
      submission: { reviewVersion: number };
    }>();

    const mcpPatch = await mcpCall(
      apiKey.token,
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "chartstead_event_api",
          arguments: {
            eventId,
            method: "PATCH",
            path: "/submissions/SUB-PODS0003/review",
            body: {
              status: "approve",
              expectedVersion: afterHttpBody.submission.reviewVersion,
            },
          },
        },
      },
      `${humanId}|${humanName}`,
    );
    expect(mcpPatch.status).toBe(200);
    const mcpPatchBody = await mcpPatch.json<{ result: { isError?: boolean } }>();
    expect(mcpPatchBody.result.isError).toBe(false);
  });

  it("creates and applies a decision via HTTP and MCP with on-behalf activity", async () => {
    const apiKey = await mintAgentKey({
      name: "Program ops agent",
      mode: "delegated_execution",
      scopes: ["decisions"],
    });
    const agentId = "program-ops-agent";
    tokens.set(
      apiKey.token,
      agentPrincipal({
        id: agentId,
        name: "Program ops agent",
        mode: "delegated_execution",
        scopes: ["decisions"],
      }),
    );

    const expectedLabel = formatCourseCheckActorLabel({
      displayName: "Program ops agent",
      kind: "agent",
      initiatingHuman: { id: humanId, displayName: humanName },
    });

    const createHttp = await bearerApp().request(
      `https://chartstead.test/api/v1/events/${eventId}/course-checks/decisions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey.token}`,
          "content-type": "application/json",
          "idempotency-key": "cc25-http-dec-1",
          "x-chartstead-initiating-human": `${humanId}|${humanName}`,
        },
        body: JSON.stringify({
          proposalId: "SUB-PODS0004",
          outcome: "declined",
          idempotencyKey: "cc25-http-dec-1",
        }),
      },
      env,
    );
    expect(createHttp.status).toBe(201);
    const httpPlan = await createHttp.json<CourseCheckPlan>();
    expect(httpPlan.createdBy.kind).toBe("agent");
    expect(httpPlan.createdBy.initiatingHuman?.displayName).toBe(humanName);
    expect(formatCourseCheckActorLabel(httpPlan.createdBy)).toBe(expectedLabel);

    const applyHttp = await bearerApp().request(
      `https://chartstead.test/api/v1/events/${eventId}/course-checks/${httpPlan.id}/apply`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey.token}`,
          "content-type": "application/json",
          "idempotency-key": "cc25-http-apply-1",
          "x-chartstead-initiating-human": `${humanId}|${humanName}`,
        },
        body: JSON.stringify({
          planVersion: httpPlan.version,
          digest: httpPlan.digest,
          stageId: "apply-decision",
          idempotencyKey: "cc25-http-apply-1",
        }),
      },
      env,
    );
    expect(applyHttp.status).toBe(200);

    const mcpPrepare = await mcpCall(
      apiKey.token,
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "chartstead_prepare_decision",
          arguments: {
            eventId,
            proposalId: "SUB-PODS0005",
            outcome: "declined",
            idempotencyKey: "cc25-mcp-dec-1",
          },
        },
      },
      `${humanId}|${humanName}`,
    );
    expect(mcpPrepare.status).toBe(200);
    const mcpPrepareBody = await mcpPrepare.json<{
      result: { isError?: boolean; structuredContent?: CourseCheckPlan };
    }>();
    expect(mcpPrepareBody.result.isError).toBe(false);
    const mcpPlan = mcpPrepareBody.result.structuredContent!;
    expect(mcpPlan.createdBy.kind).toBe("agent");

    const mcpApply = await mcpCall(
      apiKey.token,
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "chartstead_event_api",
          arguments: {
            eventId,
            method: "POST",
            path: `/course-checks/${mcpPlan.id}/apply`,
            idempotencyKey: "cc25-mcp-apply-1",
            body: {
              planVersion: mcpPlan.version,
              digest: mcpPlan.digest,
              stageId: "apply-decision",
              idempotencyKey: "cc25-mcp-apply-1",
            },
          },
        },
      },
      `${humanId}|${humanName}`,
    );
    expect(mcpApply.status).toBe(200);
    const mcpApplyBody = await mcpApply.json<{ result: { isError?: boolean } }>();
    expect(mcpApplyBody.result.isError).toBe(false);

    const mcpActivity = await mcpCall(apiKey.token, {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "chartstead_event_api",
        arguments: {
          eventId,
          method: "GET",
          path: `/organizer/activity?actorId=${encodeURIComponent(humanId)}`,
        },
      },
    });
    expect(mcpActivity.status).toBe(200);
    const mcpActivityBody = await mcpActivity.json<{
      result: {
        isError?: boolean;
        structuredContent?: OrganizerActivityByActorResponse;
      };
    }>();
    expect(mcpActivityBody.result.isError).toBe(false);
    expect(
      mcpActivityBody.result.structuredContent?.entries.some(
        (entry) =>
          entry.actorName.includes("agent on behalf of") &&
          entry.actorName.includes(humanName),
      ),
    ).toBe(true);

    const v1Activity = await bearerApp().request(
      `https://chartstead.test/api/v1/events/${eventId}/organizer/activity?actorId=${humanId}`,
      { headers: { authorization: `Bearer ${apiKey.token}` } },
      env,
    );
    expect(v1Activity.status).toBe(200);
    const v1Body = await v1Activity.json<OrganizerActivityByActorResponse>();
    expect(
      v1Body.entries.some(
        (entry) =>
          entry.source === "course_check_mutations" &&
          entry.actorName.includes("agent on behalf of") &&
          entry.actorName.includes(humanName),
      ),
    ).toBe(true);

    const agentFeed = await app.request(
      `https://chartstead.test/api/events/${eventId}/organizer/activity?actorId=${agentId}`,
      undefined,
      env,
    );
    const agentFeedBody = await agentFeed.json<OrganizerActivityByActorResponse>();
    expect(
      agentFeedBody.entries.some((entry) => entry.actorName === expectedLabel),
    ).toBe(true);
  });

  it("labels agents without initiating human as (agent) and never bare human names", async () => {
    const apiKey = await mintAgentKey({
      name: "Solo agent",
      mode: "delegated_execution",
      scopes: ["decisions"],
    });
    tokens.set(
      apiKey.token,
      agentPrincipal({
        id: "solo-agent",
        name: "Solo agent",
        mode: "delegated_execution",
        scopes: ["decisions"],
      }),
    );

    const create = await bearerApp().request(
      `https://chartstead.test/api/v1/events/${eventId}/course-checks/decisions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey.token}`,
          "content-type": "application/json",
          "idempotency-key": "cc25-solo-dec",
        },
        body: JSON.stringify({
          proposalId: "SUB-PODS0002",
          outcome: "declined",
          idempotencyKey: "cc25-solo-dec",
        }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const plan = await create.json<CourseCheckPlan>();
    expect(formatCourseCheckActorLabel(plan.createdBy)).toBe("Solo agent (agent)");
    expect(formatCourseCheckActorLabel(plan.createdBy)).not.toBe(humanName);

    const activity = await app.request(
      `https://chartstead.test/api/events/${eventId}/organizer/activity?actorId=solo-agent`,
      undefined,
      env,
    );
    const body = await activity.json<OrganizerActivityByActorResponse>();
    expect(
      body.entries.some(
        (entry) =>
          entry.actorName.includes("(agent)") &&
          !entry.actorName.includes("on behalf of"),
      ),
    ).toBe(true);
  });

  it("keeps propose-only, credential blocks, and live revocation intact", async () => {
    const proposeKey = await mintAgentKey({
      name: "Propose only",
      mode: "propose_only",
      scopes: ["decisions"],
    });
    tokens.set(
      proposeKey.token,
      agentPrincipal({
        id: "propose-only-agent",
        name: "Propose only",
        mode: "propose_only",
        scopes: ["decisions"],
      }),
    );

    const created = await bearerApp().request(
      `https://chartstead.test/api/v1/events/${eventId}/course-checks/decisions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${proposeKey.token}`,
          "content-type": "application/json",
          "idempotency-key": "cc25-propose-dec",
        },
        body: JSON.stringify({
          proposalId: "SUB-PODS0001",
          outcome: "declined",
          idempotencyKey: "cc25-propose-dec",
        }),
      },
      env,
    );
    expect(created.status).toBe(201);
    const plan = await created.json<CourseCheckPlan>();
    const applyDenied = await bearerApp().request(
      `https://chartstead.test/api/v1/events/${eventId}/course-checks/${plan.id}/apply`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${proposeKey.token}`,
          "content-type": "application/json",
          "idempotency-key": "cc25-propose-apply",
        },
        body: JSON.stringify({
          planVersion: plan.version,
          digest: plan.digest,
          stageId: "apply-decision",
          idempotencyKey: "cc25-propose-apply",
        }),
      },
      env,
    );
    expect(applyDenied.status).toBe(403);

    const blocked = await mcpCall(proposeKey.token, {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: {
        name: "chartstead_event_api",
        arguments: { eventId, method: "GET", path: "/api-keys" },
      },
    });
    const blockedBody = await blocked.json<{ result: { isError?: boolean; content?: Array<{ text?: string }> } }>();
    expect(blockedBody.result.isError).toBe(true);
    expect(blockedBody.result.content?.[0]?.text ?? "").toMatch(/credentials|integration/i);

    const revoke = await app.request(
      `https://chartstead.test/api/v1/events/${eventId}/api-keys/${proposeKey.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revoke: true }),
      },
      env,
    );
    expect(revoke.status).toBe(200);
    tokens.delete(proposeKey.token);

    const after = await mcpCall(proposeKey.token, {
      jsonrpc: "2.0",
      id: 10,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      },
    });
    expect(after.status).toBe(401);
  });
});
