import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { CourseCheckPlan } from "../../shared/course-check";
import type { OrganizerPrincipal, OrganizerProposal } from "../../shared/events";
import { createApp } from "../../worker/app";

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
});
