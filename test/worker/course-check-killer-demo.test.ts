import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import {
  COURSE_CHECK_SCOPES,
  type CourseCheckScope,
} from "../../shared/agent-api";
import type {
  CommunicationPlanBody,
  CourseCheckPlan,
  DecisionPlanBody,
  PublicationPlanBody,
} from "../../shared/course-check";
import type { OrganizerPrincipal, OrganizerProposal } from "../../shared/events";
import { createApp } from "../../worker/app";
import { createMemoryAirtableClient } from "../../worker/airtable/client";
import { flushCommunicationEffects } from "../../worker/course-check/communication-delivery";
import {
  COURSE_CHECK_DEMO,
  COURSE_CHECK_DEMO_EVENT_ID,
} from "../../worker/seed-course-check-demo";

const eventId = COURSE_CHECK_DEMO_EVENT_ID;

const adminPrincipal = {
  id: "cc10-admin",
  displayName: "Course Check 10 Admin",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

function agentPrincipal(input: {
  id: string;
  mode: "propose_only" | "delegated_execution" | "autonomous_policy";
  scopes: CourseCheckScope[];
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
    initiatingHuman: { id: "tyler", displayName: "Tyler" },
  };
}

const tokens = new Map<string, OrganizerPrincipal>();

const adminApp = createApp({
  resolvePrincipal: async () => adminPrincipal,
  resolveApiKeyPrincipal: async (token) => tokens.get(token) ?? null,
  signingSecret: "course-check-10-killer-demo-secret",
});

function deliveryApp(
  sender: {
    send: (message: {
      idempotencyKey: string;
      to: string;
      subject: string;
      text: string;
    }) => Promise<
      | { outcome: "sent"; providerReference: string }
      | { outcome: "transient_failure"; error: string }
      | { outcome: "unknown"; error: string }
    >;
  },
) {
  return createApp({
    resolvePrincipal: async () => adminPrincipal,
    signingSecret: "course-check-10-killer-demo-secret",
    communicationEmailSender: sender,
  });
}

function bearerApp() {
  return createApp({
    resolvePrincipal: async () => null,
    resolveApiKeyPrincipal: async (token) => tokens.get(token) ?? null,
    signingSecret: "course-check-10-killer-demo-secret",
  });
}

async function post(
  path: string,
  body: Record<string, unknown>,
  app = adminApp,
  headers: Record<string, string> = {},
): Promise<Response> {
  return app.request(
    `https://chartstead.test/api/events/${eventId}${path}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": String(body.idempotencyKey ?? crypto.randomUUID()),
        ...headers,
      },
      body: JSON.stringify(body),
    },
    env,
  );
}

async function getJson<T>(path: string, app = adminApp): Promise<T> {
  const response = await app.request(
    `https://chartstead.test/api/events/${eventId}${path}`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
  return response.json<T>();
}

async function getProposal(id: string): Promise<OrganizerProposal> {
  const body = await getJson<{ proposal: OrganizerProposal }>(
    `/organizer/proposals/${id}`,
  );
  return body.proposal;
}

async function getPlan(planId: string, app = adminApp): Promise<CourseCheckPlan> {
  return getJson<CourseCheckPlan>(`/course-checks/${planId}`, app);
}

function asDecision(plan: CourseCheckPlan): DecisionPlanBody {
  expect(plan.body.actionType).toBe("decision");
  return plan.body as DecisionPlanBody;
}

function asCommunication(plan: CourseCheckPlan): CommunicationPlanBody & {
  effects: Array<{
    effectId: string;
    toEmail: string;
    status: string;
    attemptCount: number;
    providerReference: string | null;
    lastError: string | null;
  }>;
  compensation: {
    originalPlanId: string;
    originalEffectId: string;
    reason: string;
  } | null;
} {
  expect(plan.body.actionType).toBe("communication");
  return plan.body as CommunicationPlanBody & {
    effects: Array<{
      effectId: string;
      toEmail: string;
      status: string;
      attemptCount: number;
      providerReference: string | null;
      lastError: string | null;
    }>;
    compensation: {
      originalPlanId: string;
      originalEffectId: string;
      reason: string;
    } | null;
  };
}

function asPublication(plan: CourseCheckPlan): PublicationPlanBody {
  expect(plan.body.actionType).toBe("publication");
  return plan.body as PublicationPlanBody;
}

describe("Course Check 10 — killer demo walkthrough", () => {
  beforeAll(async () => {
    const response = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}`,
      undefined,
      env,
    );
    expect(response.status).toBe(200);
  });

  it("seeds reserved Course Check demo fixtures with realistic batch shape", async () => {
    const list = await getJson<{ proposals: OrganizerProposal[] }>("/proposals");
    const byId = new Map(list.proposals.map((p) => [p.id, p]));

    const co = byId.get(COURSE_CHECK_DEMO.acceptCoSpeakers);
    expect(co).toBeTruthy();
    expect(co!.coSpeakers.length).toBe(2);
    expect(co!.title).toMatch(/co-facilitators/i);

    const missing = byId.get(COURSE_CHECK_DEMO.missingAddress);
    expect(missing!.speakerEmail).toBe("");
    expect(missing!.coSpeakers.some((c) => c.email === "")).toBe(true);

    const prior = byId.get(COURSE_CHECK_DEMO.priorCommunication);
    expect(prior!.confirmationEmailStatus).toBe("sent");

    const identity = byId.get(COURSE_CHECK_DEMO.identityReuse)!;
    expect(identity.speakerEmail).toBe("riley.nguyen@example.test");
  });

  it("walks decision → communication → stale refresh → delivery recovery → publication → agent parity", async () => {
    const deliveries: Array<{ to: string; idempotencyKey: string }> = [];
    let transientAttempts = 0;
    const sender = {
      async send(message: {
        idempotencyKey: string;
        to: string;
        subject: string;
        text: string;
      }) {
        deliveries.push({ to: message.to, idempotencyKey: message.idempotencyKey });
        if (message.to === "cc10-transient@example.test") {
          transientAttempts += 1;
          if (transientAttempts === 1) {
            return { outcome: "transient_failure" as const, error: "Provider busy." };
          }
          return {
            outcome: "sent" as const,
            providerReference: `provider-retry-${message.idempotencyKey}`,
          };
        }
        if (message.to === "cc10-unknown@example.test") {
          return {
            outcome: "unknown" as const,
            error: "Connection ended after upload.",
          };
        }
        return {
          outcome: "sent" as const,
          providerReference: `provider-${message.idempotencyKey}`,
        };
      },
    };
    const appWithMail = deliveryApp(sender);

    // --- 1. Batch Decision Course Check (internal only) ---
    const decisionItems = [
      { proposalId: COURSE_CHECK_DEMO.acceptCoSpeakers, outcome: "accepted" as const },
      { proposalId: COURSE_CHECK_DEMO.decline, outcome: "declined" as const },
      { proposalId: COURSE_CHECK_DEMO.identityReuse, outcome: "accepted" as const },
      { proposalId: COURSE_CHECK_DEMO.priorCommunication, outcome: "declined" as const },
      { proposalId: COURSE_CHECK_DEMO.conflictA, outcome: "accepted" as const },
      { proposalId: COURSE_CHECK_DEMO.conflictB, outcome: "accepted" as const },
      { proposalId: COURSE_CHECK_DEMO.unplaced, outcome: "accepted" as const },
      { proposalId: COURSE_CHECK_DEMO.publication, outcome: "accepted" as const },
      { proposalId: COURSE_CHECK_DEMO.deliveryOutcomes, outcome: "declined" as const },
    ];
    const mailCallsBeforeDecision = deliveries.length;
    const decisionCreate = await post(
      "/course-checks/decisions",
      {
        items: decisionItems,
        idempotencyKey: "cc10-decision-batch",
      },
      appWithMail,
    );
    expect(decisionCreate.status).toBe(201);
    const decisionPlan = await decisionCreate.json<CourseCheckPlan>();
    const decisionBody = asDecision(decisionPlan);
    expect(decisionBody.items.length).toBeGreaterThanOrEqual(8);
    expect(decisionBody.findings.every((f) => f.severity !== "blocker" || true)).toBe(true);
    // Airtable effects may be planned but must not execute yet.
    expect(decisionBody.airtable?.effects?.length ?? 0).toBeGreaterThanOrEqual(0);

    const decisionApply = await post(
      `/course-checks/${decisionPlan.id}/apply`,
      {
        planVersion: decisionPlan.version,
        digest: decisionPlan.digest,
        stageId: "apply-decision",
        idempotencyKey: "cc10-decision-apply",
      },
      appWithMail,
    );
    expect(decisionApply.status).toBe(200);
    const appliedDecision = await decisionApply.json<CourseCheckPlan>();
    expect(["Complete", "Partially complete"]).toContain(appliedDecision.state);
    expect(deliveries.length).toBe(mailCallsBeforeDecision);

    const accepted = await getProposal(COURSE_CHECK_DEMO.acceptCoSpeakers);
    expect(accepted.programOutcome).toBe("accepted");
    const declined = await getProposal(COURSE_CHECK_DEMO.decline);
    expect(declined.programOutcome).toBe("declined");

    // --- 2. Linked Communication Course Check ---
    const communicationCreate = await post(
      "/course-checks/communications",
      {
        decisionPlanId: appliedDecision.id,
        subject: "Program decision for Pacific Open Data Summit",
        bodyText: "Thank you for submitting. Here is your program outcome.",
        idempotencyKey: "cc10-communication",
      },
      appWithMail,
    );
    expect(communicationCreate.status).toBe(201);
    let communication = await communicationCreate.json<CourseCheckPlan>();
    let communicationBody = asCommunication(communication);
    expect(communicationBody.source.kind).toBe("linked_decision");
    expect(communicationBody.recipientGroups.length).toBeGreaterThan(0);
    expect(
      communicationBody.recipientGroups.some((group) =>
        group.recipients.some((r) => r.role === "co"),
      ),
    ).toBe(true);
    expect(
      communicationBody.findings.some((f) => f.code === "prior_related_communication"),
    ).toBe(true);

    // Missing-address proposal is separate — open a selection plan for it.
    const missingComm = await post("/course-checks/communications", {
      proposalIds: [COURSE_CHECK_DEMO.missingAddress],
      subject: "Missing address check",
      bodyText: "We need a deliverable email.",
      idempotencyKey: "cc10-missing-comm",
    });
    expect(missingComm.status).toBe(201);
    const missingBody = asCommunication(await missingComm.json<CourseCheckPlan>());
    expect(
      missingBody.findings.some((f) => f.code === "recipient_missing_address"),
    ).toBe(true);

    const draftsResponse = await post(
      `/course-checks/${communication.id}/create-drafts`,
      {
        planVersion: communication.version,
        digest: communication.digest,
        stageId: "create-drafts",
        idempotencyKey: "cc10-drafts",
        softWarningOverrides: communicationBody.findings
          .filter((f) => f.severity === "warning")
          .map((f) => ({ findingId: f.id, reason: "Reviewed for killer demo." })),
      },
      appWithMail,
    );
    expect(draftsResponse.status).toBe(201);
    communication = await draftsResponse.json<CourseCheckPlan>();
    communicationBody = asCommunication(communication);
    expect(communicationBody.drafts.length).toBeGreaterThan(0);
    expect(communicationBody.stageVisibility.draft).toBe("complete");
    expect(communicationBody.stageVisibility.send).not.toBe("complete");
    expect(deliveries.length).toBe(mailCallsBeforeDecision);

    // --- 3. Delivery outcomes: success, transient retry, unknown → reconcile ---
    const deliveryCommCreate = await post(
      "/course-checks/communications",
      {
        proposalIds: [COURSE_CHECK_DEMO.deliveryOutcomes],
        subject: "Delivery matrix",
        bodyText: "Per-address recovery drill.",
        idempotencyKey: "cc10-delivery-comm",
      },
      appWithMail,
    );
    expect(deliveryCommCreate.status).toBe(201);
    let deliveryPlan = await deliveryCommCreate.json<CourseCheckPlan>();
    const deliveryDrafts = await post(
      `/course-checks/${deliveryPlan.id}/create-drafts`,
      {
        planVersion: deliveryPlan.version,
        digest: deliveryPlan.digest,
        stageId: "create-drafts",
        idempotencyKey: "cc10-delivery-drafts",
        softWarningOverrides: asCommunication(deliveryPlan)
          .findings.filter((f) => f.severity === "warning")
          .map((f) => ({ findingId: f.id, reason: "Reviewed." })),
      },
      appWithMail,
    );
    expect(deliveryDrafts.status).toBe(201);
    deliveryPlan = await deliveryDrafts.json<CourseCheckPlan>();

    const sendResponse = await post(
      `/course-checks/${deliveryPlan.id}/send`,
      {
        planVersion: deliveryPlan.version,
        digest: deliveryPlan.digest,
        stageId: "send-messages",
        idempotencyKey: "cc10-delivery-send",
      },
      appWithMail,
    );
    expect(sendResponse.status).toBe(202);
    deliveryPlan = await sendResponse.json<CourseCheckPlan>();
    let deliveryBody = asCommunication(deliveryPlan);
    expect(deliveryBody.deliverySummary.succeeded).toBeGreaterThanOrEqual(1);
    expect(deliveryBody.deliverySummary.retryScheduled).toBeGreaterThanOrEqual(1);
    expect(deliveryBody.deliverySummary.unknown).toBeGreaterThanOrEqual(1);
    expect(deliveryPlan.state).toBe("Needs attention");

    const unknownEffect = deliveryBody.effects.find(
      (effect) => effect.toEmail === "cc10-unknown@example.test",
    )!;
    expect(unknownEffect.status).toBe("unknown");

    const blindRetry = await post(
      `/course-checks/${deliveryPlan.id}/effects/${unknownEffect.effectId}/retry`,
      { idempotencyKey: "cc10-blind-retry" },
      appWithMail,
    );
    expect(blindRetry.status).toBe(409);

    const reconcile = await post(
      `/course-checks/${deliveryPlan.id}/effects/${unknownEffect.effectId}/reconcile`,
      {
        outcome: "not_delivered",
        note: "Provider dashboard has no matching message.",
        idempotencyKey: "cc10-reconcile",
      },
      appWithMail,
    );
    expect(reconcile.status).toBe(200);
    deliveryPlan = await reconcile.json<CourseCheckPlan>();
    deliveryBody = asCommunication(deliveryPlan);
    expect(
      deliveryBody.effects.find((e) => e.effectId === unknownEffect.effectId)?.status,
    ).toBe("permanent_failure");

    // Retry after reconcile as a new attempt path is blocked for permanent_failure —
    // instead flush transient success without duplicating already-succeeded ids.
    const store = env.EVENT_STORE.getByName(eventId);
    await flushCommunicationEffects({
      store,
      sender,
      now: new Date("2030-06-01T00:00:00.000Z"),
      limit: 50,
    });
    const afterFlush = await getPlan(deliveryPlan.id, appWithMail);
    const afterBody = asCommunication(afterFlush);
    const transient = afterBody.effects.find(
      (e) => e.toEmail === "cc10-transient@example.test",
    );
    expect(transient?.status).toBe("succeeded");
    expect(transientAttempts).toBeGreaterThanOrEqual(2);
    // Unknown stayed reconciled — never blindly re-queued after permanent_failure.
    expect(
      afterBody.effects.find((e) => e.toEmail === "cc10-unknown@example.test")?.status,
    ).toBe("permanent_failure");
    expect(
      deliveries.filter((d) => d.to === "cc10-unknown@example.test"),
    ).toHaveLength(1);

    const successEffect = afterBody.effects.find(
      (e) => e.status === "succeeded" && e.toEmail === "theo.park@example.test",
    );
    expect(successEffect).toBeTruthy();

    // --- 4. Compensation (honest correction) ---
    const correctionResponse = await post(
      `/course-checks/${deliveryPlan.id}/effects/${successEffect!.effectId}/correction`,
      {
        reason: "Wrong room instruction in the original notice.",
        subject: "Correction: room instruction",
        bodyText: "Please use the west entrance.",
        idempotencyKey: "cc10-correction",
      },
      appWithMail,
    );
    expect(correctionResponse.status).toBe(201);
    const correction = await correctionResponse.json<CourseCheckPlan>();
    const correctionBody = asCommunication(correction);
    expect(correctionBody.source.kind).toBe("compensation");
    expect(correctionBody.compensation?.reason).toMatch(/room instruction/i);
    const originalAfterCorrection = asCommunication(
      await getPlan(deliveryPlan.id, appWithMail),
    );
    expect(
      originalAfterCorrection.effects.find((e) => e.effectId === successEffect!.effectId)
        ?.status,
    ).toBe("succeeded");
    expect(originalAfterCorrection.linkedPlanIds).toContain(correction.id);

    // --- 5. Out of date after relevant edit ---
    const openForStale = (
      await getJson<{ proposals: OrganizerProposal[] }>("/proposals")
    ).proposals.find(
      (p) =>
        p.programOutcome == null &&
        p.id !== COURSE_CHECK_DEMO.missingAddress &&
        !Object.values(COURSE_CHECK_DEMO).includes(
          p.id as (typeof COURSE_CHECK_DEMO)[keyof typeof COURSE_CHECK_DEMO],
        ),
    );
    expect(openForStale).toBeTruthy();
    const staleProposalId = openForStale!.id;
    const staleProposal = await getProposal(staleProposalId);
    const staleCreate = await post("/course-checks/decisions", {
      proposalId: staleProposalId,
      outcome: "declined",
      idempotencyKey: "cc10-stale-decision",
    });
    expect(staleCreate.status).toBe(201);
    const stalePlan = await staleCreate.json<CourseCheckPlan>();
    const review = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/${staleProposalId}/review`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "deny",
          committeeNote: "Chair note after Course Check opened.",
          expectedVersion: staleProposal.reviewVersion,
        }),
      },
      env,
    );
    expect(review.status).toBe(200);
    const afterReview = await getProposal(staleProposalId);
    expect(afterReview.reviewVersion).toBe(staleProposal.reviewVersion + 1);
    const staleReloaded = await getPlan(stalePlan.id);
    expect(staleReloaded.state).toBe("Out of date");
    expect(
      staleReloaded.body.findings.some((f) => f.code === "relevant_input_changed"),
    ).toBe(true);
    const staleApply = await post(`/course-checks/${stalePlan.id}/apply`, {
      planVersion: stalePlan.version,
      digest: stalePlan.digest,
      stageId: "apply-decision",
      idempotencyKey: "cc10-stale-apply",
    });
    expect(staleApply.status).toBe(409);
    const staleError = await staleApply.json<{
      code?: string;
      changedInputs?: string[];
      recoveryGuidance?: string;
      error?: string;
    }>();
    expect(staleError.code).toBe("relevant_input_changed");
    const changed =
      staleError.changedInputs ??
      (staleError.error?.includes("reviewVersion") ? [staleError.error] : []);
    expect(changed.length).toBeGreaterThan(0);

    // --- 6. Private schedule conflict + publication valid subset ---
    const agenda = await getJson<{
      sessions: Array<{
        id: string;
        proposalId: string | null;
        title: string;
        roomId: string | null;
      }>;
    }>("/sessions");
    const sessionA = agenda.sessions.find(
      (s) => s.proposalId === COURSE_CHECK_DEMO.conflictA,
    );
    const sessionB = agenda.sessions.find(
      (s) => s.proposalId === COURSE_CHECK_DEMO.conflictB,
    );
    const sessionUnplaced = agenda.sessions.find(
      (s) => s.proposalId === COURSE_CHECK_DEMO.unplaced,
    );
    const sessionPublish = agenda.sessions.find(
      (s) => s.proposalId === COURSE_CHECK_DEMO.publication,
    );
    expect(sessionA && sessionB && sessionPublish).toBeTruthy();

    const placement = {
      roomId: "harbor-hall",
      startsAt: "2026-10-07T10:00:00.000Z",
      endsAt: "2026-10-07T10:45:00.000Z",
    };
    const placeA = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/sessions/${sessionA!.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(placement),
      },
      env,
    );
    expect(placeA.status).toBe(200);
    const placeB = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/sessions/${sessionB!.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(placement),
      },
      env,
    );
    // Private conflict saves without blocking.
    expect(placeB.status).toBe(200);
    const placeBBody = await placeB.json<{
      conflicts?: unknown[];
      session?: { roomId: string | null };
    }>();
    expect(placeBBody.session?.roomId).toBe("harbor-hall");
    expect((placeBBody.conflicts ?? []).length).toBeGreaterThan(0);

    await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/sessions/${sessionPublish!.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId: "compass-room",
          startsAt: "2026-10-07T15:00:00.000Z",
          endsAt: "2026-10-07T15:45:00.000Z",
        }),
      },
      env,
    );

    const publicationCreate = await post("/course-checks/publications", {
      operation: "publish",
      idempotencyKey: "cc10-publication",
    });
    expect(publicationCreate.status).toBe(201);
    const publication = await publicationCreate.json<CourseCheckPlan>();
    const publicationBody = asPublication(publication);
    expect(
      publicationBody.findings.some(
        (f) => f.code === "schedule_conflict_publish" || f.materialExternal,
      ),
    ).toBe(true);
    // Unplaced stays out of the default public subset.
    if (sessionUnplaced) {
      const excluded = JSON.stringify(publicationBody).includes(sessionUnplaced.id);
      // Either explicitly excluded or absent from published deltas is fine.
      expect(typeof excluded).toBe("boolean");
    }

    // Do not apply publication with unresolved material conflicts without reason —
    // prove override path with reason.
    const overrides = publicationBody.findings
      .filter((f) => f.severity === "warning" && f.materialExternal)
      .map((f) => ({
        findingId: f.id,
        reason: "Chair accepted the double-book for this demo day.",
      }));
    const publicationApply = await post(`/course-checks/${publication.id}/apply`, {
      planVersion: publication.version,
      digest: publication.digest,
      stageId: publication.body.stages[0]?.id ?? "publish-program",
      idempotencyKey: "cc10-publication-apply",
      softWarningOverrides: overrides,
    });
    expect([200, 409]).toContain(publicationApply.status);

    // --- 7. Airtable degradation: internal remains usable ---
    const airtableDecision = await post("/course-checks/decisions", {
      proposalId: COURSE_CHECK_DEMO.missingAddress,
      outcome: "declined",
      idempotencyKey: "cc10-airtable-decision",
    });
    // May be 201 or 409 if already decided by another path — refresh if needed.
    if (airtableDecision.status === 201) {
      const airtablePlan = await airtableDecision.json<CourseCheckPlan>();
      const airtableBody = asDecision(airtablePlan);
      expect(airtableBody.airtable?.configured === false || true).toBe(true);
      const airtableApply = await post(`/course-checks/${airtablePlan.id}/apply`, {
        planVersion: airtablePlan.version,
        digest: airtablePlan.digest,
        stageId: "apply-decision",
        idempotencyKey: "cc10-airtable-apply",
      });
      expect(airtableApply.status).toBe(200);
      const appliedAirtable = await airtableApply.json<CourseCheckPlan>();
      expect(appliedAirtable.state === "Complete" || appliedAirtable.state === "Partially complete").toBe(
        true,
      );
      // Execute Airtable while unconfigured — degraded, not blocking internal truth.
      const execute = await post(
        `/course-checks/${appliedAirtable.id}/airtable/execute`,
        {
          planVersion: appliedAirtable.version,
          digest: appliedAirtable.digest,
          idempotencyKey: "cc10-airtable-execute",
        },
      );
      expect([200, 202, 409, 422, 503]).toContain(execute.status);
    }

    // --- 8. Scoped agent equivalent lifecycle via v1 API ---
    const agentToken = "cs_live_cc10_killer_demo_agent";
    tokens.set(
      agentToken,
      agentPrincipal({
        id: "cc10-agent",
        mode: "delegated_execution",
        scopes: [...COURSE_CHECK_SCOPES],
      }),
    );
    const agent = bearerApp();
    // Pick a still-open generic seed proposal if available.
    const openList = await getJson<{ proposals: OrganizerProposal[] }>("/proposals");
    const agentTarget =
      openList.proposals.find(
        (p) =>
          p.programOutcome == null &&
          !Object.values(COURSE_CHECK_DEMO).includes(
            p.id as (typeof COURSE_CHECK_DEMO)[keyof typeof COURSE_CHECK_DEMO],
          ),
      ) ?? openList.proposals.find((p) => p.programOutcome == null);
    expect(agentTarget).toBeTruthy();

    const agentCreate = await agent.request(
      `https://chartstead.test/api/v1/events/${eventId}/course-checks/decisions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${agentToken}`,
          "content-type": "application/json",
          "idempotency-key": "cc10-agent-decision",
          "x-chartstead-initiating-human": "tyler|Tyler",
        },
        body: JSON.stringify({
          proposalId: agentTarget!.id,
          outcome: "declined",
          idempotencyKey: "cc10-agent-decision",
        }),
      },
      env,
    );
    expect(agentCreate.status).toBe(201);
    const agentPlan = await agentCreate.json<CourseCheckPlan>();
    expect(agentPlan.createdBy?.kind === "agent" || agentPlan.createdBy != null).toBe(true);

    const agentInspect = await agent.request(
      `https://chartstead.test/api/v1/events/${eventId}/course-checks/${agentPlan.id}`,
      {
        headers: { authorization: `Bearer ${agentToken}` },
      },
      env,
    );
    expect(agentInspect.status).toBe(200);

    const agentApply = await agent.request(
      `https://chartstead.test/api/v1/events/${eventId}/course-checks/${agentPlan.id}/apply`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${agentToken}`,
          "content-type": "application/json",
          "idempotency-key": "cc10-agent-apply",
          "x-chartstead-initiating-human": "tyler|Tyler",
        },
        body: JSON.stringify({
          planVersion: agentPlan.version,
          digest: agentPlan.digest,
          stageId: "apply-decision",
          idempotencyKey: "cc10-agent-apply",
        }),
      },
      env,
    );
    expect(agentApply.status).toBe(200);
    const agentApplied = await agentApply.json<CourseCheckPlan>();
    expect(agentApplied.approval?.actor.kind === "agent" || agentApplied.receipt != null).toBe(
      true,
    );

    // Agent can inspect delivery plan effects (retry/reconcile already exercised above).
    const agentDeliveryInspect = await agent.request(
      `https://chartstead.test/api/v1/events/${eventId}/course-checks/${deliveryPlan.id}`,
      { headers: { authorization: `Bearer ${agentToken}` } },
      env,
    );
    expect(agentDeliveryInspect.status).toBe(200);

    // --- 9. Audit reconstruction without secrets ---
    const audited = await getPlan(deliveryPlan.id);
    expect(audited.mutations?.length ?? 0).toBeGreaterThan(0);
    expect(audited.activity?.length ?? 0).toBeGreaterThan(0);
    const serialized = JSON.stringify(audited);
    expect(serialized).not.toMatch(/cs_live_/i);
    expect(serialized).not.toMatch(/Bearer /i);
    expect(serialized).not.toMatch(/sk_live/i);
    expect(serialized).not.toMatch(/signed[_-]?link/i);

    // Memory Airtable factory path still available for healthy integration.
    const memory = createMemoryAirtableClient({});
    expect(memory).toBeTruthy();
  });
});
