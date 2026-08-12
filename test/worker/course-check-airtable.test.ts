import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { CourseCheckPlan } from "../../shared/course-check";
import type { OrganizerPrincipal, OrganizerProposal } from "../../shared/events";
import { createApp } from "../../worker/app";
import type { AirtableEffect } from "../../shared/airtable";
import { CHARTSTEAD_AIRTABLE_TEMPLATE, getTableMap } from "../../shared/airtable-field-map";
import { AirtableClientError } from "../../worker/airtable/client";
import { createMemoryAirtableClient } from "../../worker/airtable/client";
import { pullAirtableForEvent } from "../../worker/airtable/sync";

const eventId = "pacific-open-data-summit-2026";

const adminPrincipal = {
  id: "cc07-admin",
  displayName: "Airtable Effects Admin",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const adminApp = createApp({
  resolvePrincipal: async () => adminPrincipal,
  signingSecret: "course-check-07-airtable-effects-secret",
});

async function loadEvent(): Promise<void> {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
}

async function listProposals(): Promise<OrganizerProposal[]> {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}/proposals`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
  const body = await response.json<{ proposals: OrganizerProposal[] }>();
  return body.proposals;
}

async function createDecision(
  proposalId: string,
  key: string,
): Promise<CourseCheckPlan> {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/decisions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: JSON.stringify({
        proposalId,
        outcome: "accepted",
        idempotencyKey: key,
      }),
    },
    env,
  );
  expect(response.status).toBe(201);
  return response.json<CourseCheckPlan>();
}

async function applyDecision(plan: CourseCheckPlan, key: string): Promise<CourseCheckPlan> {
  const response = await adminApp.request(
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

async function setAirtableDisposition(
  plan: CourseCheckPlan,
  disposition: "deferred" | "removed",
  key: string,
): Promise<{ status: number; body: CourseCheckPlan | { error: string } }> {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/${plan.id}/airtable/disposition`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: JSON.stringify({
        planVersion: plan.version,
        digest: plan.digest,
        disposition,
        idempotencyKey: key,
      }),
    },
    env,
  );
  const text = await response.text();
  let body: CourseCheckPlan | { error: string };
  try {
    body = JSON.parse(text) as CourseCheckPlan | { error: string };
  } catch {
    body = { error: text };
  }
  return {
    status: response.status,
    body,
  };
}

async function executeAirtable(
  app: typeof adminApp,
  plan: CourseCheckPlan,
  key: string,
): Promise<{
  status: number;
  body: {
    plan?: CourseCheckPlan;
    effects?: AirtableEffect[];
    degraded?: boolean;
    error?: string;
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
        idempotencyKey: key,
      }),
    },
    env,
  );
  const text = await response.text();
  let body: {
    plan?: CourseCheckPlan;
    effects?: AirtableEffect[];
    degraded?: boolean;
    error?: string;
  };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    body = { error: text };
  }
  return { status: response.status, body };
}

