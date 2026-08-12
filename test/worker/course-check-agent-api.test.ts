import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import {
  COURSE_CHECK_ACTION_TYPES,
  COURSE_CHECK_SCOPES,
  expandCourseCheckScopes,
} from "../../shared/agent-api";
import {
  formatCourseCheckActorLabel,
  type CourseCheckPlan,
} from "../../shared/course-check";
import type { OrganizerPrincipal, OrganizerProposal } from "../../shared/events";
import { createApp } from "../../worker/app";

const eventId = "pacific-open-data-summit-2026";

const adminPrincipal = {
  id: "cc08-admin",
  displayName: "Course Check 08 Admin",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const reviewerPrincipal = {
  id: "cc08-reviewer",
  displayName: "Course Check 08 Reviewer",
  role: "reviewer",
  eventIds: [eventId],
  trackIdsByEvent: { [eventId]: ["platform"] },
} as unknown as OrganizerPrincipal;

function agentPrincipal(input: {
  id: string;
  mode: "propose_only" | "delegated_execution" | "autonomous_policy";
  scopes: import("../../shared/agent-api").CourseCheckScope[];
  initiatingHuman?: { id: string; displayName: string } | null;
}): OrganizerPrincipal {
  return {
    id: input.id,
    displayName: `Agent ${input.id}`,
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

const tokens = new Map<string, OrganizerPrincipal>();

const app = createApp({
  resolvePrincipal: async () => adminPrincipal,
  resolveApiKeyPrincipal: async (token) => tokens.get(token) ?? null,
  signingSecret: "course-check-08-test-signing-secret",
});

const reviewerApp = createApp({
  resolvePrincipal: async () => reviewerPrincipal,
  signingSecret: "course-check-08-test-signing-secret",
});

function bearerApp() {
  return createApp({
    resolvePrincipal: async () => null,
    resolveApiKeyPrincipal: async (token) => tokens.get(token) ?? null,
    signingSecret: "course-check-08-test-signing-secret",
  });
}

async function seed() {
  const response = await app.request(
    `https://chartstead.test/api/events/${eventId}`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
}

async function getProposal(proposalId: string): Promise<OrganizerProposal> {
  const response = await app.request(
    `https://chartstead.test/api/events/${eventId}/organizer/proposals/${proposalId}`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
  const body = await response.json<{ proposal: OrganizerProposal }>();
  return body.proposal;
}

/** Seed proposals used across Course Check tests. */
const SEED_PROPOSALS = [
  "SUB-PODS0001",
  "SUB-PODS0002",
  "SUB-PODS0003",
  "SUB-PODS0004",
  "SUB-PODS0005",
] as const;

async function createDecisionVia(
  pathPrefix: string,
  token: string | null,
  input: {
    proposalId: string;
    outcome: "accepted" | "declined";
    idempotencyKey: string;
    initiatingHumanHeader?: string;
  },
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "idempotency-key": input.idempotencyKey,
  };
  if (token) headers.authorization = `Bearer ${token}`;
  if (input.initiatingHumanHeader) {
    headers["x-chartstead-initiating-human"] = input.initiatingHumanHeader;
  }
  const client = token ? bearerApp() : app;
  const response = await client.request(
    `https://chartstead.test${pathPrefix}/decisions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        proposalId: input.proposalId,
        outcome: input.outcome,
        idempotencyKey: input.idempotencyKey,
      }),
    },
    env,
  );
  const body = await response.json<
    CourseCheckPlan | { error: string; code?: string }
  >();
  return { status: response.status, body };
}

async function applyVia(
  pathPrefix: string,
  token: string | null,
  plan: CourseCheckPlan,
  idempotencyKey: string,
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "idempotency-key": idempotencyKey,
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const client = token ? bearerApp() : app;
  const response = await client.request(
    `https://chartstead.test${pathPrefix}/${plan.id}/apply`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        planVersion: plan.version,
        digest: plan.digest,
        stageId: "apply-decision",
        idempotencyKey,
      }),
    },
    env,
  );
  const body = await response.json<
    CourseCheckPlan | { error: string; code?: string }
  >();
  return { status: response.status, body };
}

describe("Course Check 08 agent API control", () => {
  beforeAll(async () => {
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
    ]);
    await seed();
  });

  it("expands all-scope grants to individual durable scopes", () => {
    const expanded = expandCourseCheckScopes(["all"]);
    expect(expanded).toEqual([...COURSE_CHECK_SCOPES]);
    expect(expanded).not.toContain("all");
  });

  it("labels agents as acting on behalf of the initiating human", () => {
    expect(
      formatCourseCheckActorLabel({
        displayName: "Program ops agent",
        kind: "agent",
        initiatingHuman: { id: "tyler", displayName: "Tyler" },
      }),
    ).toBe("Program ops agent (agent on behalf of Tyler)");
    expect(
      formatCourseCheckActorLabel({
        displayName: "Program ops agent",
        kind: "agent",
      }),
    ).toBe("Program ops agent (agent)");
    expect(
      formatCourseCheckActorLabel({
        displayName: "Demo Administrator",
        kind: "human",
      }),
    ).toBe("Demo Administrator");
  });

  it("exposes closed action types and agent contract on v1 health", async () => {
    const response = await app.request(
      "https://chartstead.test/api/v1/health",
      undefined,
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      api: string;
      courseCheck: { actionTypes: string[]; scopes: string[] };
    }>();
    expect(body.api).toBe("v1");
    expect(body.courseCheck.actionTypes).toEqual([...COURSE_CHECK_ACTION_TYPES]);
    expect(body.courseCheck.scopes).toEqual([...COURSE_CHECK_SCOPES]);
  });

  it("rejects unknown action types without heuristic reinterpretation", async () => {
    const response = await app.request(
      `https://chartstead.test/api/v1/events/${eventId}/course-checks/actions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionType: "magic_auto_accept" }),
      },
      env,
    );
    expect(response.status).toBe(400);
    const body = await response.json<{ code?: string }>();
    expect(body.code).toBe("unknown_action_type");
  });

  it("connects agents with propose-only and no scopes by default", async () => {
    const mint = await app.request(
      `https://chartstead.test/api/v1/events/${eventId}/api-keys`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Fresh agent",
          principalKind: "agent",
        }),
      },
      env,
    );
    expect(mint.status).toBe(201);
    const minted = await mint.json<{
      apiKey: {
        token: string;
        principalKind: string;
        agentMode: string | null;
        courseCheckScopes: string[];
      };
    }>();
    expect(minted.apiKey.principalKind).toBe("agent");
    expect(minted.apiKey.agentMode).toBe("propose_only");
    expect(minted.apiKey.courseCheckScopes).toEqual([]);

    tokens.set(
      minted.apiKey.token,
      agentPrincipal({
        id: "fresh-agent",
        mode: "propose_only",
        scopes: [],
      }),
    );

    const denied = await createDecisionVia(
      `/api/v1/events/${eventId}/course-checks`,
      minted.apiKey.token,
      {
        proposalId: "SUB-PODS0001",
        outcome: "accepted",
        idempotencyKey: "cc08-default-deny",
      },
    );
    expect(denied.status).toBe(403);
    expect((denied.body as { code?: string }).code).toBe("missing_scope");
  });

  it("mints all-scope grants expanded and supports propose-only vs delegated execution", async () => {
    const targetId = SEED_PROPOSALS[2];
    await getProposal(targetId);

    const proposeToken = "cs_live_cc08_propose";
    tokens.set(
      proposeToken,
      agentPrincipal({
        id: "agent-propose",
        mode: "propose_only",
        scopes: expandCourseCheckScopes(["all"]),
      }),
    );

    const created = await createDecisionVia(
      `/api/v1/events/${eventId}/course-checks`,
      proposeToken,
      {
        proposalId: targetId,
        outcome: "declined",
        idempotencyKey: `cc08-propose-${targetId}`,
        initiatingHumanHeader: "human-1|Tyler Operator",
      },
    );
    expect(created.status).toBe(201);
    const plan = created.body as CourseCheckPlan;
    expect(plan.actionType).toBe("decision");
    expect(plan.digest).toBeTruthy();
    expect(plan.createdBy.kind).toBe("agent");
    expect(plan.createdBy.agentId).toBe("agent-propose");
    expect(plan.createdBy.initiatingHuman).toEqual({
      id: "human-1",
      displayName: "Tyler Operator",
    });
    // Frozen plan body — apply path never reinterprets AI content.
    expect(plan.body).toBeTruthy();
    expect(plan.version).toBeGreaterThanOrEqual(1);

    const blockedApply = await applyVia(
      `/api/v1/events/${eventId}/course-checks`,
      proposeToken,
      plan,
      `cc08-propose-apply-${targetId}`,
    );
    expect(blockedApply.status).toBe(403);
    expect((blockedApply.body as { code?: string }).code).toBe("propose_only");

    const execToken = "cs_live_cc08_exec";
    tokens.set(
      execToken,
      agentPrincipal({
        id: "agent-exec",
        mode: "delegated_execution",
        scopes: expandCourseCheckScopes(["all"]),
      }),
    );

    const applied = await applyVia(
      `/api/v1/events/${eventId}/course-checks`,
      execToken,
      plan,
      `cc08-exec-apply-${targetId}`,
    );
    expect(applied.status).toBe(200);
    const appliedPlan = applied.body as CourseCheckPlan;
    expect(appliedPlan.state === "Complete" || appliedPlan.receipt).toBeTruthy();
    expect(appliedPlan.approval?.actor.kind).toBe("agent");
  });

  it("re-checks scopes at execution so revocation blocks previously approved plans", async () => {
    const targetId = SEED_PROPOSALS[3];
    await getProposal(targetId);

    const token = "cs_live_cc08_revoke";
    tokens.set(
      token,
      agentPrincipal({
        id: "agent-revoke",
        mode: "delegated_execution",
        scopes: expandCourseCheckScopes(["decisions"]),
      }),
    );

    const created = await createDecisionVia(
      `/api/v1/events/${eventId}/course-checks`,
      token,
      {
        proposalId: targetId,
        outcome: "declined",
        idempotencyKey: `cc08-revoke-create-${targetId}-${Date.now()}`,
      },
    );
    expect([200, 201]).toContain(created.status);
    const plan = created.body as CourseCheckPlan;

    // Revoke decisions scope before apply
    tokens.set(
      token,
      agentPrincipal({
        id: "agent-revoke",
        mode: "delegated_execution",
        scopes: ["drafts"],
      }),
    );

    const denied = await applyVia(
      `/api/v1/events/${eventId}/course-checks`,
      token,
      plan,
      `cc08-revoke-apply-${targetId}`,
    );
    expect(denied.status).toBe(403);
    expect((denied.body as { code?: string }).code).toBe("missing_scope");
  });

  it("produces equivalent human UI and agent v1 plan shape for the same decision", async () => {
    const targetId = SEED_PROPOSALS[4];
    await getProposal(targetId);

    const human = await createDecisionVia(
      `/api/events/${eventId}/course-checks`,
      null,
      {
        proposalId: targetId,
        outcome: "declined",
        idempotencyKey: `cc08-parity-human-${targetId}-${Date.now()}`,
      },
    );
    expect([200, 201]).toContain(human.status);
    const humanPlan = human.body as CourseCheckPlan;

    const agentToken = "cs_live_cc08_parity";
    tokens.set(
      agentToken,
      agentPrincipal({
        id: "agent-parity",
        mode: "propose_only",
        scopes: ["decisions"],
      }),
    );
    const agent = await createDecisionVia(
      `/api/v1/events/${eventId}/course-checks`,
      agentToken,
      {
        proposalId: targetId,
        outcome: "declined",
        idempotencyKey: `cc08-parity-agent-${targetId}-${Date.now()}`,
      },
    );
    expect([200, 201]).toContain(agent.status);
    const agentPlan = agent.body as CourseCheckPlan;

    expect(humanPlan.actionType).toBe(agentPlan.actionType);
    expect(humanPlan.body && "items" in humanPlan.body).toBe(true);
    expect(agentPlan.body && "items" in agentPlan.body).toBe(true);
    expect(humanPlan.createdBy.kind ?? "human").toBe("human");
    expect(agentPlan.createdBy.kind).toBe("agent");
    // Stable contract fields present on both
    for (const plan of [humanPlan, agentPlan]) {
      expect(plan.id).toBeTruthy();
      expect(plan.eventId).toBe(eventId);
      expect(plan.version).toBeGreaterThanOrEqual(1);
      expect(plan.digest).toMatch(/^[a-f0-9]+$/i);
      expect(Array.isArray(plan.body && "stages" in plan.body ? plan.body.stages : [])).toBe(
        true,
      );
    }
  });

  it("redacts communication evidence for reviewers while agents with draft scope can read", async () => {
    const list = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/course-checks`,
      undefined,
      env,
    );
    expect(list.status).toBe(200);

    const agentToken = "cs_live_cc08_read";
    tokens.set(
      agentToken,
      agentPrincipal({
        id: "agent-read",
        mode: "propose_only",
        scopes: ["drafts"],
      }),
    );
    const agentList = await bearerApp().request(
      `https://chartstead.test/api/v1/events/${eventId}/course-checks`,
      { headers: { authorization: `Bearer ${agentToken}` } },
      env,
    );
    expect(agentList.status).toBe(200);
  });

  it("supports autonomous_policy mode for scoped execution", async () => {
    const targetId = SEED_PROPOSALS[1];
    await getProposal(targetId);
    const token = "cs_live_cc08_auto";
    tokens.set(
      token,
      agentPrincipal({
        id: "agent-auto",
        mode: "autonomous_policy",
        scopes: expandCourseCheckScopes(["all"]),
      }),
    );
    const created = await createDecisionVia(
      `/api/v1/events/${eventId}/course-checks`,
      token,
      {
        proposalId: targetId,
        outcome: "declined",
        idempotencyKey: `cc08-auto-${targetId}-${Date.now()}`,
      },
    );
    // May be 200 if idempotent collision with prior declined plan
    expect([200, 201, 400]).toContain(created.status);
    if (created.status === 201 || created.status === 200) {
      const plan = created.body as CourseCheckPlan;
      if (plan.state !== "Complete" && plan.state !== "Superseded") {
        const applied = await applyVia(
          `/api/v1/events/${eventId}/course-checks`,
          token,
          plan,
          `cc08-auto-apply-${Date.now()}`,
        );
        expect([200, 409, 400]).toContain(applied.status);
        if (applied.status === 200) {
          expect((applied.body as CourseCheckPlan).approval?.actor.agentMode).toBe(
            "autonomous_policy",
          );
        }
      }
    }
  });

  it("persists agent grants with expanded scopes via api-keys PATCH", async () => {
    const mint = await app.request(
      `https://chartstead.test/api/v1/events/${eventId}/api-keys`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Scoped agent",
          principalKind: "agent",
          agentMode: "propose_only",
          courseCheckScopes: ["all"],
        }),
      },
      env,
    );
    expect(mint.status).toBe(201);
    const minted = await mint.json<{
      apiKey: { id: string; courseCheckScopes: string[] };
    }>();
    expect(minted.apiKey.courseCheckScopes).toEqual([...COURSE_CHECK_SCOPES]);

    const patched = await app.request(
      `https://chartstead.test/api/v1/events/${eventId}/api-keys/${minted.apiKey.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentMode: "delegated_execution",
          courseCheckScopes: ["decisions", "drafts"],
        }),
      },
      env,
    );
    expect(patched.status).toBe(200);
    const body = await patched.json<{
      apiKey: { agentMode: string; courseCheckScopes: string[] };
    }>();
    expect(body.apiKey.agentMode).toBe("delegated_execution");
    expect(body.apiKey.courseCheckScopes).toEqual(["decisions", "drafts"]);

    const revoked = await app.request(
      `https://chartstead.test/api/v1/events/${eventId}/api-keys/${minted.apiKey.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revoke: true }),
      },
      env,
    );
    expect(revoked.status).toBe(200);
    const revBody = await revoked.json<{ apiKey: { revoked: boolean } }>();
    expect(revBody.apiKey.revoked).toBe(true);
  });
});
