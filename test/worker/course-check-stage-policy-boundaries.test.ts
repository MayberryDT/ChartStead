import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AirtableEffect } from "../../shared/airtable";
import type {
  CommunicationPlanBody,
  CourseCheckPlan,
  EventCourseCheckPolicy,
} from "../../shared/course-check";
import type { OrganizerPrincipal, OrganizerProposal } from "../../shared/events";
import { createApp } from "../../worker/app";

const eventId = "pacific-open-data-summit-2026";

const adminA = {
  id: "cc20-boundary-admin-a",
  displayName: "CC20 Boundary Admin A",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const adminB = {
  id: "cc20-boundary-admin-b",
  displayName: "CC20 Boundary Admin B",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const adminC = {
  id: "cc20-boundary-admin-c",
  displayName: "CC20 Boundary Admin C",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const revokedAdminC = {
  ...adminC,
  eventIds: [],
} satisfies OrganizerPrincipal;

let adminCAuthorized = true;

const adminAppA = createApp({ resolvePrincipal: async () => adminA });
const adminAppB = createApp({ resolvePrincipal: async () => adminB });
const liveAdminAppC = createApp({
  resolvePrincipal: async () => (adminCAuthorized ? adminC : revokedAdminC),
});

type TestApp = typeof adminAppA;
type ApiError = { error: string; code?: string; recoveryGuidance?: string };

async function setPolicy(policy: Partial<EventCourseCheckPolicy>): Promise<void> {
  const response = await adminAppA.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/policy`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ policy }),
    },
    env,
  );
  expect(response.status).toBe(200);
}

async function listProposals(): Promise<OrganizerProposal[]> {
  const response = await adminAppA.request(
    `https://chartstead.test/api/events/${eventId}/proposals`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
  return (await response.json<{ proposals: OrganizerProposal[] }>()).proposals;
}

async function createReadyDecision(label: string): Promise<CourseCheckPlan> {
  const candidates = (await listProposals()).filter(
    (proposal) => proposal.programOutcome == null && proposal.status === "unreviewed",
  );
  for (const proposal of candidates) {
    const key = `cc20-boundary-${label}-${proposal.id}`;
    const response = await adminAppA.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/decisions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key,
        },
        body: JSON.stringify({
          proposalId: proposal.id,
          outcome: "accepted",
          idempotencyKey: key,
        }),
      },
      env,
    );
    expect(response.status).toBe(201);
    const plan = await response.json<CourseCheckPlan>();
    if (plan.state === "Ready" || plan.state === "Needs review") return plan;
  }
  throw new Error("No ready proposal remains for stage-policy boundary tests.");
}

async function applyDecision(plan: CourseCheckPlan, label: string): Promise<CourseCheckPlan> {
  const key = `cc20-boundary-apply-${label}-${plan.id}`;
  const response = await adminAppA.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/${plan.id}/apply`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: JSON.stringify({
        planVersion: plan.version,
        digest: plan.digest,
        stageId: "apply-decision",
        idempotencyKey: key,
      }),
    },
    env,
  );
  expect(response.status).toBe(200);
  return response.json<CourseCheckPlan>();
}

async function createCommunication(
  decision: CourseCheckPlan,
  label: string,
): Promise<CourseCheckPlan> {
  const key = `cc20-boundary-communication-${label}-${decision.id}`;
  const response = await adminAppA.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/communications`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: JSON.stringify({
        decisionPlanId: decision.id,
        subject: "Policy boundary subject",
        bodyText: "Policy boundary body.",
        idempotencyKey: key,
      }),
    },
    env,
  );
  expect(response.status).toBe(201);
  return response.json<CourseCheckPlan>();
}

async function createDrafts(
  app: TestApp,
  plan: CourseCheckPlan,
  key: string,
  reason?: string,
): Promise<{ status: number; body: CourseCheckPlan | ApiError }> {
  const response = await app.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/${plan.id}/create-drafts`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: JSON.stringify({
        planVersion: plan.version,
        digest: plan.digest,
        stageId: "create-drafts",
        idempotencyKey: key,
        reason: reason ?? null,
      }),
    },
    env,
  );
  return {
    status: response.status,
    body: await response.json<CourseCheckPlan | ApiError>(),
  };
}

async function executeAirtable(
  app: TestApp,
  plan: CourseCheckPlan,
  key: string,
  reason?: string,
): Promise<{
  status: number;
  body: {
    plan?: CourseCheckPlan;
    effects?: AirtableEffect[];
    error?: string;
    code?: string;
  };
}> {
  const response = await app.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/${plan.id}/airtable/execute`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: JSON.stringify({
        planVersion: plan.version,
        digest: plan.digest,
        stageId: "write-airtable",
        idempotencyKey: key,
        reason: reason ?? null,
      }),
    },
    env,
  );
  return { status: response.status, body: await response.json() };
}

