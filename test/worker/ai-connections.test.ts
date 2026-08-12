import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { OrganizerPrincipal } from "../../shared/events";
import { createApp } from "../../worker/app";
import { ensureApiKeysTable } from "../../worker/api-keys";

const eventId = "pacific-open-data-summit-2026";
const admin: OrganizerPrincipal = {
  id: "connection-admin",
  displayName: "Alex Morgan",
  role: "admin",
  eventIds: [eventId],
  rolesByEvent: { [eventId]: "admin" },
};

const app = createApp({
  resolvePrincipal: async () => admin,
  signingSecret: "ai-connection-test-secret",
});

async function createAgentKey(name = "MCP agent") {
  const response = await app.request(
    `https://chartstead.test/api/v1/events/${eventId}/api-keys`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        principalKind: "agent",
        agentMode: "propose_only",
        courseCheckScopes: ["decisions", "drafts"],
      }),
    },
    env,
  );
  expect(response.status).toBe(201);
  return response.json<{
    apiKey: { id: string; token: string; courseCheckScopes: string[] };
  }>();
}

async function mcpCall(token: string, body: unknown) {
  return app.request(
    "https://chartstead.test/mcp",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
    env,
  );
}

describe("Course Check 13 automation access (API + MCP)", () => {
  beforeAll(async () => {
    await ensureApiKeysTable(env.AUTH_DB);
    const seed = await app.request(`https://chartstead.test/api/events/${eventId}`, undefined, env);
    expect(seed.status).toBe(200);
  });

  it("creates a scoped agent API key and shows the token once", async () => {
    const body = await createAgentKey("HTTP agent");
    expect(body.apiKey.token.startsWith("cs_live_")).toBe(true);
    expect(body.apiKey.courseCheckScopes).toEqual(
      expect.arrayContaining(["decisions", "drafts"]),
    );

    const listed = await app.request(
      `https://chartstead.test/api/v1/events/${eventId}/api-keys`,
      undefined,
      env,
    );
    expect(listed.status).toBe(200);
    const listBody = await listed.json<{ apiKeys: Array<{ token?: string; id: string }> }>();
    expect(listBody.apiKeys.some((key) => key.id === body.apiKey.id)).toBe(true);
    expect(JSON.stringify(listBody)).not.toContain(body.apiKey.token);
  });

  it("authenticates MCP with the agent API key and lists tools", async () => {
    const { apiKey } = await createAgentKey("MCP tools");
    const init = await mcpCall(apiKey.token, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "0" } },
    });
    expect(init.status).toBe(200);
    const initBody = await init.json<{ result: { serverInfo: { name: string } } }>();
    expect(initBody.result.serverInfo.name).toBe("chartstead");

    const tools = await mcpCall(apiKey.token, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });
    expect(tools.status).toBe(200);
    const toolsBody = await tools.json<{ result: { tools: Array<{ name: string }> } }>();
    const names = toolsBody.result.tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "chartstead_event_api",
        "chartstead_list_event_work",
        "chartstead_list_course_checks",
        "chartstead_prepare_decision",
      ]),
    );
  });

  it("rejects MCP without a bearer agent key", async () => {
    const response = await app.request(
      "https://chartstead.test/mcp",
      {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      },
      env,
    );
    expect(response.status).toBe(401);
  });

  it("lets MCP call the organizer API under the key scopes and revokes live", async () => {
    const { apiKey } = await createAgentKey("MCP list");
    const list = await mcpCall(apiKey.token, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "chartstead_list_course_checks",
        arguments: { eventId },
      },
    });
    expect(list.status).toBe(200);
    const listBody = await list.json<{ result: { isError?: boolean; structuredContent?: unknown } }>();
    expect(listBody.result.isError).toBe(false);
    expect(listBody.result.structuredContent).toBeTruthy();

    const revoke = await app.request(
      `https://chartstead.test/api/v1/events/${eventId}/api-keys/${apiKey.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revoke: true }),
      },
      env,
    );
    expect(revoke.status).toBe(200);

    const after = await mcpCall(apiKey.token, {
      jsonrpc: "2.0",
      id: 4,
      method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "0" } },
    });
    expect(after.status).toBe(401);
  });

  it("blocks credential management paths from MCP tools", async () => {
    const { apiKey } = await createAgentKey("MCP block");
    const blocked = await mcpCall(apiKey.token, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "chartstead_event_api",
        arguments: {
          eventId,
          method: "GET",
          path: "/api-keys",
        },
      },
    });
    expect(blocked.status).toBe(200);
    const body = await blocked.json<{ result: { isError: boolean; content: Array<{ text: string }> } }>();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0]?.text).toMatch(/cannot manage credentials/i);
  });

  it("does not expose OAuth discovery or setup routes", async () => {
    const setup = await app.request(
      "https://chartstead.test/api/v1/ai-connections/setup?connectionId=x",
      undefined,
      env,
    );
    expect(setup.status).toBe(404);

    const oauth = await app.request(
      "https://chartstead.test/.well-known/oauth-authorization-server",
      undefined,
      env,
    );
    expect(oauth.status).toBe(404);
  });
});
