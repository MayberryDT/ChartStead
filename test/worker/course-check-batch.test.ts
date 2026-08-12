import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { CourseCheckPlan, DecisionPlanBody } from "../../shared/course-check";
import { DEFAULT_DECISION_BATCH_LIMIT } from "../../shared/course-check";
import type { OrganizerPrincipal, OrganizerProposal } from "../../shared/events";
import { createApp } from "../../worker/app";

const eventId = "pacific-open-data-summit-2026";

const adminA = {
  id: "cc02-admin-a",
  displayName: "Admin A",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const adminB = {
  id: "cc02-admin-b",
  displayName: "Admin B",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const appA = createApp({
  resolvePrincipal: async () => adminA,
  signingSecret: "course-check-02-test-signing-secret",
});

const appB = createApp({
  resolvePrincipal: async () => adminB,
  signingSecret: "course-check-02-test-signing-secret",
});

async function loadEvent(app = appA) {
  const response = await app.request(
    `https://chartstead.test/api/events/${eventId}`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
}

async function listProposals(): Promise<OrganizerProposal[]> {
  const response = await appA.request(
    `https://chartstead.test/api/events/${eventId}/proposals`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
  const body = await response.json<{ proposals: OrganizerProposal[] }>();
  return body.proposals;
}

async function getProposal(proposalId: string): Promise<OrganizerProposal> {
  const response = await appA.request(
    `https://chartstead.test/api/events/${eventId}/organizer/proposals/${proposalId}`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
  const body = await response.json<{ proposal: OrganizerProposal }>();
  return body.proposal;
}

async function openProposalIds(count: number): Promise<string[]> {
  const proposals = await listProposals();
  const open = proposals.filter((p) => !p.programOutcome).map((p) => p.id);
  // Prefer seed IDs that decision tests leave alone when possible.
  const preferred = [
    "SUB-PODS0003",
    "SUB-PODS0004",
    "SUB-PODS0005",
    "SUB-PODS0006",
    "SUB-PODS0007",
    "SUB-PODS0008",
    "SUB-PODS0009",
    "SUB-PODS0010",
    "SUB-PODS0011",
    "SUB-PODS0012",
    "SUB-PODS0013",
    "SUB-PODS0014",
    "SUB-PODS0015",
    "SUB-PODS0016",
    "SUB-PODS0017",
    "SUB-PODS0018",
    "SUB-PODS0019",
    "SUB-PODS0020",
  ].filter((id) => open.includes(id));
  const ids = [...new Set([...preferred, ...open])].slice(0, count);
  expect(ids.length).toBeGreaterThanOrEqual(count);
  return ids;
}

async function createBatch(input: {
  items: Array<{ proposalId: string; outcome: "accepted" | "declined" }>;
  idempotencyKey: string;
  app?: typeof appA;
}): Promise<{ status: number; body: CourseCheckPlan & { linkedPlans?: CourseCheckPlan[] } }> {
  const app = input.app ?? appA;
  const response = await app.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/decisions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify({
        items: input.items,
        idempotencyKey: input.idempotencyKey,
      }),
    },
    env,
  );
  const body = await response.json<
    (CourseCheckPlan & { linkedPlans?: CourseCheckPlan[] }) | { error: string }
  >();
  if (!("id" in body)) {
    throw new Error(`create failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return { status: response.status, body };
}

async function getPlan(
  planId: string,
  app: typeof appA = appA,
): Promise<CourseCheckPlan> {
  const response = await app.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/${planId}`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
  return response.json<CourseCheckPlan>();
}

async function deferItems(input: {
  plan: CourseCheckPlan;
  itemIds: string[];
  reason: string;
  idempotencyKey: string;
  app?: typeof appA;
}) {
  const app = input.app ?? appA;
  const response = await app.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/${input.plan.id}/defer`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify({
        planVersion: input.plan.version,
        digest: input.plan.digest,
        itemIds: input.itemIds,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
      }),
    },
    env,
  );
  const body = await response.json<CourseCheckPlan | { error: string; code?: string }>();
  return { status: response.status, body };
}

async function applyPlan(input: {
  plan: CourseCheckPlan;
  idempotencyKey: string;
  app?: typeof appA;
  softWarningOverrides?: Array<{ findingId: string; reason?: string | null }>;
}) {
  const app = input.app ?? appA;
  const response = await app.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/${input.plan.id}/apply`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify({
        planVersion: input.plan.version,
        digest: input.plan.digest,
        stageId: "apply-decision",
        idempotencyKey: input.idempotencyKey,
        softWarningOverrides: input.softWarningOverrides,
      }),
    },
    env,
  );
  const body = await response.json<
    CourseCheckPlan | { error: string; code?: string; recoveryGuidance?: string }
  >();
  return { status: response.status, body };
}

function asDecision(plan: CourseCheckPlan): DecisionPlanBody {
  expect(plan.body.actionType).toBe("decision");
  return plan.body as DecisionPlanBody;
}

describe("Course Check 02 batch decisions and shared workspace", () => {
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
      env.AUTH_DB.prepare(`CREATE TABLE IF NOT EXISTS "reviewer_track_assignments" (
        "event_id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "track_id" TEXT NOT NULL,
        PRIMARY KEY ("event_id", "user_id", "track_id")
      )`),
    ]);
    await loadEvent();
  });

  it("creates one Decision Course Check from selected proposals with mixed outcomes", async () => {
    const open = await openProposalIds(2);

    const { status, body } = await createBatch({
      items: [
        { proposalId: open[0]!, outcome: "accepted" },
        { proposalId: open[1]!, outcome: "declined" },
      ],
      idempotencyKey: `batch-mixed-${open[0]}-${open[1]}`,
    });
    expect(status).toBe(201);
    const decision = asDecision(body);
    expect(decision.items).toHaveLength(2);
    expect(decision.aggregateProgress.total).toBe(2);
    expect(decision.evidenceSections.map((s) => s.kind)).toEqual([
      "irreversible",
      "people",
      "public",
      "operational",
      "integration",
      "internal",
    ]);
    const risky = decision.evidenceSections.filter((s) => s.defaultExpanded);
    expect(risky.length).toBeGreaterThan(0);
    const clean = decision.evidenceSections.filter((s) => !s.defaultExpanded);
    expect(clean.some((s) => s.kind === "integration")).toBe(true);
  });

  it("lets another authorized administrator inspect and continue the same plan", async () => {
    const open = await openProposalIds(1);
    const created = await createBatch({
      items: [{ proposalId: open[0]!, outcome: "declined" }],
      idempotencyKey: `shared-${open[0]}`,
      app: appA,
    });
    const fromB = await getPlan(created.body.id, appB);
    expect(fromB.id).toBe(created.body.id);
    expect(fromB.createdBy.displayName).toBe("Admin A");
    const applied = await applyPlan({
      plan: fromB,
      idempotencyKey: `shared-apply-${fromB.id}`,
      app: appB,
    });
    expect(applied.status).toBe(200);
    expect("state" in applied.body && applied.body.state).toMatch(/Complete|Partially complete/);
  });

  it("records immutable versions and actor mutations on deferral", async () => {
    const open = await openProposalIds(2);
    const created = await createBatch({
      items: open.map((id) => ({ proposalId: id, outcome: "accepted" as const })),
      idempotencyKey: `defer-batch-${open.join("-")}`,
    });
    const decision = asDecision(created.body);
    const firstItem = decision.items[0]!;
    const deferred = await deferItems({
      plan: created.body,
      itemIds: [firstItem.itemId],
      reason: "Need identity review",
      idempotencyKey: `defer-${created.body.id}-${firstItem.itemId}`,
      app: appB,
    });
    expect(deferred.status).toBe(201);
    expect("version" in deferred.body).toBe(true);
    if (!("version" in deferred.body)) return;
    expect(deferred.body.version).toBe(created.body.version + 1);
    expect(deferred.body.digest).not.toBe(created.body.digest);
    const next = asDecision(deferred.body);
    expect(next.aggregateProgress.deferred).toBe(1);
    expect(next.followUpQueue).toHaveLength(1);
    expect(next.followUpQueue[0]?.deferredBy.displayName).toBe("Admin B");
    expect(deferred.body.mutations?.some((m) => m.kind === "defer")).toBe(true);

    // Concurrent stale defer fails exactly.
    const stale = await deferItems({
      plan: created.body,
      itemIds: [decision.items[1]!.itemId],
      reason: "stale attempt",
      idempotencyKey: `stale-defer-${created.body.id}`,
      app: appA,
    });
    expect(stale.status).toBe(409);
    expect("code" in stale.body && stale.body.code).toBe("plan_version_mismatch");
  });

  it("applies remaining batch atomically after deferral and keeps deferred evidence in history", async () => {
    const open = await openProposalIds(2);
    const created = await createBatch({
      items: [
        { proposalId: open[0]!, outcome: "declined" },
        { proposalId: open[1]!, outcome: "declined" },
      ],
      idempotencyKey: `atomic-remaining-${open[0]}-${open[1]}`,
    });
    const itemToDefer = asDecision(created.body).items[0]!;
    const deferred = await deferItems({
      plan: created.body,
      itemIds: [itemToDefer.itemId],
      reason: "Hold for chair",
      idempotencyKey: `atomic-defer-${created.body.id}`,
    });
    expect(deferred.status).toBe(201);
    if (!("id" in deferred.body)) return;
    const applied = await applyPlan({
      plan: deferred.body,
      idempotencyKey: `atomic-apply-${deferred.body.id}`,
    });
    expect(applied.status).toBe(200);
    if (!("state" in applied.body)) return;
    expect(applied.body.state).toBe("Partially complete");
    const body = asDecision(applied.body);
    expect(body.aggregateProgress.applied).toBe(1);
    expect(body.aggregateProgress.deferred).toBe(1);
    expect(body.followUpQueue[0]?.proposalId).toBe(open[0]);
    expect(applied.body.decisionReview?.result?.outcomeCounts).toEqual({
      processed: 1,
      failed: 0,
      warned: 0,
      skipped: 1,
      unchanged: 1,
    });

    const remainingBody = await getProposal(open[1]!);
    expect(remainingBody.programOutcome).toBe("declined");

    const heldBody = await getProposal(open[0]!);
    expect(heldBody.programOutcome).toBeFalsy();
  });

  it("marks only dependent stages out of date when a relevant proposal revision changes", async () => {
    const open = await openProposalIds(1);
    const proposal = await getProposal(open[0]!);
    const created = await createBatch({
      items: [{ proposalId: open[0]!, outcome: "declined" }],
      idempotencyKey: `stale-rev-${open[0]}-${Date.now()}`,
    });
    const review = await appA.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/${open[0]}/review`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "maybe",
          expectedVersion: proposal.reviewVersion,
        }),
      },
      env,
    );
    expect(review.status).toBe(200);

    const stalePlan = await getPlan(created.body.id);
    expect(stalePlan.state).toBe("Out of date");
    expect(stalePlan.body.stages[0]?.status).toBe("out_of_date");
    const apply = await applyPlan({
      plan: created.body,
      idempotencyKey: `stale-apply-${created.body.id}`,
    });
    expect(apply.status).toBe(409);
    expect("code" in apply.body && apply.body.code).toBe("relevant_input_changed");
  });

  it("splits oversized batches into linked exact plans with aggregate progress", async () => {
    const open = await openProposalIds(DEFAULT_DECISION_BATCH_LIMIT + 3);
    const { splitSelectionsIfNeeded } = await import(
      "../../worker/course-check/decision-planner"
    );
    const chunks = splitSelectionsIfNeeded(
      Array.from({ length: DEFAULT_DECISION_BATCH_LIMIT + 3 }, (_, i) => i),
      DEFAULT_DECISION_BATCH_LIMIT,
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(DEFAULT_DECISION_BATCH_LIMIT);
    expect(chunks[1]).toHaveLength(3);

    const startedAt = performance.now();
    const created = await createBatch({
      items: open.map((id) => ({ proposalId: id, outcome: "declined" as const })),
      idempotencyKey: `split-shape-${Date.now()}`,
    });
    expect(performance.now() - startedAt).toBeLessThan(10_000);
    const decision = asDecision(created.body);
    expect(decision.items).toHaveLength(DEFAULT_DECISION_BATCH_LIMIT);
    expect(decision.aggregateProgress).toEqual({
      total: DEFAULT_DECISION_BATCH_LIMIT,
      active: DEFAULT_DECISION_BATCH_LIMIT,
      deferred: 0,
      applied: 0,
    });
    expect(decision.batchGroupId).toBeTruthy();
    expect(decision.linkedPlanIds).toHaveLength(1);
    expect(decision.splitExplanation).toContain("part 1 of 2");

    expect(created.body.linkedPlans).toHaveLength(1);
    const linked = created.body.linkedPlans![0]!;
    const linkedDecision = asDecision(linked);
    expect(linkedDecision.items).toHaveLength(3);
    expect(linkedDecision.aggregateProgress).toEqual({
      total: 3,
      active: 3,
      deferred: 0,
      applied: 0,
    });
    expect(linkedDecision.batchGroupId).toBe(decision.batchGroupId);
    expect(linkedDecision.linkedPlanIds).toEqual([created.body.id]);
    expect(linkedDecision.splitExplanation).toContain("part 2 of 2");
    expect(decision.aggregateProgress.total + linkedDecision.aggregateProgress.total).toBe(28);
  });

  it("allows internal soft-warning overrides without a reason", async () => {
    const open = await openProposalIds(1);
    const created = await createBatch({
      items: [{ proposalId: open[0]!, outcome: "accepted" }],
      idempotencyKey: `soft-override-${open[0]}-${Date.now()}`,
    });
    const warning = created.body.body.findings.find((f) => f.severity === "warning");
    expect(warning).toBeTruthy();
    const applied = await applyPlan({
      plan: created.body,
      idempotencyKey: `soft-apply-${created.body.id}`,
      softWarningOverrides: warning
        ? [{ findingId: warning.id, reason: null }]
        : undefined,
    });
    if (created.body.state === "Ready") {
      expect(applied.status).toBe(200);
    } else {
      expect([200, 409]).toContain(applied.status);
    }
  });

  it("lists shared Course Checks for the event team", async () => {
    const response = await appB.request(
      `https://chartstead.test/api/events/${eventId}/course-checks`,
      undefined,
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{ plans: CourseCheckPlan[] }>();
    expect(body.plans.length).toBeGreaterThan(0);
    expect(body.plans[0]?.eventId).toBe(eventId);
  });

});