async function getPlan(planId: string): Promise<CourseCheckPlan> {
  const response = await adminAppA.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/${planId}`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
  return response.json<CourseCheckPlan>();
}

function communicationBody(plan: CourseCheckPlan): CommunicationPlanBody {
  if (plan.body.actionType !== "communication") {
    throw new Error("Expected a Communication Course Check.");
  }
  return plan.body;
}

describe("Course Check stage policy at draft and Airtable mutation boundaries", () => {
  beforeAll(async () => {
    const response = await adminAppA.request(
      `https://chartstead.test/api/events/${eventId}`,
      undefined,
      env,
    );
    expect(response.status).toBe(200);
  });

  beforeEach(async () => {
    adminCAuthorized = true;
    await setPolicy({
      requireTwoPersonApproval: false,
      requireDistinctApprover: false,
      requireReasonOnApprove: false,
      maxAgentMode: "autonomous_policy",
    });
  });

  it("does not freeze drafts until two distinct live approvers provide reasons", async () => {
    const decision = await applyDecision(
      await createReadyDecision("drafts"),
      "drafts",
    );
    const plan = await createCommunication(decision, "drafts");
    const store = env.EVENT_STORE.getByName(eventId);

    await setPolicy({
      requireTwoPersonApproval: true,
      requireDistinctApprover: true,
      requireReasonOnApprove: true,
    });

    const missingReason = await createDrafts(
      adminAppB,
      plan,
      `cc20-boundary-drafts-no-reason-${plan.id}`,
    );
    expect(missingReason.status).toBe(400);
    expect(missingReason.body).toMatchObject({ code: "approval_reason_required" });

    const creatorDenied = await createDrafts(
      adminAppA,
      plan,
      `cc20-boundary-drafts-creator-${plan.id}`,
      "I requested this plan.",
    );
    expect(creatorDenied.status).toBe(403);
    expect(creatorDenied.body).toMatchObject({ code: "distinct_approver_required" });

    adminCAuthorized = false;
    const revoked = await createDrafts(
      liveAdminAppC,
      plan,
      `cc20-boundary-drafts-revoked-${plan.id}`,
      "My former access must not survive.",
    );
    expect(revoked.status).toBe(401);
    adminCAuthorized = true;

    const endorsementKey = `cc20-boundary-drafts-endorse-${plan.id}`;
    const endorsed = await createDrafts(
      adminAppB,
      plan,
      endorsementKey,
      "Recipient scope independently reviewed.",
    );
    expect(endorsed.status).toBe(200);
    expect(endorsed.body).toMatchObject({
      state: "Needs review",
      receipt: null,
      stageEndorsements: [
        expect.objectContaining({
          stageId: "create-drafts",
          actor: expect.objectContaining({ id: adminB.id }),
        }),
      ],
      sharedApproval: {
        currentStage: expect.objectContaining({
          stageId: "create-drafts",
          endorsementCount: 1,
          canExecute: false,
        }),
      },
    });
    expect(communicationBody(endorsed.body as CourseCheckPlan).stageVisibility.draft).toBe(
      "ready",
    );
    expect(await store.listCommunicationDrafts(plan.id)).toHaveLength(0);

    const replay = await createDrafts(
      adminAppB,
      plan,
      endorsementKey,
      "Recipient scope independently reviewed.",
    );
    expect(replay.status).toBe(200);
    expect((replay.body as CourseCheckPlan).stageEndorsements).toHaveLength(1);
    expect(await store.listCommunicationDrafts(plan.id)).toHaveLength(0);

    const fresh = await getPlan(plan.id);
    expect(
      (fresh as CourseCheckPlan & {
        sharedApproval?: { currentStage: { canExecute: boolean } };
      }).sharedApproval?.currentStage.canExecute,
    ).toBe(false);

    const executed = await createDrafts(
      liveAdminAppC,
      fresh,
      `cc20-boundary-drafts-execute-${plan.id}`,
      "Second independent approval confirmed.",
    );
    expect(executed.status).toBe(201);
    const executedPlan = executed.body as CourseCheckPlan;
    expect(executedPlan.receipt?.stageId).toBe("create-drafts");
    expect(communicationBody(executedPlan).stageVisibility.draft).toBe("complete");
    expect(await store.listCommunicationDrafts(plan.id)).toHaveLength(
      communicationBody(executedPlan).drafts.length,
    );
  });

  it("does not start Airtable effects until two distinct live approvers provide reasons", async () => {
    const calls: string[] = [];
    const configuredApp = (principal: OrganizerPrincipal | (() => OrganizerPrincipal)) =>
      createApp({
        resolvePrincipal: async () =>
          typeof principal === "function" ? principal() : principal,
        airtableCredentialClientFactory: () => ({
          async listTable() {
            return [];
          },
          async upsertRecord(input: { chartsteadId: string }) {
            calls.push(input.chartsteadId);
            return { recordId: `rec-${input.chartsteadId}`, created: true };
          },
        }),
      });
    const appA = configuredApp(adminA);
    const appB = configuredApp(adminB);
    const appC = configuredApp(() => (adminCAuthorized ? adminC : revokedAdminC));
    const store = env.EVENT_STORE.getByName(eventId);
    await store.saveAirtableConnection({
      baseId: "appCc20PolicyBoundary",
      accessToken: "pat-cc20-policy-boundary",
    });

    const plan = await applyDecision(
      await createReadyDecision("airtable"),
      "airtable",
    );
    expect(plan.body.airtable.effects.length).toBeGreaterThan(0);
    await setPolicy({
      requireTwoPersonApproval: true,
      requireDistinctApprover: true,
      requireReasonOnApprove: true,
    });

    const missingReason = await executeAirtable(
      appB,
      plan,
      `cc20-boundary-airtable-no-reason-${plan.id}`,
    );
    expect(missingReason.status).toBe(400);
    expect(missingReason.body.code).toBe("approval_reason_required");
    expect(calls).toHaveLength(0);

    const creatorDenied = await executeAirtable(
      appA,
      plan,
      `cc20-boundary-airtable-creator-${plan.id}`,
      "I requested this plan.",
    );
    expect(creatorDenied.status).toBe(403);
    expect(creatorDenied.body.code).toBe("distinct_approver_required");
    expect(calls).toHaveLength(0);

    adminCAuthorized = false;
    const revoked = await executeAirtable(
      appC,
      plan,
      `cc20-boundary-airtable-revoked-${plan.id}`,
      "My former access must not survive.",
    );
    expect(revoked.status).toBe(401);
    adminCAuthorized = true;
    expect(calls).toHaveLength(0);

    const endorsementKey = `cc20-boundary-airtable-endorse-${plan.id}`;
    const endorsed = await executeAirtable(
      appB,
      plan,
      endorsementKey,
      "Mapped fields independently reviewed.",
    );
    expect(endorsed.status).toBe(200);
    expect(endorsed.body.plan).toMatchObject({
      state: "Needs review",
      stageEndorsements: [
        expect.objectContaining({
          stageId: "write-airtable",
          actor: expect.objectContaining({ id: adminB.id }),
        }),
      ],
      sharedApproval: {
        currentStage: expect.objectContaining({
          stageId: "write-airtable",
          endorsementCount: 1,
          canExecute: false,
        }),
      },
    });
    expect(endorsed.body.effects?.every((effect) => effect.state === "pending")).toBe(
      true,
    );
    expect(calls).toHaveLength(0);

    const replay = await executeAirtable(appB, plan, endorsementKey, "ignored replay");
    expect(replay.status).toBe(200);
    expect(replay.body.plan?.stageEndorsements).toHaveLength(1);
    expect(replay.body.effects?.every((effect) => effect.state === "pending")).toBe(
      true,
    );
    expect(calls).toHaveLength(0);

    const fresh = await getPlan(plan.id);
    const executed = await executeAirtable(
      appC,
      fresh,
      `cc20-boundary-airtable-execute-${plan.id}`,
      "Second independent approval confirmed.",
    );
    expect(executed.status).toBe(200);
    expect(executed.body.plan).toMatchObject({
      sharedApproval: {
        currentStage: expect.objectContaining({ status: "complete" }),
      },
    });
    expect(executed.body.effects?.every((effect) => effect.state === "succeeded")).toBe(
      true,
    );
    expect(calls).toHaveLength(plan.body.airtable.effects.length);

    const executionReplay = await executeAirtable(
      appC,
      fresh,
      `cc20-boundary-airtable-execute-${plan.id}`,
      "Second independent approval confirmed.",
    );
    expect(executionReplay.status).toBe(200);
    expect(calls).toHaveLength(plan.body.airtable.effects.length);
  });
});
