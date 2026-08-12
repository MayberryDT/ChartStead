import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type {
  CommunicationPlanBody,
  CourseCheckPlan,
} from "../../shared/course-check";
import type { OrganizerPrincipal, OrganizerProposal } from "../../shared/events";
import { createApp } from "../../worker/app";

const eventId = "pacific-open-data-summit-2026";

const adminPrincipal = {
  id: "cc03-admin",
  displayName: "CC03 Admin",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const reviewerPrincipal = {
  id: "cc03-reviewer",
  displayName: "CC03 Reviewer",
  role: "reviewer",
  eventIds: [eventId],
  trackIdsByEvent: { [eventId]: ["platform"] },
} satisfies OrganizerPrincipal;

const adminApp = createApp({
  resolvePrincipal: async () => adminPrincipal,
  signingSecret: "course-check-03-test-signing-secret",
});

const reviewerApp = createApp({
  resolvePrincipal: async () => reviewerPrincipal,
  signingSecret: "course-check-03-test-signing-secret",
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
}): Promise<CourseCheckPlan> {
  const response = await adminApp.request(
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

async function createCommunication(input: {
  decisionPlanId?: string;
  proposalIds?: string[];
  sessionIds?: string[];
  speakerIds?: string[];
  taskIds?: string[];
  subject?: string;
  bodyText?: string;
  idempotencyKey: string;
  app?: typeof adminApp;
}): Promise<{ status: number; body: CourseCheckPlan | { error: string; code?: string } }> {
  const app = input.app ?? adminApp;
  const response = await app.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/communications`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify({
        decisionPlanId: input.decisionPlanId,
        proposalIds: input.proposalIds,
        sessionIds: input.sessionIds,
        speakerIds: input.speakerIds,
        taskIds: input.taskIds,
        subject: input.subject,
        bodyText: input.bodyText,
        idempotencyKey: input.idempotencyKey,
      }),
    },
    env,
  );
  const body = await response.json<CourseCheckPlan | { error: string; code?: string }>();
  return { status: response.status, body };
}

async function reviseCommunication(input: {
  plan: CourseCheckPlan;
  subject?: string;
  bodyText?: string;
  recipientSelection?: Array<{ recipientId: string; selected: boolean }>;
  idempotencyKey: string;
}): Promise<{ status: number; body: CourseCheckPlan | { error: string; code?: string } }> {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/${input.plan.id}/revise`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify({
        planVersion: input.plan.version,
        digest: input.plan.digest,
        subject: input.subject,
        bodyText: input.bodyText,
        recipientSelection: input.recipientSelection,
        idempotencyKey: input.idempotencyKey,
      }),
    },
    env,
  );
  const body = await response.json<CourseCheckPlan | { error: string; code?: string }>();
  return { status: response.status, body };
}

async function createDrafts(input: {
  plan: CourseCheckPlan;
  idempotencyKey: string;
  softWarningOverrides?: Array<{ findingId: string; reason?: string | null }>;
}): Promise<{ status: number; body: CourseCheckPlan | { error: string; code?: string } }> {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/${input.plan.id}/create-drafts`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify({
        planVersion: input.plan.version,
        digest: input.plan.digest,
        stageId: "create-drafts",
        idempotencyKey: input.idempotencyKey,
        softWarningOverrides: input.softWarningOverrides,
      }),
    },
    env,
  );
  const body = await response.json<CourseCheckPlan | { error: string; code?: string }>();
  return { status: response.status, body };
}

function asCommunication(plan: CourseCheckPlan): CommunicationPlanBody {
  if (plan.body.actionType !== "communication") {
    throw new Error("expected communication plan");
  }
  return plan.body;
}

describe("Course Check 03 — communication drafts and recipient reasoning", () => {
  beforeAll(async () => {
    await loadEvent();
  });

  it("creates a linked Communication Course Check from a completed Decision without transferring approval", async () => {
    const proposalId = "SUB-PODS0021";
    const decision = await createDecisionPlan({
      proposalId,
      outcome: "accepted",
      idempotencyKey: `cc03-dec-${proposalId}`,
    });
    const applied = await applyDecision(decision, `cc03-dec-apply-${proposalId}`);
    expect(applied.approval?.stageId).toBe("apply-decision");
    expect(applied.receipt).toBeTruthy();

    const created = await createCommunication({
      decisionPlanId: applied.id,
      idempotencyKey: `cc03-link-${proposalId}`,
    });
    expect(created.status).toBe(201);
    const plan = created.body as CourseCheckPlan;
    const body = asCommunication(plan);
    expect(body.source.kind).toBe("linked_decision");
    expect(body.source.decisionPlanId).toBe(applied.id);
    expect(body.parentPlanId).toBe(applied.id);
    expect(body.linkedPlanIds).toContain(applied.id);
    // No approval inheritance
    expect(plan.approval).toBeNull();
    expect(plan.receipt).toBeNull();
    expect(body.stageVisibility.decision).toBe("complete");
    expect(body.stageVisibility.draft).toBe("ready");
    expect(body.stageVisibility.send).toBe("not_started");
    expect(body.stages.some((stage) => stage.id === "create-drafts")).toBe(true);
    expect(body.stages.some((stage) => stage.id === "send-messages")).toBe(true);

    const reloadedDecision = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/${applied.id}`,
      undefined,
      env,
    );
    const decisionPlan = await reloadedDecision.json<CourseCheckPlan>();
    expect(decisionPlan.approval?.stageId).toBe("apply-decision");
    expect(decisionPlan.receipt).toBeTruthy();
    if (decisionPlan.body.actionType === "decision") {
      expect(decisionPlan.body.linkedPlanIds).toContain(plan.id);
    }
  });

  it("starts Communication Course Check from proposal selection with co-speaker grouping and reasons", async () => {
    const proposalId = "SUB-PODS0022";
    const store = env.EVENT_STORE.getByName(eventId);
    await store.setProposalCoSpeakersForTest(proposalId, [
      {
        name: "Co Speaker TwentyTwo",
        email: "co-twenty-two@example.test",
        biography: "Co bio",
      },
      {
        name: "Duplicate Address Person",
        email: "co-twenty-two@example.test",
        biography: "Same address",
      },
    ]);
    // Declined keeps proposal speaker list (including in-group duplicate addresses).
    const decision = await createDecisionPlan({
      proposalId,
      outcome: "declined",
      idempotencyKey: `cc03-cospeak-dec-${proposalId}`,
    });
    await applyDecision(decision, `cc03-cospeak-apply-${proposalId}`);
    const proposal = await getProposal(proposalId);

    const created = await createCommunication({
      proposalIds: [proposalId],
      idempotencyKey: `cc03-select-${proposalId}`,
    });
    expect(created.status).toBe(201);
    const body = asCommunication(created.body as CourseCheckPlan);
    expect(body.source.kind).toBe("selection");
    expect(body.recipientGroups).toHaveLength(1);
    const group = body.recipientGroups[0]!;
    expect(group.proposalId).toBe(proposalId);
    expect(group.recipients.length).toBeGreaterThanOrEqual(3);
    expect(group.recipients.some((r) => r.role === "primary")).toBe(true);
    expect(group.recipients.some((r) => r.role === "co")).toBe(true);
    expect(
      group.recipients.every((r) => r.inclusionReason && r.inclusionReason.length > 10),
    ).toBe(true);
    expect(group.recipients.some((r) => r.inclusion === "duplicate")).toBe(true);
    expect(
      group.recipients.some(
        (r) =>
          r.address === proposal.speakerEmail.toLowerCase() ||
          r.address === "co-twenty-two@example.test",
      ),
    ).toBe(true);
  });

  it("surfaces missing addresses and prior related communication before draft approval", async () => {
    const proposalId = "SUB-PODS0023";
    const store = env.EVENT_STORE.getByName(eventId);
    // Decline path keeps proposal-level speakers (including missing emails) without cascade rows.
    await store.setProposalCoSpeakersForTest(proposalId, [
      {
        name: "Missing Email Co",
        email: "",
        biography: "No address",
      },
    ]);
    const decision = await createDecisionPlan({
      proposalId,
      outcome: "declined",
      idempotencyKey: `cc03-prior-dec-${proposalId}`,
    });
    await applyDecision(decision, `cc03-prior-apply-${proposalId}`);
    const proposal = await getProposal(proposalId);

    // Seed a prior outbox send for this proposal.
    store.queueOutboxMessage({
      id: crypto.randomUUID(),
      kind: "submission_confirmation",
      toEmail: proposal.speakerEmail,
      subject: "Earlier decision notice",
      textBody: "Prior send body",
      htmlBody: "<p>Prior send body</p>",
      proposalId,
    });

    const created = await createCommunication({
      proposalIds: [proposalId],
      idempotencyKey: `cc03-prior-${proposalId}`,
    });
    expect(created.status).toBe(201);
    const body = asCommunication(created.body as CourseCheckPlan);
    expect(body.findings.some((f) => f.code === "recipient_missing_address")).toBe(true);
    expect(body.findings.some((f) => f.code === "prior_related_communication")).toBe(true);
    const withPrior = body.recipientGroups[0]!.recipients.find(
      (r) => r.priorCommunications.length > 0,
    );
    expect(withPrior).toBeTruthy();
    expect(withPrior!.priorCommunications[0]!.subject).toContain("Earlier");
  });

  it("edits subject/body into a new immutable version and invalidates only draft approval", async () => {
    const proposalId = "SUB-PODS0024";
    const decision = await createDecisionPlan({
      proposalId,
      outcome: "declined",
      idempotencyKey: `cc03-edit-dec-${proposalId}`,
    });
    const appliedDecision = await applyDecision(decision, `cc03-edit-apply-${proposalId}`);
    const created = await createCommunication({
      decisionPlanId: appliedDecision.id,
      idempotencyKey: `cc03-edit-create-${proposalId}`,
    });
    const plan = created.body as CourseCheckPlan;
    const revised = await reviseCommunication({
      plan,
      subject: "Custom declined subject",
      bodyText: "Custom declined body for staff review.",
      idempotencyKey: `cc03-edit-revise-${proposalId}`,
    });
    expect(revised.status).toBe(201);
    const next = revised.body as CourseCheckPlan;
    expect(next.version).toBe(plan.version + 1);
    expect(next.digest).not.toBe(plan.digest);
    const body = asCommunication(next);
    expect(body.subject).toBe("Custom declined subject");
    expect(body.bodyText).toContain("Custom declined body");
    expect(body.stageVisibility.decision).toBe("complete");
    expect(body.stageVisibility.draft).toBe("ready");
    expect(next.approval).toBeNull();
    expect(next.versions?.some((v) => v.version === plan.version)).toBe(true);
    expect(next.mutations?.some((m) => m.kind === "revise")).toBe(true);

    // Linked decision approval remains intact.
    const decisionReload = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/${appliedDecision.id}`,
      undefined,
      env,
    );
    const decisionPlan = await decisionReload.json<CourseCheckPlan>();
    expect(decisionPlan.approval).toBeTruthy();
    expect(decisionPlan.receipt).toBeTruthy();
  });

  it("Create drafts freezes exact payloads transactionally without provider or outbox calls", async () => {
    const proposalId = "SUB-PODS0025";
    const store = env.EVENT_STORE.getByName(eventId);
    const decision = await createDecisionPlan({
      proposalId,
      outcome: "accepted",
      idempotencyKey: `cc03-draft-dec-${proposalId}`,
    });
    await applyDecision(decision, `cc03-draft-apply-${proposalId}`);
    const created = await createCommunication({
      proposalIds: [proposalId],
      subject: "Frozen acceptance subject",
      bodyText: "Frozen acceptance body.",
      idempotencyKey: `cc03-draft-create-${proposalId}`,
    });
    const plan = created.body as CourseCheckPlan;
    const outboxBefore = await store.listOutboxMessages();

    const first = await createDrafts({
      plan,
      idempotencyKey: `cc03-drafts-${proposalId}`,
    });
    expect(first.status).toBe(201);
    const frozen = first.body as CourseCheckPlan;
    const body = asCommunication(frozen);
    expect(body.drafts.length).toBeGreaterThan(0);
    expect(body.drafts.every((d) => d.status === "frozen")).toBe(true);
    expect(body.drafts.every((d) => d.subject === "Frozen acceptance subject")).toBe(true);
    expect(body.drafts.every((d) => d.bodyText === "Frozen acceptance body.")).toBe(true);
    expect(body.stageVisibility.draft).toBe("complete");
    expect(body.stageVisibility.send).toBe("ready");
    expect(body.stageVisibility.delivery).toBe("not_started");
    expect(body.stages.find((s) => s.id === "create-drafts")?.status).toBe("complete");
    expect(frozen.state).toBe("Partially complete");
    expect(frozen.approval?.stageId).toBe("create-drafts");
    expect(frozen.receipt?.stageId).toBe("create-drafts");

    const durable = await store.listCommunicationDrafts(frozen.id);
    expect(durable).toHaveLength(body.drafts.length);
    expect(durable[0]).toMatchObject({
      subject: "Frozen acceptance subject",
      bodyText: "Frozen acceptance body.",
      status: "frozen",
    });

    const outboxAfter = await store.listOutboxMessages();
    expect(outboxAfter).toHaveLength(outboxBefore.length);
    expect(
      outboxAfter.every(
        (msg) =>
          msg.kind === "submission_confirmation" || msg.kind === "onboarding_reminder",
      ),
    ).toBe(true);

    // Idempotent replay
    const second = await createDrafts({
      plan: frozen,
      idempotencyKey: `cc03-drafts-${proposalId}`,
    });
    expect(second.status).toBe(200);
    expect((second.body as CourseCheckPlan).id).toBe(frozen.id);
    expect(await store.listCommunicationDrafts(frozen.id)).toHaveLength(
      body.drafts.length,
    );
  });

  it("redacts private recipient and draft evidence for reviewers without communication authority", async () => {
    const proposalId = "SUB-PODS0026";
    const decision = await createDecisionPlan({
      proposalId,
      outcome: "accepted",
      idempotencyKey: `cc03-role-dec-${proposalId}`,
    });
    await applyDecision(decision, `cc03-role-apply-${proposalId}`);
    const created = await createCommunication({
      proposalIds: [proposalId],
      subject: "Secret subject line",
      bodyText: "Secret body content",
      idempotencyKey: `cc03-role-create-${proposalId}`,
    });
    const plan = created.body as CourseCheckPlan;
    await createDrafts({
      plan,
      idempotencyKey: `cc03-role-drafts-${proposalId}`,
    });

    const reviewerGet = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/${plan.id}`,
      undefined,
      env,
    );
    expect(reviewerGet.status).toBe(200);
    const redacted = await reviewerGet.json<CourseCheckPlan>();
    const body = asCommunication(redacted);
    expect(body.redacted).toBe(true);
    expect(body.subject).toBe("[redacted]");
    expect(body.bodyText).toBe("[redacted]");
    expect(body.recipientGroups[0]?.recipients[0]?.address).toBe("[redacted]");
    expect(body.drafts[0]?.subject).toBe("[redacted]");

    const forbiddenCreate = await createCommunication({
      proposalIds: [proposalId],
      idempotencyKey: `cc03-role-forbidden-${proposalId}`,
      app: reviewerApp,
    });
    expect(forbiddenCreate.status).toBe(403);
    expect(forbiddenCreate.body).toMatchObject({ code: "missing_authority" });
  });

  it("keeps decision, draft, send, and delivery states independently visible", async () => {
    const proposalId = "SUB-PODS0027";
    const decision = await createDecisionPlan({
      proposalId,
      outcome: "accepted",
      idempotencyKey: `cc03-vis-dec-${proposalId}`,
    });
    const applied = await applyDecision(decision, `cc03-vis-apply-${proposalId}`);
    const created = await createCommunication({
      decisionPlanId: applied.id,
      idempotencyKey: `cc03-vis-create-${proposalId}`,
    });
    const plan = created.body as CourseCheckPlan;
    let body = asCommunication(plan);
    expect(body.stageVisibility).toEqual({
      decision: "complete",
      draft: "ready",
      send: "not_started",
      delivery: "not_started",
    });

    const priorFinding = body.findings.find(
      (f) => f.code === "prior_related_communication",
    );
    const drafts = await createDrafts({
      plan,
      idempotencyKey: `cc03-vis-drafts-${proposalId}`,
      softWarningOverrides: priorFinding
        ? [{ findingId: priorFinding.id, reason: "Confirmed not a resend." }]
        : undefined,
    });
    expect(drafts.status).toBe(201);
    body = asCommunication(drafts.body as CourseCheckPlan);
    expect(body.stageVisibility.decision).toBe("complete");
    expect(body.stageVisibility.draft).toBe("complete");
    expect(body.stageVisibility.send).toBe("ready");
    expect(body.stageVisibility.delivery).toBe("not_started");
    // Send stage remains non-executable in this ticket
    expect(body.stages.find((s) => s.id === "send-messages")?.status).toBe("pending");
  });

  it("keeps a direct speaker selection exact instead of expanding to every proposal speaker", async () => {
    const proposalId = "SUB-PODS0028";
    const store = env.EVENT_STORE.getByName(eventId);
    await store.setProposalCoSpeakersForTest(proposalId, [
      {
        name: "Exact Scope Co-speaker",
        email: "exact-scope-co@example.test",
        biography: "Co-speaker who should not be selected implicitly.",
      },
    ]);
    const decision = await createDecisionPlan({
      proposalId,
      outcome: "accepted",
      idempotencyKey: `cc26-exact-dec-${proposalId}`,
    });
    await applyDecision(decision, `cc26-exact-apply-${proposalId}`);
    const cascade = await store.getAcceptanceCascade(proposalId);
    expect(cascade.speakers).toHaveLength(2);

    const selectedSpeaker = cascade.speakers[0]!;
    const created = await createCommunication({
      speakerIds: [selectedSpeaker.id],
      subject: "A general announcement",
      bodyText: "Hello {{speaker_name}}.",
      idempotencyKey: `cc26-exact-create-${proposalId}`,
    });

    expect(created.status).toBe(201);
    const body = asCommunication(created.body as CourseCheckPlan);
    expect(body.source.selection?.speakerIds).toEqual([selectedSpeaker.id]);
    expect(body.recipientGroups).toHaveLength(1);
    expect(body.recipientGroups[0]?.proposalId).toBeNull();
    expect(body.recipientGroups[0]?.recipients).toHaveLength(1);
    expect(body.recipientGroups[0]?.recipients[0]).toMatchObject({
      speakerId: selectedSpeaker.id,
      name: selectedSpeaker.name,
      selected: true,
    });
  });

  it("freezes recipient-specific substitutions without sending", async () => {
    const proposalId = "SUB-PODS0029";
    const store = env.EVENT_STORE.getByName(eventId);
    const decision = await createDecisionPlan({
      proposalId,
      outcome: "accepted",
      idempotencyKey: `cc26-substitute-dec-${proposalId}`,
    });
    await applyDecision(decision, `cc26-substitute-apply-${proposalId}`);
    const cascade = await store.getAcceptanceCascade(proposalId);
    const speaker = cascade.speakers[0]!;
    const outboxBefore = await store.listOutboxMessages();
    const created = await createCommunication({
      speakerIds: [speaker.id],
      subject: "A note for {{speaker_name}}",
      bodyText:
        "Hello {{speaker_name}},\n\nThis is an update about {{proposal_title}} at {{event_name}}.",
      idempotencyKey: `cc26-substitute-create-${proposalId}`,
    });
    const plan = created.body as CourseCheckPlan;

    const result = await createDrafts({
      plan,
      idempotencyKey: `cc26-substitute-drafts-${proposalId}`,
    });

    expect(result.status).toBe(201);
    const body = asCommunication(result.body as CourseCheckPlan);
    expect(body.drafts).toHaveLength(1);
    expect(body.drafts[0]).toMatchObject({
      recipientName: speaker.name,
      subject: `A note for ${speaker.name}`,
    });
    expect(body.drafts[0]?.bodyText).toContain(`Hello ${speaker.name},`);
    expect(body.drafts[0]?.bodyText).toContain("Pacific Open Data Summit 2026");
    expect(body.drafts[0]?.bodyText).not.toContain("{{");
    expect(await store.listOutboxMessages()).toEqual(outboxBefore);
  });

  it("blocks draft creation when a directly selected speaker changed", async () => {
    const proposalId = "SUB-PODS0030";
    const store = env.EVENT_STORE.getByName(eventId);
    const decision = await createDecisionPlan({
      proposalId,
      outcome: "accepted",
      idempotencyKey: `cc26-stale-dec-${proposalId}`,
    });
    await applyDecision(decision, `cc26-stale-apply-${proposalId}`);
    const cascade = await store.getAcceptanceCascade(proposalId);
    const speaker = cascade.speakers[0]!;
    const created = await createCommunication({
      speakerIds: [speaker.id],
      idempotencyKey: `cc26-stale-create-${proposalId}`,
    });
    const plan = created.body as CourseCheckPlan;
    await store.updateSpeakerProfileForTest(speaker.id, {
      name: `${speaker.name} Updated`,
    });

    const result = await createDrafts({
      plan,
      idempotencyKey: `cc26-stale-drafts-${proposalId}`,
    });

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ code: "relevant_input_changed" });
  });
});
