import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { CourseCheckPlan } from "../../shared/course-check";
import type { OrganizerPrincipal, OrganizerProposal } from "../../shared/events";
import { createApp } from "../../worker/app";
import type { AirtableEffect } from "../../shared/airtable";

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
});
