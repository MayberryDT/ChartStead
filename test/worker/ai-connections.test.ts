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

describe("Course Check 13 AI connections", () => {
  beforeAll(async () => {
    await env.AUTH_DB.prepare(`CREATE TABLE IF NOT EXISTS event_memberships (
      event_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
      PRIMARY KEY (event_id, user_id)
    )`).run();
    await env.AUTH_DB.prepare(
      `INSERT OR REPLACE INTO event_memberships (event_id, user_id, role) VALUES (?, ?, 'admin')`,
    ).bind(eventId, admin.id).run();
    await ensureApiKeysTable(env.AUTH_DB);
    const seed = await app.request(`https://chartstead.test/api/events/${eventId}`, undefined, env);
    expect(seed.status).toBe(200);
  });

  it("connects a host with business-language access and no bearer token in the organizer response", async () => {
    const response = await app.request(
      `https://chartstead.test/api/v1/events/${eventId}/ai-connections`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "claude",
          accessProfile: "research_prepare",
          approvalPolicy: "important_actions",
        }),
      },
      env,
    );

    expect(response.status).toBe(201);
    const body = await response.json<{
      connection: {
        id: string;
        status: string;
        authorizationUrl: string;
        accessProfile: string;
        token?: string;
      };
    }>();
    expect(body.connection.status).toBe("connection_not_tested");
    expect(body.connection.accessProfile).toBe("research_prepare");
    expect(body.connection.authorizationUrl).toContain("/api/v1/ai-connections/setup?");
    expect(body.connection).not.toHaveProperty("token");
    expect(JSON.stringify(body)).not.toContain("cs_live_");
  });

  it("exchanges a one-time host authorization code for scoped API parity and revokes live", async () => {
    const pending = await app.request(
      `https://chartstead.test/api/v1/events/${eventId}/ai-connections`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "chatgpt", accessProfile: "operate_with_approval" }) },
      env,
    );
    const pendingBody = await pending.json<{ connection: { id: string } }>();
    const resource = `https://chartstead.test/mcp?connection_id=${pendingBody.connection.id}`;
    const registered = await registerClient("ChatGPT", "https://chatgpt.com/oauth/callback");
    const verifier = "ticket13-verifier-ticket13-verifier-ticket13-verifier";
    const challenge = await pkceChallenge(verifier);
    const authorize = await app.request(
      `https://chartstead.test/api/v1/ai-connections/authorize?response_type=code&client_id=${encodeURIComponent(registered)}&redirect_uri=https%3A%2F%2Fchatgpt.com%2Foauth%2Fcallback&resource=${encodeURIComponent(resource)}&code_challenge_method=S256&code_challenge=${challenge}&state=abc`,
      undefined,
      env,
    );
    expect(authorize.status).toBe(302);
    const callback = new URL(authorize.headers.get("location")!);
    const code = callback.searchParams.get("code");
    const connectionId = pendingBody.connection.id;

    const exchange = await app.request(
      "https://chartstead.test/api/v1/ai-connections/token",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code, provider: "chatgpt", codeVerifier: verifier,
          clientId: registered,
          redirectUri: "https://chatgpt.com/oauth/callback",
          resource,
        }),
      },
      env,
    );
    expect(exchange.status).toBe(200);
    const exchanged = await exchange.json<{ accessToken: string; tokenType: string }>();
    expect(exchanged.accessToken).toMatch(/^cs_live_/);
    expect(exchanged.tokenType).toBe("Bearer");

    const events = await app.request(
      "https://chartstead.test/api/v1/events",
      { headers: { authorization: `Bearer ${exchanged.accessToken}` } },
      env,
    );
    expect(events.status).toBe(200);

    const tools = await app.request(
      resource,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${exchanged.accessToken}`,
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "mcp-protocol-version": "2025-11-25",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      },
      env,
    );
    expect(tools.status).toBe(200);
    const toolsBody = await tools.json<{ result: { tools: Array<{ name: string }> } }>();
    expect(toolsBody.result.tools.map((tool) => tool.name)).toContain("chartstead_prepare_decision");

    const call = await app.request(
      resource,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${exchanged.accessToken}`,
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "mcp-protocol-version": "2025-11-25",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "chartstead_list_event_work", arguments: { eventId, resource: "submissions" } },
        }),
      },
      env,
    );
    const callBody = await call.json<{ result: { isError: boolean; structuredContent: { submissions: unknown[] } } }>();
    expect(callBody.result.isError).toBe(false);
    expect(callBody.result.structuredContent.submissions.length).toBeGreaterThan(0);

    const prepare = await app.request(
      resource,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${exchanged.accessToken}`,
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "chartstead_prepare_decision",
            arguments: { eventId, proposalId: "SUB-PODS0004", outcome: "declined", idempotencyKey: "cc13-mcp-decision" },
          },
        }),
      },
      env,
    );
    const prepareBody = await prepare.json<{ result: { isError: boolean; structuredContent: { createdBy: { kind: string; initiatingHuman: { displayName: string } } } } }>();
    if (prepareBody.result.isError) throw new Error(JSON.stringify(prepareBody.result));
    expect(prepareBody.result).toMatchObject({ isError: false });
    expect(prepareBody.result.structuredContent.createdBy.kind).toBe("agent");
    expect(prepareBody.result.structuredContent.createdBy.initiatingHuman.displayName).toBe("Alex Morgan");

    const test = await app.request(
      `https://chartstead.test/api/v1/events/${eventId}/ai-connections/${connectionId}/test`,
      { method: "POST" },
      env,
    );
    expect(test.status).toBe(200);

    const reused = await app.request(
      "https://chartstead.test/api/v1/ai-connections/token",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code, provider: "chatgpt", codeVerifier: verifier,
          clientId: registered,
          redirectUri: "https://chatgpt.com/oauth/callback",
          resource,
        }),
      },
      env,
    );
    expect(reused.status).toBe(400);

    const revoked = await app.request(
      `https://chartstead.test/api/v1/events/${eventId}/ai-connections/${connectionId}`,
      { method: "DELETE" },
      env,
    );
    expect(revoked.status).toBe(200);

    const denied = await app.request(
      "https://chartstead.test/api/v1/events",
      { headers: { authorization: `Bearer ${exchanged.accessToken}` } },
      env,
    );
    expect(denied.status).toBe(401);
  });

  it("rotates refresh tokens once and stops refreshing after owner access is removed", async () => {
    const pending = await app.request(
      `https://chartstead.test/api/v1/events/${eventId}/ai-connections`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "claude", accessProfile: "research_prepare" }) },
      env,
    );
    const pendingBody = await pending.json<{ connection: { id: string } }>();
    const resource = `https://chartstead.test/mcp?connection_id=${pendingBody.connection.id}`;
    const redirectUri = "https://claude.ai/oauth/callback";
    const clientId = await registerClient("Claude refresh", redirectUri);
    const verifier = "refresh-verifier-refresh-verifier-refresh-verifier";
    const authorize = await app.request(
      `https://chartstead.test/api/v1/ai-connections/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&resource=${encodeURIComponent(resource)}&code_challenge_method=S256&code_challenge=${await pkceChallenge(verifier)}`,
      undefined,
      env,
    );
    const code = new URL(authorize.headers.get("location")!).searchParams.get("code");
    const exchange = await app.request(
      "https://chartstead.test/api/v1/ai-connections/token",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, codeVerifier: verifier, clientId, redirectUri, resource }) },
      env,
    );
    const first = await exchange.json<{ refresh_token: string }>();
    const refreshBody = new URLSearchParams({ grant_type: "refresh_token", refresh_token: first.refresh_token, resource });
    const [winner, loser] = await Promise.all([
      app.request("https://chartstead.test/api/v1/ai-connections/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: refreshBody.toString() }, env),
      app.request("https://chartstead.test/api/v1/ai-connections/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: refreshBody.toString() }, env),
    ]);
    expect([winner.status, loser.status].sort()).toEqual([200, 400]);
    const rotated = winner.status === 200 ? winner : loser;
    const next = await rotated.json<{ refresh_token: string }>();

    await env.AUTH_DB.prepare(`DELETE FROM event_memberships WHERE event_id = ? AND user_id = ?`).bind(eventId, admin.id).run();
    const denied = await app.request(
      "https://chartstead.test/api/v1/ai-connections/token",
      { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: next.refresh_token, resource }).toString() },
      env,
    );
    expect(denied.status).toBe(400);
    await env.AUTH_DB.prepare(`INSERT OR REPLACE INTO event_memberships (event_id, user_id, role) VALUES (?, ?, 'admin')`).bind(eventId, admin.id).run();
  });

  it("prevents personal connections from escalating credentials or bypassing their access profile", async () => {
    const pending = await app.request(
      `https://chartstead.test/api/v1/events/${eventId}/ai-connections`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "claude", accessProfile: "explore" }) },
      env,
    );
    const pendingBody = await pending.json<{ connection: { id: string } }>();
    const resource = `https://chartstead.test/mcp?connection_id=${pendingBody.connection.id}`;
    const registered = await registerClient("Claude", "https://claude.ai/oauth/callback");
    const verifier = "explore-verifier-explore-verifier-explore-verifier";
    const challenge = await pkceChallenge(verifier);
    const authorize = await app.request(
      `https://chartstead.test/api/v1/ai-connections/authorize?response_type=code&client_id=${encodeURIComponent(registered)}&redirect_uri=https%3A%2F%2Fclaude.ai%2Foauth%2Fcallback&resource=${encodeURIComponent(resource)}&code_challenge_method=S256&code_challenge=${challenge}`,
      undefined,
      env,
    );
    const code = new URL(authorize.headers.get("location")!).searchParams.get("code");
    const exchange = await app.request(
      "https://chartstead.test/api/v1/ai-connections/token",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code, provider: "claude", codeVerifier: verifier,
          clientId: registered,
          redirectUri: "https://claude.ai/oauth/callback",
          resource,
        }),
      },
      env,
    );
    const { accessToken } = await exchange.json<{ accessToken: string }>();
    const headers = { authorization: `Bearer ${accessToken}`, "content-type": "application/json" };

    const mint = await app.request(
      `https://chartstead.test/api/v1/events/${eventId}/api-keys`,
      { method: "POST", headers, body: JSON.stringify({ name: "escalated", principalKind: "agent", courseCheckScopes: ["all"] }) },
      env,
    );
    expect(mint.status).toBe(403);

    const submissions = await app.request(
      `https://chartstead.test/api/v1/events/${eventId}/submissions`,
      { headers },
      env,
    );
    const submission = (await submissions.json<{ submissions: Array<{ id: string; reviewVersion: number }> }>()).submissions[0];
    const write = await app.request(
      `https://chartstead.test/api/v1/events/${eventId}/submissions/${submission.id}/review`,
      { method: "PATCH", headers, body: JSON.stringify({ status: "approve", expectedVersion: submission.reviewVersion }) },
      env,
    );
    expect(write.status).toBe(403);
  });

  it("does not report connected until the host has completed authorization", async () => {
    const created = await app.request(
      `https://chartstead.test/api/v1/events/${eventId}/ai-connections`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "claude", accessProfile: "research_prepare" }),
      },
      env,
    );
    const body = await created.json<{ connection: { id: string } }>();
    const test = await app.request(
      `https://chartstead.test/api/v1/events/${eventId}/ai-connections/${body.connection.id}/test`,
      { method: "POST" },
      env,
    );
    expect(test.status).toBe(409);
    expect(await test.json()).toEqual({
      error: "Complete the assistant sign-in before testing this connection.",
    });
  });

  it("publishes MCP OAuth discovery and challenges unauthenticated hosts", async () => {
    const discovery = await app.request("https://chartstead.test/.well-known/oauth-protected-resource", undefined, env);
    expect(discovery.status).toBe(200);
    expect(await discovery.json()).toMatchObject({
      resource: "https://chartstead.test/mcp",
      authorization_servers: ["https://chartstead.test"],
    });
    const mcp = await app.request(
      "https://chartstead.test/mcp",
      {
        method: "POST",
        headers: { accept: "application/json, text/event-stream", "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      },
      env,
    );
    expect(mcp.status).toBe(401);
    expect(mcp.headers.get("www-authenticate")).toContain("resource_metadata=");
  });
});

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function registerClient(name: string, redirectUri: string): Promise<string> {
  const response = await app.request(
    "https://chartstead.test/api/v1/ai-connections/register",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: name, redirect_uris: [redirectUri] }),
    },
    env,
  );
  expect(response.status).toBe(201);
  return (await response.json<{ client_id: string }>()).client_id;
}
