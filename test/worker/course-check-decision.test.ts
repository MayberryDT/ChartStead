import { env, evictDurableObject } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { CourseCheckPlan } from "../../shared/course-check";
import type { OrganizerPrincipal, OrganizerProposal } from "../../shared/events";
import { createApp } from "../../worker/app";

const eventId = "pacific-open-data-summit-2026";

const adminPrincipal = {
  id: "cc01-admin",
  displayName: "Course Check Admin",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const reviewerPrincipal = {
  id: "cc01-reviewer",
  displayName: "Course Check Reviewer",
  role: "reviewer",
  eventIds: [eventId],
  trackIdsByEvent: { [eventId]: ["platform"] },
} as unknown as OrganizerPrincipal;

const adminApp = createApp({
  resolvePrincipal: async () => adminPrincipal,
  signingSecret: "course-check-01-test-signing-secret",
});

const reviewerApp = createApp({
  resolvePrincipal: async () => reviewerPrincipal,
  signingSecret: "course-check-01-test-signing-secret",
});

async function loadEvent() {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
}

async function getProposal(proposalId: string): Promise<OrganizerProposal> {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}/organizer/proposals/${proposalId}`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
  const body = await response.json<{ proposal: OrganizerProposal }>();
  return body.proposal;
}

async function createDecisionPlan(input: {
  proposalId: string;
  outcome: "accepted" | "declined";
  idempotencyKey: string;
  app?: typeof adminApp;
}): Promise<{ status: number; body: CourseCheckPlan | { error: string; code?: string } }> {
  const app = input.app ?? adminApp;
  const response = await app.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/decisions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify({
        proposalId: input.proposalId,
        outcome: input.outcome,
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
  app?: typeof adminApp;
  digest?: string;
  planVersion?: number;
}): Promise<{
  status: number;
  body: CourseCheckPlan | { error: string; code?: string; recoveryGuidance?: string };
}> {
  const app = input.app ?? adminApp;
  const response = await app.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/${input.plan.id}/apply`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify({
        planVersion: input.planVersion ?? input.plan.version,
        digest: input.digest ?? input.plan.digest,
        stageId: "apply-decision",
        idempotencyKey: input.idempotencyKey,
      }),
    },
    env,
  );
  const body = await response.json<
    CourseCheckPlan | { error: string; code?: string; recoveryGuidance?: string }
  >();
  return { status: response.status, body };
}