async function reconcileAirtable(
  app: typeof adminApp,
  plan: CourseCheckPlan,
  key: string,
) {
  const response = await app.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/${plan.id}/airtable/reconcile`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        planVersion: plan.version,
        digest: plan.digest,
        idempotencyKey: key,
      }),
    },
    env,
  );
  return {
    status: response.status,
    body: await response.json<{ plan: CourseCheckPlan; effects: AirtableEffect[] }>(),
  };
}

describe("Course Check 07 — Airtable consequence effects", () => {
  beforeAll(async () => {
    await loadEvent();
  });

  it("freezes exact mapped Airtable creates before integration approval", async () => {
    const proposal = (await listProposals()).find(
      (candidate) => candidate.programOutcome == null && candidate.status !== "deny",
    );
    expect(proposal).toBeTruthy();

    const plan = await createDecision(
      proposal!.id,
      `cc07-preview-${proposal!.id}`,
    );
    const body = plan.body as typeof plan.body & {
      airtable?: {
        effects: Array<{
          kind: string;
          operation: string;
          state: string;
          fields: Record<string, unknown>;
        }>;
      };
    };

    expect(body.airtable?.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "speaker",
          operation: "create",
          state: "pending",
          fields: expect.objectContaining({
            "ChartStead Speaker ID": expect.any(String),
            Name: expect.any(String),
            Email: expect.any(String),
          }),
        }),
        expect.objectContaining({
          kind: "session",
          operation: "create",
          state: "pending",
        }),
        expect.objectContaining({
          kind: "task",
          operation: "create",
          state: "pending",
        }),
      ]),
    );
    expect(plan.body.stages).toContainEqual(
      expect.objectContaining({
        id: "write-airtable",
        verb: "Write to Airtable",
        status: "pending",
      }),
    );
  });

  it("commits internal state and stable Airtable intents before network delivery", async () => {
    const proposal = (await listProposals()).find(
      (candidate) => candidate.programOutcome == null && candidate.status !== "deny",
    );
    expect(proposal).toBeTruthy();
    const plan = await createDecision(
      proposal!.id,
      `cc07-atomic-${proposal!.id}`,
    );

    const applied = await applyDecision(plan, `cc07-atomic-apply-${proposal!.id}`);
    expect(applied.state).toBe("Complete");
    expect(applied.body.stages).toContainEqual(
      expect.objectContaining({ id: "apply-decision", status: "complete" }),
    );
    expect(applied.body.stages).toContainEqual(
      expect.objectContaining({ id: "write-airtable", status: "ready" }),
    );

    const store = env.EVENT_STORE.getByName(eventId) as unknown as {
      listAirtableEffects(planId: string): Promise<AirtableEffect[]>;
    };
    const effects = await store.listAirtableEffects(plan.id);
    expect(effects).toHaveLength(plan.body.airtable.effects.length);
    expect(effects.every((effect) => effect.state === "pending")).toBe(true);
    expect(new Set(effects.map((effect) => effect.id)).size).toBe(effects.length);

    const after = (await listProposals()).find((candidate) => candidate.id === proposal!.id);
    expect(after?.programOutcome).toBe("accepted");
  });

  it("defers the Airtable stage without reverting completed internal work", async () => {
    const proposal = (await listProposals()).find(
      (candidate) => candidate.programOutcome == null && candidate.status !== "deny",
    );
    expect(proposal).toBeTruthy();
    const plan = await createDecision(
      proposal!.id,
      `cc07-defer-${proposal!.id}`,
    );
    const applied = await applyDecision(plan, `cc07-defer-apply-${proposal!.id}`);

    const response = await setAirtableDisposition(
      applied,
      "deferred",
      `cc07-defer-stage-${proposal!.id}`,
    );
    expect(response.status).toBe(200);
    expect("id" in response.body).toBe(true);
    if (!("id" in response.body)) return;
    expect(response.body.body.airtable.disposition).toBe("deferred");
    expect(response.body.body.stages).toContainEqual(
      expect.objectContaining({ id: "write-airtable", status: "deferred" }),
    );
    const after = (await listProposals()).find((candidate) => candidate.id === proposal!.id);
    expect(after?.programOutcome).toBe("accepted");
  });

  it("keeps core operation usable when Airtable is unconfigured", async () => {
    const proposal = (await listProposals()).find(
      (candidate) => candidate.programOutcome == null && candidate.status !== "deny",
    );
    expect(proposal).toBeTruthy();
    const plan = await createDecision(
      proposal!.id,
      `cc07-unconfigured-${proposal!.id}`,
    );
    const applied = await applyDecision(
      plan,
      `cc07-unconfigured-apply-${proposal!.id}`,
    );

    const result = await executeAirtable(
      adminApp,
      applied,
      `cc07-unconfigured-execute-${proposal!.id}`,
    );
    expect(result.status).toBe(200);
    expect(result.body.degraded).toBe(true);
    expect(result.body.effects?.every((effect) => effect.state === "pending")).toBe(
      true,
    );
    const after = (await listProposals()).find((candidate) => candidate.id === proposal!.id);
    expect(after?.programOutcome).toBe("accepted");
  });

  it("executes configured effects once and persists provider references", async () => {
    const proposal = (await listProposals()).find(
      (candidate) => candidate.programOutcome == null && candidate.status !== "deny",
    );
    expect(proposal).toBeTruthy();
    const calls: string[] = [];
    const configuredApp = createApp({
      resolvePrincipal: async () => adminPrincipal,
      signingSecret: "course-check-07-airtable-effects-secret",
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
    const store = env.EVENT_STORE.getByName(eventId);
    await store.saveAirtableConnection({
      baseId: "appCc07Effects01",
      accessToken: "pat-course-check-07",
    });
    const plan = await createDecision(
      proposal!.id,
      `cc07-execute-${proposal!.id}`,
    );
    const applied = await applyDecision(plan, `cc07-execute-apply-${proposal!.id}`);

    const first = await executeAirtable(
      configuredApp,
      applied,
      `cc07-execute-write-${proposal!.id}`,
    );
    expect(first.status).toBe(200);
    expect(first.body.effects?.every((effect) => effect.state === "succeeded")).toBe(
      true,
    );
    expect(
      first.body.effects?.every((effect) => effect.providerRecordId?.startsWith("rec-")),
    ).toBe(true);
    expect(calls).toHaveLength(applied.body.airtable.effects.length);

    const repeated = await executeAirtable(
      configuredApp,
      applied,
      `cc07-execute-write-repeat-${proposal!.id}`,
    );
    expect(repeated.status).toBe(200);
    expect(calls).toHaveLength(applied.body.airtable.effects.length);
  });

  it("classifies retryable and permanent failures without blocking core work", async () => {
    const proposal = (await listProposals()).find(
      (candidate) => candidate.programOutcome == null && candidate.status !== "deny",
    );
    expect(proposal).toBeTruthy();
    const failureApp = createApp({
      resolvePrincipal: async () => adminPrincipal,
      airtableCredentialClientFactory: () => ({
        async listTable() {
          return [];
        },
        async upsertRecord(input: { kind: AirtableEffect["kind"]; chartsteadId: string }) {
          if (input.kind === "speaker") {
            throw new AirtableClientError("Slow down.", "rate_limited", 429);
          }
          if (input.kind === "session") {
            throw new AirtableClientError("Token denied.", "auth", 403);
          }
          return { recordId: `rec-${input.chartsteadId}`, created: true };
        },
      }),
    });
    const plan = await createDecision(proposal!.id, `cc07-failures-${proposal!.id}`);
    const applied = await applyDecision(plan, `cc07-failures-apply-${proposal!.id}`);

    const result = await executeAirtable(
      failureApp,
      applied,
      `cc07-failures-execute-${proposal!.id}`,
    );
    expect(result.status).toBe(200);
    expect(result.body.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "speaker", state: "retryable_failure", nextAttemptAt: expect.any(String) }),
        expect.objectContaining({ kind: "session", state: "permanent_failure", nextAttemptAt: null }),
        expect.objectContaining({ kind: "task", state: "succeeded" }),
      ]),
    );
    const after = (await listProposals()).find((candidate) => candidate.id === proposal!.id);
    expect(after?.programOutcome).toBe("accepted");
  });

  it("reconciles unknown outcomes before allowing a retry", async () => {
    const proposal = (await listProposals()).find(
      (candidate) => candidate.programOutcome == null && candidate.status !== "deny",
    );
    expect(proposal).toBeTruthy();
    let frozenEffects: AirtableEffect[] = [];
    const unknownApp = createApp({
      resolvePrincipal: async () => adminPrincipal,
      airtableCredentialClientFactory: () => ({
        async listTable(kind) {
          const table = getTableMap(kind, CHARTSTEAD_AIRTABLE_TEMPLATE);
          return frozenEffects
            .filter((effect) => effect.kind === kind)
            .map((effect) => ({
              id: `rec-reconciled-${effect.chartsteadId}`,
              fields: { [table.chartsteadIdField]: effect.chartsteadId },
            }));
        },
        async upsertRecord() {
          throw new Error("connection ended after request upload");
        },
      }),
    });
    const plan = await createDecision(proposal!.id, `cc07-unknown-${proposal!.id}`);
    const applied = await applyDecision(plan, `cc07-unknown-apply-${proposal!.id}`);
    frozenEffects = applied.body.airtable.effects;

    const attempted = await executeAirtable(
      unknownApp,
      applied,
      `cc07-unknown-execute-${proposal!.id}`,
    );
    expect(attempted.body.effects?.every((effect) => effect.state === "unknown")).toBe(
      true,
    );

    const reconciled = await reconcileAirtable(
      unknownApp,
      applied,
      `cc07-unknown-reconcile-${proposal!.id}`,
    );
    expect(reconciled.status).toBe(200);
    expect(reconciled.body.effects.every((effect) => effect.state === "succeeded")).toBe(
      true,
    );
  });

  it("rejects consequential inbound changes instead of silently mutating decided work", async () => {
    const proposal = (await listProposals()).find(
      (candidate) => candidate.programOutcome === "accepted",
    );
    expect(proposal).toBeTruthy();
    const result = await pullAirtableForEvent({
      store: env.EVENT_STORE.getByName(eventId),
      client: createMemoryAirtableClient({
        submission: [
          {
            id: "recConsequentialInbound",
            fields: {
              "ChartStead Submission ID": proposal!.id,
              Title: "A consequential silent mutation",
            },
          },
        ],
      }),
      baseId: "appCc07Effects01",
    });

    expect(result.rejectedChanges).toContainEqual(
      expect.objectContaining({
        change: expect.objectContaining({ chartsteadId: proposal!.id }),
        reason: expect.stringMatching(/Course Check|decided/i),
      }),
    );
    const after = (await listProposals()).find((candidate) => candidate.id === proposal!.id);
    expect(after?.title).toBe(proposal!.title);
  });
});
