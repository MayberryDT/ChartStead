import { env, evictDurableObject } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type {
  CommunicationPlanBody,
  CourseCheckPlan,
} from "../../shared/course-check";
import type { OrganizerPrincipal } from "../../shared/events";
import { createApp } from "../../worker/app";
import { flushCommunicationEffects } from "../../worker/course-check/communication-delivery";

const eventId = "pacific-open-data-summit-2026";

const adminPrincipal = {
  id: "cc04-admin",
  displayName: "CC04 Admin",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const app = createApp({
  resolvePrincipal: async () => adminPrincipal,
  signingSecret: "course-check-04-test-signing-secret",
});

async function post(
  path: string,
  body: Record<string, unknown>,
  target = app,
): Promise<Response> {
  return target.request(
    `https://chartstead.test/api/events/${eventId}${path}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": String(body.idempotencyKey ?? ""),
      },
      body: JSON.stringify(body),
    },
    env,
  );
}

async function prepareFrozenCommunication(
  proposalId: string,
  keyPrefix: string,
): Promise<CourseCheckPlan> {
  const decisionResponse = await post("/course-checks/decisions", {
    proposalId,
    outcome: "declined",
    idempotencyKey: `${keyPrefix}-decision`,
  });
  expect(decisionResponse.status).toBe(201);
  const decision = await decisionResponse.json<CourseCheckPlan>();

  const applyResponse = await post(`/course-checks/${decision.id}/apply`, {
    planVersion: decision.version,
    digest: decision.digest,
    stageId: "apply-decision",
    idempotencyKey: `${keyPrefix}-apply`,
  });
  expect(applyResponse.status).toBe(200);

  const communicationResponse = await post("/course-checks/communications", {
    proposalIds: [proposalId],
    subject: "Frozen delivery subject",
    bodyText: "Frozen delivery body.",
    idempotencyKey: `${keyPrefix}-communication`,
  });
  expect(communicationResponse.status).toBe(201);
  const communication = await communicationResponse.json<CourseCheckPlan>();

  const draftsResponse = await post(
    `/course-checks/${communication.id}/create-drafts`,
    {
      planVersion: communication.version,
      digest: communication.digest,
      stageId: "create-drafts",
      idempotencyKey: `${keyPrefix}-drafts`,
    },
  );
  expect(draftsResponse.status).toBe(201);
  return draftsResponse.json<CourseCheckPlan>();
}

type DeliveryEffectView = {
  effectId: string;
  draftId: string;
  toEmail: string;
  payloadIdentity: string;
  status: string;
  providerReference: string | null;
  attemptCount: number;
  lastError: string | null;
  nextAttemptAt: string | null;
};

function communicationBody(plan: CourseCheckPlan): CommunicationPlanBody & {
  effects: DeliveryEffectView[];
} {
  if (plan.body.actionType !== "communication") {
    throw new Error("expected communication plan");
  }
  return plan.body as CommunicationPlanBody & { effects: DeliveryEffectView[] };
}

describe("Course Check 04 — external sends and effect recovery", () => {
  beforeAll(async () => {
    const response = await app.request(
      `https://chartstead.test/api/events/${eventId}`,
      undefined,
      env,
    );
    expect(response.status).toBe(200);
  });

  it("commits exact address effects before delivery and replays the send command idempotently", async () => {
    const proposalId = "SUB-PODS0028";
    const store = env.EVENT_STORE.getByName(eventId);
    await store.setProposalCoSpeakersForTest(proposalId, [
      {
        name: "Course Check Delivery Co-speaker",
        email: "cc04-co-speaker@example.test",
        biography: "Delivery test co-speaker.",
      },
    ]);
    const frozen = await prepareFrozenCommunication(proposalId, "cc04-ledger");
    const drafts = communicationBody(frozen).drafts;
    expect(drafts).toHaveLength(2);
    const legacyOutboxBefore = await store.listOutboxMessages();

    const sendBody = {
      planVersion: frozen.version,
      digest: frozen.digest,
      stageId: "send-messages",
      idempotencyKey: "cc04-ledger-send",
    };
    const firstResponse = await post(
      `/course-checks/${frozen.id}/send`,
      sendBody,
    );
    expect(firstResponse.status).toBe(202);
    const first = await firstResponse.json<CourseCheckPlan>();
    const firstBody = communicationBody(first);

    expect(first.state).toBe("In progress");
    expect(first.approval).toMatchObject({ stageId: "send-messages" });
    expect(first.receipt).toMatchObject({ stageId: "send-messages" });
    expect(firstBody.stageVisibility).toMatchObject({
      draft: "complete",
      send: "complete",
      delivery: "in_progress",
    });
    expect(firstBody.effects).toHaveLength(drafts.length);
    expect(firstBody.effects.map((effect) => effect.draftId).sort()).toEqual(
      drafts.map((draft) => draft.draftId).sort(),
    );
    expect(
      firstBody.effects.every(
        (effect) =>
          effect.effectId.length > 10 &&
          effect.payloadIdentity.length === 64 &&
          effect.status === "queued" &&
          effect.providerReference === null &&
          effect.attemptCount === 0 &&
          effect.lastError === null &&
          effect.nextAttemptAt === null,
      ),
    ).toBe(true);
    expect(first.mutations?.some((mutation) => mutation.kind === "send")).toBe(true);
    expect(await store.listOutboxMessages()).toEqual(legacyOutboxBefore);

    const replayResponse = await post(
      `/course-checks/${frozen.id}/send`,
      sendBody,
    );
    expect(replayResponse.status).toBe(200);
    const replay = await replayResponse.json<CourseCheckPlan>();
    expect(communicationBody(replay).effects.map((effect) => effect.effectId)).toEqual(
      firstBody.effects.map((effect) => effect.effectId),
    );
  });

  it("delivers the frozen payload once with a stable provider idempotency key", async () => {
    const deliveries: Array<{
      idempotencyKey: string;
      to: string;
      subject: string;
      text: string;
    }> = [];
    const sender = {
      async send(message: {
        idempotencyKey: string;
        to: string;
        subject: string;
        html: string;
        text: string;
      }) {
        deliveries.push({
          idempotencyKey: message.idempotencyKey,
          to: message.to,
          subject: message.subject,
          text: message.text,
        });
        return {
          outcome: "sent" as const,
          providerReference: `provider-${message.idempotencyKey}`,
        };
      },
    };
    const deliveryApp = createApp({
      resolvePrincipal: async () => adminPrincipal,
      signingSecret: "course-check-04-test-signing-secret",
      communicationEmailSender: sender,
    } as Parameters<typeof createApp>[0] & { communicationEmailSender: typeof sender });
    const frozen = await prepareFrozenCommunication(
      "SUB-PODS0029",
      "cc04-provider-once",
    );
    const sendBody = {
      planVersion: frozen.version,
      digest: frozen.digest,
      stageId: "send-messages",
      idempotencyKey: "cc04-provider-once-send",
    };

    const firstResponse = await post(
      `/course-checks/${frozen.id}/send`,
      sendBody,
      deliveryApp,
    );
    expect(firstResponse.status).toBe(202);
    const first = await firstResponse.json<CourseCheckPlan>();
    const firstBody = communicationBody(first);
    expect(first.state).toBe("Complete");
    expect(firstBody.stageVisibility.delivery).toBe("complete");
    expect(firstBody.deliverySummary).toMatchObject({
      total: 1,
      succeeded: 1,
      failed: 0,
      unknown: 0,
    });
    const currentEffectIds = new Set(firstBody.effects.map((effect) => effect.effectId));
    expect(
      deliveries.filter((delivery) => currentEffectIds.has(delivery.idempotencyKey)),
    ).toEqual([
      {
        idempotencyKey: firstBody.effects[0]!.effectId,
        to: firstBody.effects[0]!.toEmail,
        subject: "Frozen delivery subject",
        text: "Frozen delivery body.",
      },
    ]);
    expect(firstBody.effects[0]).toMatchObject({
      status: "succeeded",
      providerReference: `provider-${firstBody.effects[0]!.effectId}`,
      attemptCount: 1,
      lastError: null,
      nextAttemptAt: null,
    });
    const deliveryCountBeforeReplay = deliveries.length;

    const replayResponse = await post(
      `/course-checks/${frozen.id}/send`,
      sendBody,
      deliveryApp,
    );
    expect(replayResponse.status).toBe(200);
    expect(deliveries).toHaveLength(deliveryCountBeforeReplay);
  });

  it("creates only one effect when a deliverable address appears in multiple groups", async () => {
    const sharedAddress = "cc04-shared-address@example.test";
    const store = env.EVENT_STORE.getByName(eventId);
    for (const [proposalId, suffix] of [
      ["SUB-PODS0039", "a"],
      ["SUB-PODS0040", "b"],
    ] as const) {
      await store.setProposalCoSpeakersForTest(proposalId, [
        {
          name: `Shared speaker ${suffix}`,
          email: sharedAddress,
          biography: "The same deliverable address belongs to both groups.",
        },
      ]);
      const decisionResponse = await post("/course-checks/decisions", {
        proposalId,
        outcome: "declined",
        idempotencyKey: `cc04-shared-${suffix}-decision`,
      });
      const decision = await decisionResponse.json<CourseCheckPlan>();
      await post(`/course-checks/${decision.id}/apply`, {
        planVersion: decision.version,
        digest: decision.digest,
        stageId: "apply-decision",
        idempotencyKey: `cc04-shared-${suffix}-apply`,
      });
    }

    const communicationResponse = await post("/course-checks/communications", {
      proposalIds: ["SUB-PODS0039", "SUB-PODS0040"],
      idempotencyKey: "cc04-shared-communication",
    });
    const communication = await communicationResponse.json<CourseCheckPlan>();
    const draftsResponse = await post(
      `/course-checks/${communication.id}/create-drafts`,
      {
        planVersion: communication.version,
        digest: communication.digest,
        stageId: "create-drafts",
        idempotencyKey: "cc04-shared-drafts",
        softWarningOverrides: communication.body.findings
          .filter((finding) => finding.severity === "warning")
          .map((finding) => ({
            findingId: finding.id,
            reason: "Reviewed shared address.",
          })),
      },
    );
    expect(draftsResponse.status).toBe(201);
    const frozen = await draftsResponse.json<CourseCheckPlan>();
    expect(
      communicationBody(frozen).drafts.filter(
        (draft) => draft.toEmail === sharedAddress,
      ),
    ).toHaveLength(1);

    const sendResponse = await post(`/course-checks/${frozen.id}/send`, {
      planVersion: frozen.version,
      digest: frozen.digest,
      stageId: "send-messages",
      idempotencyKey: "cc04-shared-send",
    });
    const started = await sendResponse.json<CourseCheckPlan>();
    expect(
      communicationBody(started).effects.filter(
        (effect) => effect.toEmail === sharedAddress,
      ),
    ).toHaveLength(1);
  });

  it("derives truthful batch state from success, retry, permanent failure, and unknown outcomes", async () => {
    const sender = {
      async send(message: { to: string }) {
        if (message.to === "cc04-transient@example.test") {
          return { outcome: "transient_failure" as const, error: "Provider busy." };
        }
        if (message.to === "cc04-permanent@example.test") {
          return {
            outcome: "permanent_failure" as const,
            error: "Recipient rejected.",
          };
        }
        if (message.to === "cc04-unknown@example.test") {
          return {
            outcome: "unknown" as const,
            error: "Connection ended after upload.",
          };
        }
        return {
          outcome: "sent" as const,
          providerReference: `provider-${message.to}`,
        };
      },
    };
    const deliveryApp = createApp({
      resolvePrincipal: async () => adminPrincipal,
      signingSecret: "course-check-04-test-signing-secret",
      communicationEmailSender: sender,
    });
    const proposalId = "SUB-PODS0034";
    const store = env.EVENT_STORE.getByName(eventId);
    await store.setProposalCoSpeakersForTest(proposalId, [
      {
        name: "Transient Recipient",
        email: "cc04-transient@example.test",
        biography: "Transient fixture.",
      },
      {
        name: "Permanent Recipient",
        email: "cc04-permanent@example.test",
        biography: "Permanent fixture.",
      },
      {
        name: "Unknown Recipient",
        email: "cc04-unknown@example.test",
        biography: "Unknown fixture.",
      },
    ]);
    const frozen = await prepareFrozenCommunication(proposalId, "cc04-outcomes");

    const response = await post(
      `/course-checks/${frozen.id}/send`,
      {
        planVersion: frozen.version,
        digest: frozen.digest,
        stageId: "send-messages",
        idempotencyKey: "cc04-outcomes-send",
      },
      deliveryApp,
    );
    expect(response.status).toBe(202);
    const plan = await response.json<CourseCheckPlan>();
    const body = communicationBody(plan);
    expect(plan.state).toBe("Needs attention");
    expect(body.stageVisibility.delivery).toBe("needs_attention");
    expect(body.deliverySummary).toEqual({
      total: 4,
      queued: 0,
      sending: 0,
      succeeded: 1,
      retryScheduled: 1,
      failed: 1,
      unknown: 1,
    });
    expect(
      body.effects.find((effect) => effect.toEmail === "cc04-transient@example.test"),
    ).toMatchObject({
      status: "retry_scheduled",
      attemptCount: 1,
      lastError: "Provider busy.",
    });
    expect(
      body.effects.find((effect) => effect.toEmail === "cc04-permanent@example.test"),
    ).toMatchObject({
      status: "permanent_failure",
      attemptCount: 1,
      lastError: "Recipient rejected.",
      nextAttemptAt: null,
    });
    expect(
      body.effects.find((effect) => effect.toEmail === "cc04-unknown@example.test"),
    ).toMatchObject({
      status: "unknown",
      attemptCount: 1,
      lastError: "Connection ended after upload.",
      nextAttemptAt: null,
    });
  });

  it("blocks blind retry of unknown delivery until staff reconciles it as not delivered", async () => {
    const unknownSender = {
      async send() {
        return {
          outcome: "unknown" as const,
          error: "Connection ended after request upload.",
        };
      },
    };
    const unknownApp = createApp({
      resolvePrincipal: async () => adminPrincipal,
      signingSecret: "course-check-04-test-signing-secret",
      communicationEmailSender: unknownSender,
    });
    const frozen = await prepareFrozenCommunication(
      "SUB-PODS0035",
      "cc04-reconcile",
    );
    const sendResponse = await post(
      `/course-checks/${frozen.id}/send`,
      {
        planVersion: frozen.version,
        digest: frozen.digest,
        stageId: "send-messages",
        idempotencyKey: "cc04-reconcile-send",
      },
      unknownApp,
    );
    const unknownPlan = await sendResponse.json<CourseCheckPlan>();
    const unknownEffect = communicationBody(unknownPlan).effects[0]!;
    expect(unknownEffect.status).toBe("unknown");

    const blockedRetry = await post(
      `/course-checks/${unknownPlan.id}/effects/${unknownEffect.effectId}/retry`,
      { idempotencyKey: "cc04-reconcile-blind-retry" },
    );
    expect(blockedRetry.status).toBe(409);
    await expect(blockedRetry.json()).resolves.toMatchObject({
      code: "reconciliation_required",
    });

    const reconciledResponse = await post(
      `/course-checks/${unknownPlan.id}/effects/${unknownEffect.effectId}/reconcile`,
      {
        outcome: "not_delivered",
        note: "Provider dashboard has no matching delivery.",
        idempotencyKey: "cc04-reconcile-not-delivered",
      },
    );
    expect(reconciledResponse.status).toBe(200);
    const reconciled = await reconciledResponse.json<CourseCheckPlan>();
    expect(communicationBody(reconciled).effects[0]).toMatchObject({
      effectId: unknownEffect.effectId,
      status: "permanent_failure",
      attemptCount: 1,
      lastError: "Reconciled as not delivered: Provider dashboard has no matching delivery.",
    });
    expect(reconciled.mutations?.some((mutation) => mutation.kind === "reconcile")).toBe(
      true,
    );

    const successfulAttempts: string[] = [];
    const recoveryApp = createApp({
      resolvePrincipal: async () => adminPrincipal,
      signingSecret: "course-check-04-test-signing-secret",
      communicationEmailSender: {
        async send(message: { idempotencyKey: string }) {
          successfulAttempts.push(message.idempotencyKey);
          return {
            outcome: "sent" as const,
            providerReference: "provider-reconciled-success",
          };
        },
      },
    });
    const retryResponse = await post(
      `/course-checks/${unknownPlan.id}/effects/${unknownEffect.effectId}/retry`,
      { idempotencyKey: "cc04-reconcile-manual-retry" },
      recoveryApp,
    );
    expect(retryResponse.status).toBe(200);
    const recovered = await retryResponse.json<CourseCheckPlan>();
    expect(recovered.state).toBe("Complete");
    expect(communicationBody(recovered).effects[0]).toMatchObject({
      effectId: unknownEffect.effectId,
      status: "succeeded",
      attemptCount: 2,
      providerReference: "provider-reconciled-success",
    });
    expect(successfulAttempts).toEqual([unknownEffect.effectId]);
    expect(recovered.mutations?.some((mutation) => mutation.kind === "retry")).toBe(true);
  });

  it("exhausts transient retry after six total attempts and never replays a success", async () => {
    const frozen = await prepareFrozenCommunication(
      "SUB-PODS0036",
      "cc04-exhaustion",
    );
    const startResponse = await post(`/course-checks/${frozen.id}/send`, {
      planVersion: frozen.version,
      digest: frozen.digest,
      stageId: "send-messages",
      idempotencyKey: "cc04-exhaustion-send",
    });
    const started = await startResponse.json<CourseCheckPlan>();
    const effectId = communicationBody(started).effects[0]!.effectId;
    const attempts: string[] = [];
    const sender = {
      async send(message: { idempotencyKey: string }) {
        attempts.push(message.idempotencyKey);
        return { outcome: "transient_failure" as const, error: "Provider busy." };
      },
    };
    const store = env.EVENT_STORE.getByName(eventId);

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await flushCommunicationEffects({
        store,
        sender,
        now: new Date(`2030-01-0${attempt + 1}T00:00:00.000Z`),
        limit: 50,
      });
    }
    const exhausted = (await store.getCourseCheckPlan(frozen.id)) as CourseCheckPlan | null;
    expect(exhausted).toBeTruthy();
    expect(communicationBody(exhausted!).effects[0]).toMatchObject({
      effectId,
      status: "exhausted",
      attemptCount: 6,
      lastError: "Provider busy.",
      nextAttemptAt: null,
    });
    expect(exhausted!.state).toBe("Partially complete");
    expect(attempts.filter((id) => id === effectId)).toEqual([
      effectId,
      effectId,
      effectId,
      effectId,
      effectId,
      effectId,
    ]);

    const attemptCountBeforeReplay = attempts.length;
    await flushCommunicationEffects({
      store,
      sender,
      now: new Date("2030-02-01T00:00:00.000Z"),
      limit: 50,
    });
    expect(attempts).toHaveLength(attemptCountBeforeReplay);
  });

  it("turns an abandoned sending lease into unknown after Durable Object eviction", async () => {
    const frozen = await prepareFrozenCommunication(
      "SUB-PODS0037",
      "cc04-crash-window",
    );
    const startResponse = await post(`/course-checks/${frozen.id}/send`, {
      planVersion: frozen.version,
      digest: frozen.digest,
      stageId: "send-messages",
      idempotencyKey: "cc04-crash-window-send",
    });
    const started = await startResponse.json<CourseCheckPlan>();
    const effectId = communicationBody(started).effects[0]!.effectId;
    const store = env.EVENT_STORE.getByName(eventId);

    const claimed = await store.claimCommunicationEffect(
      effectId,
      "2030-03-01T00:00:00.000Z",
    );
    expect(claimed).toMatchObject({ status: "sending", attemptCount: 1 });
    await evictDurableObject(store);

    const dueAfterEviction = await store.listDueCommunicationEffectIds(
      "2030-03-01T00:03:00.000Z",
      50,
    );
    expect(dueAfterEviction).toContain(effectId);
    expect(
      await store.claimCommunicationEffect(effectId, "2030-03-01T00:03:00.000Z"),
    ).toBeNull();
    const reloaded = (await store.getCourseCheckPlan(frozen.id)) as CourseCheckPlan | null;
    expect(reloaded?.state).toBe("Needs attention");
    expect(communicationBody(reloaded!).effects[0]).toMatchObject({
      effectId,
      status: "unknown",
      attemptCount: 1,
      nextAttemptAt: null,
    });
  });

  it("creates a linked reviewed correction without changing the original sent effect", async () => {
    const sentApp = createApp({
      resolvePrincipal: async () => adminPrincipal,
      signingSecret: "course-check-04-test-signing-secret",
      communicationEmailSender: {
        async send(message: { idempotencyKey: string }) {
          return {
            outcome: "sent" as const,
            providerReference: `provider-${message.idempotencyKey}`,
          };
        },
      },
    });
    const frozen = await prepareFrozenCommunication(
      "SUB-PODS0038",
      "cc04-correction",
    );
    const sendResponse = await post(
      `/course-checks/${frozen.id}/send`,
      {
        planVersion: frozen.version,
        digest: frozen.digest,
        stageId: "send-messages",
        idempotencyKey: "cc04-correction-send",
      },
      sentApp,
    );
    const sentPlan = await sendResponse.json<CourseCheckPlan>();
    const sentEffect = communicationBody(sentPlan).effects[0]!;
    expect(sentEffect.status).toBe("succeeded");

    const correctionResponse = await post(
      `/course-checks/${sentPlan.id}/effects/${sentEffect.effectId}/correction`,
      {
        reason: "The original room instruction was wrong.",
        subject: "Correction: room instruction",
        bodyText: "Please use the west entrance instead.",
        idempotencyKey: "cc04-correction-create",
      },
    );
    expect(correctionResponse.status).toBe(201);
    const correction = await correctionResponse.json<CourseCheckPlan>();
    const correctionBody = communicationBody(correction) as CommunicationPlanBody & {
      compensation: {
        originalPlanId: string;
        originalEffectId: string;
        reason: string;
      } | null;
    };
    expect(correction.id).not.toBe(sentPlan.id);
    expect(correction.state).toBe("Ready");
    expect(correction.approval).toBeNull();
    expect(correction.receipt).toBeNull();
    expect(correctionBody.source.kind).toBe("compensation");
    expect(correctionBody.parentPlanId).toBe(sentPlan.id);
    expect(correctionBody.linkedPlanIds).toContain(sentPlan.id);
    expect(correctionBody.compensation).toEqual({
      originalPlanId: sentPlan.id,
      originalEffectId: sentEffect.effectId,
      reason: "The original room instruction was wrong.",
    });
    expect(correctionBody.subject).toBe("Correction: room instruction");
    expect(correctionBody.bodyText).toBe("Please use the west entrance instead.");
    expect(correctionBody.recipientGroups[0]?.recipients).toHaveLength(1);
    expect(correctionBody.recipientGroups[0]?.recipients[0]?.address).toBe(
      sentEffect.toEmail,
    );
    expect(correctionBody.drafts).toEqual([]);
    expect(correctionBody.effects).toEqual([]);
    expect(correctionBody.stageVisibility).toMatchObject({
      draft: "ready",
      send: "not_started",
      delivery: "not_started",
    });

    const originalResponse = await app.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/${sentPlan.id}`,
      undefined,
      env,
    );
    const original = await originalResponse.json<CourseCheckPlan>();
    expect(communicationBody(original).linkedPlanIds).toContain(correction.id);
    expect(
      communicationBody(original).effects.find(
        (effect) => effect.effectId === sentEffect.effectId,
      ),
    ).toMatchObject({ status: "succeeded" });

    const replay = await post(
      `/course-checks/${sentPlan.id}/effects/${sentEffect.effectId}/correction`,
      {
        reason: "The original room instruction was wrong.",
        subject: "Correction: room instruction",
        bodyText: "Please use the west entrance instead.",
        idempotencyKey: "cc04-correction-create",
      },
    );
    expect(replay.status).toBe(200);
    expect((await replay.json<CourseCheckPlan>()).id).toBe(correction.id);
  });
});