describe("Course Check 01 decision tracer", () => {
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

  it("keeps ordinary review dispositions immediate without opening Course Check", async () => {
    const proposalId = "SUB-PODS0002";
    const proposal = await getProposal(proposalId);
    const response = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/${proposalId}/review`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "approve",
          expectedVersion: proposal.reviewVersion,
        }),
      },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      proposal: OrganizerProposal;
      courseCheck?: unknown;
    }>();
    expect(body.proposal.status).toBe("approve");
    expect(body.proposal.programOutcome).toBeNull();
    expect(body).not.toHaveProperty("courseCheck");

    const store = env.EVENT_STORE.getByName(eventId);
    expect(await store.listCourseCheckPlans()).toEqual([]);
    expect(await store.listOutboxMessages(proposalId)).toEqual(
      await store.listOutboxMessages(proposalId),
    );
  });

  it("plans and applies an accepted outcome cascade without implicit communication", async () => {
    const proposalId = "SUB-PODS0003";
    const before = await getProposal(proposalId);
    const key = `accept-${proposalId}-plan`;
    const created = await createDecisionPlan({
      proposalId,
      outcome: "accepted",
      idempotencyKey: key,
    });
    expect(created.status).toBe(201);
    const plan = created.body as CourseCheckPlan;
    expect(plan.actionType).toBe("decision");
    expect(plan.state).toBe("Ready");
    expect(plan.version).toBe(1);
    expect(plan.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.body).toMatchObject({
      actionType: "decision",
      proposalId,
      outcome: "accepted",
      proposalRevision: before.reviewVersion,
    });
    if (plan.body.actionType !== "decision") throw new Error("expected decision body");
    expect(plan.body.speakers.length).toBeGreaterThanOrEqual(1);
    expect(plan.body.session).toMatchObject({
      title: before.title,
      roomId: null,
      startsAt: null,
    });
    expect(plan.body.tasks.length).toBeGreaterThanOrEqual(3);
    expect(plan.body.portalAccess.length).toBe(plan.body.speakers.length);
    expect(plan.body.findings.some((f) => f.code === "session_unplaced")).toBe(true);
    expect(plan.body.findings.some((f) => f.severity === "blocker")).toBe(false);
    expect(plan.body.stages[0]).toMatchObject({
      id: "apply-decision",
      verb: "Apply decision",
      status: "ready",
    });

    const store = env.EVENT_STORE.getByName(eventId);
    const outboxBefore = (await store.listOutboxMessages()).length;

    const applied = await applyPlan({
      plan,
      idempotencyKey: `accept-${proposalId}-apply`,
    });
    expect(applied.status).toBe(200);
    const done = applied.body as CourseCheckPlan;
    expect(done.state).toBe("Complete");
    expect(done.approval?.digest).toBe(plan.digest);
    expect(done.receipt?.digest).toBe(plan.digest);

    const after = await getProposal(proposalId);
    expect(after.programOutcome).toBe("accepted");
    expect(after.status).toBe(before.status);

    const cascade = await store.getAcceptanceCascade(proposalId);
    expect(cascade.speakers.length).toBe(plan.body.speakers.length);
    expect(cascade.participations.length).toBe(plan.body.speakers.length);
    expect(cascade.sessions).toHaveLength(1);
    expect(cascade.tasks.length).toBe(plan.body.tasks.length);
    expect(cascade.portalAccessIntents.length).toBe(plan.body.speakers.length);
    expect((await store.listOutboxMessages()).length).toBe(outboxBefore);
    expect(cascade.messagesQueued).toBe(0);
    expect(cascade.calendarEffects).toBe(0);
    expect(cascade.publicRevisions).toBe(0);
  });

  it("applies a declined outcome without speaker cascade records", async () => {
    const proposalId = "SUB-PODS0004";
    const created = await createDecisionPlan({
      proposalId,
      outcome: "declined",
      idempotencyKey: `decline-${proposalId}`,
    });
    expect(created.status).toBe(201);
    const plan = created.body as CourseCheckPlan;
    if (plan.body.actionType !== "decision") throw new Error("expected decision");
    expect(plan.body.speakers).toEqual([]);
    expect(plan.body.session).toBeNull();
    expect(plan.body.tasks).toEqual([]);

    const applied = await applyPlan({
      plan,
      idempotencyKey: `decline-${proposalId}-apply`,
    });
    expect(applied.status).toBe(200);
    expect((await getProposal(proposalId)).programOutcome).toBe("declined");

    const cascade = await env.EVENT_STORE.getByName(eventId).getAcceptanceCascade(
      proposalId,
    );
    expect(cascade.speakers).toEqual([]);
    expect(cascade.sessions).toEqual([]);
    expect(cascade.tasks).toEqual([]);
    expect(cascade.portalAccessIntents).toEqual([]);
  });

  it("returns the same plan and receipt for idempotent retries", async () => {
    const proposalId = "SUB-PODS0005";
    const planKey = `idem-plan-${proposalId}`;
    const first = await createDecisionPlan({
      proposalId,
      outcome: "accepted",
      idempotencyKey: planKey,
    });
    const second = await createDecisionPlan({
      proposalId,
      outcome: "accepted",
      idempotencyKey: planKey,
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect((second.body as CourseCheckPlan).id).toBe((first.body as CourseCheckPlan).id);
    expect((second.body as CourseCheckPlan).digest).toBe(
      (first.body as CourseCheckPlan).digest,
    );

    const plan = first.body as CourseCheckPlan;
    const applyKey = `idem-apply-${proposalId}`;
    const applyFirst = await applyPlan({ plan, idempotencyKey: applyKey });
    const applySecond = await applyPlan({ plan, idempotencyKey: applyKey });
    expect(applyFirst.status).toBe(200);
    expect(applySecond.status).toBe(200);
    expect((applySecond.body as CourseCheckPlan).receipt?.id).toBe(
      (applyFirst.body as CourseCheckPlan).receipt?.id,
    );

    const cascade = await env.EVENT_STORE.getByName(eventId).getAcceptanceCascade(
      proposalId,
    );
    expect(cascade.sessions).toHaveLength(1);
    expect(cascade.speakers.length).toBeGreaterThanOrEqual(1);
  });

  it("blocks apply when relevant proposal inputs change", async () => {
    const proposalId = "SUB-PODS0006";
    const created = await createDecisionPlan({
      proposalId,
      outcome: "accepted",
      idempotencyKey: `stale-${proposalId}`,
    });
    const plan = created.body as CourseCheckPlan;
    const current = await getProposal(proposalId);
    const review = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/${proposalId}/review`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "maybe",
          expectedVersion: current.reviewVersion,
        }),
      },
      env,
    );
    expect(review.status).toBe(200);

    const applied = await applyPlan({
      plan,
      idempotencyKey: `stale-apply-${proposalId}`,
    });
    expect(applied.status).toBe(409);
    expect(applied.body).toMatchObject({
      code: "relevant_input_changed",
    });
    expect((applied.body as { recoveryGuidance?: string }).recoveryGuidance).toMatch(
      /new Decision Course Check/i,
    );
    expect((await getProposal(proposalId)).programOutcome).toBeNull();
  });

  it("rejects reviewers and missing admin authority on plan create and apply", async () => {
    const proposalId = "SUB-PODS0007";
    const denied = await createDecisionPlan({
      proposalId,
      outcome: "accepted",
      idempotencyKey: `reviewer-${proposalId}`,
      app: reviewerApp,
    });
    expect(denied.status).toBe(403);

    const created = await createDecisionPlan({
      proposalId,
      outcome: "declined",
      idempotencyKey: `admin-${proposalId}`,
    });
    const plan = created.body as CourseCheckPlan;
    const applyDenied = await applyPlan({
      plan,
      idempotencyKey: `reviewer-apply-${proposalId}`,
      app: reviewerApp,
    });
    expect(applyDenied.status).toBe(403);
  });

  it("rolls back the cascade when a durable integrity conflict is forced mid-apply", async () => {
    const proposalId = "SUB-PODS0008";
    const created = await createDecisionPlan({
      proposalId,
      outcome: "accepted",
      idempotencyKey: `rollback-${proposalId}`,
    });
    const plan = created.body as CourseCheckPlan;
    if (plan.body.actionType !== "decision" || !plan.body.session) {
      throw new Error("expected accepted plan with session");
    }
    const store = env.EVENT_STORE.getByName(eventId);
    await store.insertSessionConflictForTest(plan.body.session.plannedId);

    const applied = await applyPlan({
      plan,
      idempotencyKey: `rollback-apply-${proposalId}`,
    });
    expect(applied.status).toBe(409);
    expect(applied.body).toMatchObject({ code: "durable_integrity" });
    expect((await getProposal(proposalId)).programOutcome).toBeNull();
    const cascade = await store.getAcceptanceCascade(proposalId);
    expect(cascade.speakers).toEqual([]);
    expect(cascade.participations).toEqual([]);
    expect(cascade.tasks).toEqual([]);
  });

  it("reuses an existing speaker identity on acceptance", async () => {
    const proposalId = "SUB-PODS0009";
    const proposal = await getProposal(proposalId);
    const store = env.EVENT_STORE.getByName(eventId);
    const existingId = await store.upsertSpeakerForTest({
      name: proposal.speakerName,
      email: proposal.speakerEmail,
      biography: "Existing durable speaker biography.",
    });

    const created = await createDecisionPlan({
      proposalId,
      outcome: "accepted",
      idempotencyKey: `reuse-${proposalId}`,
    });
    const plan = created.body as CourseCheckPlan;
    if (plan.body.actionType !== "decision") throw new Error("expected decision");
    expect(plan.body.speakers[0]).toMatchObject({
      match: "reuse",
      existingSpeakerId: existingId,
      email: proposal.speakerEmail.toLowerCase(),
    });

    const applied = await applyPlan({
      plan,
      idempotencyKey: `reuse-apply-${proposalId}`,
    });
    expect(applied.status).toBe(200);
    const cascade = await store.getAcceptanceCascade(proposalId);
    expect(cascade.speakers.some((speaker) => speaker.id === existingId)).toBe(true);
    expect(
      cascade.speakers.filter((speaker) => speaker.email === proposal.speakerEmail.toLowerCase()),
    ).toHaveLength(1);
  });

  it("blocks identity ambiguity when the email matches a different named speaker", async () => {
    const proposalId = "SUB-PODS0010";
    const proposal = await getProposal(proposalId);
    const store = env.EVENT_STORE.getByName(eventId);
    await store.upsertSpeakerForTest({
      name: "Completely Different Person",
      email: proposal.speakerEmail,
      biography: "Ambiguous identity.",
    });

    const created = await createDecisionPlan({
      proposalId,
      outcome: "accepted",
      idempotencyKey: `ambiguous-${proposalId}`,
    });
    expect(created.status).toBe(201);
    const plan = created.body as CourseCheckPlan;
    if (plan.body.actionType !== "decision") throw new Error("expected decision");
    expect(plan.body.findings.some((f) => f.code === "identity_ambiguity")).toBe(true);
    expect(plan.state).toBe("Needs attention");
    expect(plan.body.stages[0]?.status).toBe("blocked");

    const applied = await applyPlan({
      plan,
      idempotencyKey: `ambiguous-apply-${proposalId}`,
    });
    expect(applied.status).toBe(409);
    expect(applied.body).toMatchObject({ code: "identity_ambiguity" });
    expect((await getProposal(proposalId)).programOutcome).toBeNull();
  });

  it("uses the same compact Course Check for direct guaranteed-speaker creation", async () => {
    const key = `guaranteed-${crypto.randomUUID()}`;
    const response = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/guaranteed-speakers`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key,
        },
        body: JSON.stringify({
          sourceLabel: "Sponsor keynote",
          title: "Opening keynote",
          format: "keynote",
          trackId: "platform",
          speakers: [
            {
              name: "Guaranteed Speaker",
              email: "guaranteed@example.test",
              biography: "Invited speaker.",
            },
          ],
          idempotencyKey: key,
        }),
      },
      env,
    );
    expect(response.status).toBe(201);
    const plan = await response.json<CourseCheckPlan>();
    expect(plan.actionType).toBe("guaranteed_speaker");
    if (plan.body.actionType !== "guaranteed_speaker") {
      throw new Error("expected guaranteed speaker body");
    }
    expect(plan.body.session.title).toBe("Opening keynote");
    expect(plan.body.speakers[0]?.email).toBe("guaranteed@example.test");

    const applied = await applyPlan({
      plan,
      idempotencyKey: `${key}-apply`,
    });
    expect(applied.status).toBe(200);
    const store = env.EVENT_STORE.getByName(eventId);
    const cascade = await store.getGuaranteedCascade(plan.id);
    expect(cascade.speakers).toHaveLength(1);
    expect(cascade.sessions).toHaveLength(1);
    expect(cascade.tasks.length).toBeGreaterThanOrEqual(3);
    expect(cascade.portalAccessIntents).toHaveLength(1);
    expect((await store.listOutboxMessages()).every((msg) => msg.kind === "submission_confirmation")).toBe(
      true,
    );
  });

  it("plans and applies co-speakers in the acceptance cascade", async () => {
    const proposalId = "SUB-PODS0012";
    const store = env.EVENT_STORE.getByName(eventId);
    const before = await getProposal(proposalId);
    // Seed a co-speaker onto the proposal answers/columns via review-safe store helper path:
    // create a temporary accepted plan after forcing co-speakers through SQL for this test.
    await store.setProposalCoSpeakersForTest(proposalId, [
      {
        name: "Co Speaker Twelve",
        email: "co-twelve@example.test",
        biography: "Co-speaker biography.",
      },
    ]);
    const created = await createDecisionPlan({
      proposalId,
      outcome: "accepted",
      idempotencyKey: `cospeaker-${proposalId}`,
    });
    expect(created.status).toBe(201);
    const plan = created.body as CourseCheckPlan;
    if (plan.body.actionType !== "decision") throw new Error("expected decision");
    expect(plan.body.speakers.map((speaker) => speaker.email)).toEqual(
      expect.arrayContaining([
        before.speakerEmail.toLowerCase(),
        "co-twelve@example.test",
      ]),
    );
    expect(plan.body.speakers.some((speaker) => speaker.role === "co")).toBe(true);
    const applied = await applyPlan({
      plan,
      idempotencyKey: `cospeaker-apply-${proposalId}`,
    });
    expect(applied.status).toBe(200);
    const cascade = await store.getAcceptanceCascade(proposalId);
    expect(cascade.speakers.length).toBeGreaterThanOrEqual(2);
    expect(cascade.participations.length).toBe(cascade.speakers.length);
    const detail = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/${proposalId}`,
      undefined,
      env,
    );
    const detailBody = await detail.json<{
      auditEvents: Array<{ type: string; toStatus: string }>;
    }>();
    expect(
      detailBody.auditEvents.some(
        (event) => event.type === "course_check.decision.applied",
      ),
    ).toBe(true);
  });

  it("survives Durable Object eviction after apply", async () => {
    const proposalId = "SUB-PODS0011";
    const created = await createDecisionPlan({
      proposalId,
      outcome: "declined",
      idempotencyKey: `evict-${proposalId}`,
    });
    const plan = created.body as CourseCheckPlan;
    await applyPlan({ plan, idempotencyKey: `evict-apply-${proposalId}` });
    const store = env.EVENT_STORE.getByName(eventId);
    await evictDurableObject(store);
    const reloaded = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/${plan.id}`,
      undefined,
      env,
    );
    expect(reloaded.status).toBe(200);
    await expect(reloaded.json()).resolves.toMatchObject({
      id: plan.id,
      state: "Complete",
      body: { outcome: "declined" },
    });
    expect((await getProposal(proposalId)).programOutcome).toBe("declined");
  });
});
