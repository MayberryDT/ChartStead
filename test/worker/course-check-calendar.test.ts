import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type {
  CommunicationPlanBody,
  CourseCheckPlan,
} from "../../shared/course-check";
import type {
  AgendaWorkspaceResponse,
  OrganizerPrincipal,
  SessionPlacementResponse,
} from "../../shared/events";
import { createApp } from "../../worker/app";
import type { CommunicationOutboundEmail } from "../../worker/email";

const eventId = "pacific-open-data-summit-2026";

const adminPrincipal = {
  id: "cc05-admin",
  displayName: "CC05 Admin",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

type Sender = {
  send: (
    message: CommunicationOutboundEmail,
  ) => Promise<
    | { outcome: "sent"; providerReference: string }
    | { outcome: "permanent_failure"; error: string }
    | { outcome: "unknown"; error: string; providerReference?: string | null }
  >;
};

function makeApp(sender?: Sender) {
  return createApp({
    resolvePrincipal: async () => adminPrincipal,
    signingSecret: "course-check-05-test-signing-secret",
    ...(sender ? { communicationEmailSender: sender } : {}),
  } as Parameters<typeof createApp>[0] & {
    communicationEmailSender?: Sender;
  });
}

const app = makeApp();

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

async function patchSession(
  sessionId: string,
  body: Record<string, unknown>,
): Promise<SessionPlacementResponse> {
  const response = await app.request(
    `https://chartstead.test/api/events/${eventId}/sessions/${sessionId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
  );
  expect(response.status).toBe(200);
  return response.json<SessionPlacementResponse>();
}

async function getAgenda(): Promise<AgendaWorkspaceResponse> {
  const response = await app.request(
    `https://chartstead.test/api/events/${eventId}/sessions`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
  return response.json<AgendaWorkspaceResponse>();
}

function communicationBody(plan: CourseCheckPlan): CommunicationPlanBody {
  if (plan.body.actionType !== "communication") {
    throw new Error("expected communication plan");
  }
  return plan.body;
}

async function acceptProposal(proposalId: string, keyPrefix: string) {
  const decisionResponse = await post("/course-checks/decisions", {
    proposalId,
    outcome: "accepted",
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
  return applyResponse.json<CourseCheckPlan>();
}

async function sessionForAccepted(
  proposalId: string,
  keyPrefix: string,
): Promise<string> {
  await acceptProposal(proposalId, keyPrefix);
  const store = env.EVENT_STORE.getByName(eventId);
  const cascade = await store.getAcceptanceCascade(proposalId);
  const sessionId = cascade.sessions[0]?.id;
  expect(sessionId).toBeTruthy();
  return sessionId!;
}

describe("Course Check 05 — calendar delivery lifecycle", () => {
  beforeAll(async () => {
    const response = await app.request(
      `https://chartstead.test/api/events/${eventId}`,
      undefined,
      env,
    );
    expect(response.status).toBe(200);
  });

  it("keeps private schedule placement immediate, including TBD location create", async () => {
    const sessionId = await sessionForAccepted("SUB-PODS0010", "cc05-place");
    const created = await patchSession(sessionId, {
      startsAt: "2026-10-09T15:00:00.000Z",
      endsAt: "2026-10-09T15:45:00.000Z",
      roomId: null,
    });
    expect(created.session.placementStatus).toBe("partial");
    expect(created.session.roomId).toBeNull();
    expect(created.calendarIntentsCreated.some((intent) => intent.kind === "create")).toBe(
      true,
    );
    expect(created.session.calendarInviteRecorded).toBe(true);
    expect(created.session.calendarUid).toMatch(/^cal_/);
    expect(created.session.startsAt).toBe("2026-10-09T15:00:00.000Z");
  });

  it("plans direct calendar invite create with pending location and freezes ICS", async () => {
    const sessionId = await sessionForAccepted("SUB-PODS0011", "cc05-direct");
    await patchSession(sessionId, {
      startsAt: "2026-10-10T16:00:00.000Z",
      endsAt: "2026-10-10T17:00:00.000Z",
      roomId: null,
    });

    const communicationResponse = await post("/course-checks/communications", {
      sessionIds: [sessionId],
      subject: "Your session calendar invite",
      bodyText: "Please add this session to your calendar.",
      idempotencyKey: "cc05-direct-comm",
    });
    expect(communicationResponse.status).toBe(201);
    const communication = await communicationResponse.json<CourseCheckPlan>();
    const body = communicationBody(communication);
    expect(body.purpose).toBe("calendar_update");
    expect(body.calendarOps).toHaveLength(1);
    expect(body.calendarOps[0]).toMatchObject({
      sessionId,
      kind: "create",
      sequence: 0,
      locationPending: true,
      reversibility: "compensating_update_or_cancel",
    });
    expect(body.calendarOps[0]?.uid).toBeTruthy();
    expect(body.calendarOps[0]?.recipients.length).toBeGreaterThan(0);
    expect(
      body.deltas.some((delta) => delta.entityType === "calendar_invite"),
    ).toBe(true);

    const draftsResponse = await post(
      `/course-checks/${communication.id}/create-drafts`,
      {
        planVersion: communication.version,
        digest: communication.digest,
        stageId: "create-drafts",
        idempotencyKey: "cc05-direct-drafts",
      },
    );
    expect(draftsResponse.status).toBe(201);
    const frozen = await draftsResponse.json<CourseCheckPlan>();
    const frozenBody = communicationBody(frozen);
    expect(frozenBody.stageVisibility.draft).toBe("complete");
    expect(frozenBody.drafts.length).toBeGreaterThan(0);
    const draft = frozenBody.drafts[0]!;
    expect(draft.calendarIntent?.operation).toBe("create");
    expect(draft.calendarIntent?.ics).toContain("METHOD:REQUEST");
    expect(draft.calendarIntent?.ics).toContain("LOCATION:Location pending");
    expect(draft.calendarIntent?.ics).toContain(`UID:${body.calendarOps[0]!.uid}`);
    expect(draft.attachmentRefs).toContain("invite.ics");
  });

  it("uses same UID and higher sequence for reschedule update", async () => {
    const sessionId = await sessionForAccepted("SUB-PODS0012", "cc05-reschedule");
    const created = await patchSession(sessionId, {
      roomId: "harbor-hall",
      startsAt: "2026-10-11T14:00:00.000Z",
      endsAt: "2026-10-11T15:00:00.000Z",
    });
    const uid = created.session.calendarUid;

    const updated = await patchSession(sessionId, {
      startsAt: "2026-10-11T18:00:00.000Z",
      endsAt: "2026-10-11T19:00:00.000Z",
    });
    expect(updated.calendarIntentsCreated[0]?.kind).toBe("update");
    expect(updated.calendarIntentsCreated[0]?.uid).toBe(uid);
    expect(updated.session.calendarSequence).toBeGreaterThan(0);

    const communicationResponse = await post("/course-checks/communications", {
      sessionIds: [sessionId],
      subject: "Session time changed",
      bodyText: "Please update your calendar.",
      idempotencyKey: "cc05-reschedule-comm",
    });
    expect(communicationResponse.status).toBe(201);
    const body = communicationBody(
      await communicationResponse.json<CourseCheckPlan>(),
    );
    expect(body.calendarOps[0]).toMatchObject({
      kind: "update",
      uid,
      sequence: updated.session.calendarSequence,
    });
    expect(body.calendarOps[0]?.previous).toBeTruthy();
  });

  it("cancels with the same UID and valid cancellation semantics", async () => {
    const sessionId = await sessionForAccepted("SUB-PODS0013", "cc05-cancel");
    const created = await patchSession(sessionId, {
      roomId: "chart-room",
      startsAt: "2026-10-12T14:00:00.000Z",
      endsAt: "2026-10-12T15:00:00.000Z",
    });
    const uid = created.session.calendarUid;

    const cancelled = await patchSession(sessionId, {
      startsAt: null,
      endsAt: null,
    });
    expect(cancelled.calendarIntentsCreated.some((intent) => intent.kind === "cancel")).toBe(
      true,
    );
    expect(cancelled.calendarIntentsCreated[0]?.uid).toBe(uid);

    const communicationResponse = await post("/course-checks/communications", {
      sessionIds: [sessionId],
      subject: "Session cancelled",
      bodyText: "Please remove this invite.",
      idempotencyKey: "cc05-cancel-comm",
    });
    expect(communicationResponse.status).toBe(201);
    const plan = await communicationResponse.json<CourseCheckPlan>();
    const body = communicationBody(plan);
    expect(body.calendarOps[0]?.kind).toBe("cancel");
    expect(body.calendarOps[0]?.uid).toBe(uid);

    const draftsResponse = await post(`/course-checks/${plan.id}/create-drafts`, {
      planVersion: plan.version,
      digest: plan.digest,
      stageId: "create-drafts",
      idempotencyKey: "cc05-cancel-drafts",
    });
    expect(draftsResponse.status).toBe(201);
    const frozen = communicationBody(await draftsResponse.json<CourseCheckPlan>());
    expect(frozen.drafts[0]?.calendarIntent?.method).toBe("CANCEL");
    expect(frozen.drafts[0]?.calendarIntent?.ics).toContain("METHOD:CANCEL");
    expect(frozen.drafts[0]?.calendarIntent?.ics).toContain("STATUS:CANCELLED");
  });

  it("delivers one independent effect per recipient with frozen ICS and blocks duplicate send", async () => {
    const sent: CommunicationOutboundEmail[] = [];
    const deliveryApp = makeApp({
      async send(message) {
        sent.push(message);
        return {
          outcome: "sent",
          providerReference: `prov_${message.idempotencyKey}`,
        };
      },
    });

    const sessionId = await sessionForAccepted("SUB-PODS0014", "cc05-send");
    await patchSession(sessionId, {
      roomId: "harbor-hall",
      startsAt: "2026-10-13T15:00:00.000Z",
      endsAt: "2026-10-13T16:00:00.000Z",
    });

    const communicationResponse = await post(
      "/course-checks/communications",
      {
        sessionIds: [sessionId],
        subject: "Calendar delivery test",
        bodyText: "Invite attached.",
        idempotencyKey: "cc05-send-comm",
      },
      deliveryApp,
    );
    expect(communicationResponse.status).toBe(201);
    const communication = await communicationResponse.json<CourseCheckPlan>();
    const draftsResponse = await post(
      `/course-checks/${communication.id}/create-drafts`,
      {
        planVersion: communication.version,
        digest: communication.digest,
        stageId: "create-drafts",
        idempotencyKey: "cc05-send-drafts",
      },
      deliveryApp,
    );
    expect(draftsResponse.status).toBe(201);
    const frozen = await draftsResponse.json<CourseCheckPlan>();
    const frozenBody = communicationBody(frozen);
    expect(frozenBody.drafts.length).toBeGreaterThanOrEqual(1);

    const sendBody = {
      planVersion: frozen.version,
      digest: frozen.digest,
      stageId: "send-messages",
      idempotencyKey: "cc05-send-send",
    };
    const sendResponse = await post(
      `/course-checks/${frozen.id}/send`,
      sendBody,
      deliveryApp,
    );
    expect(sendResponse.status).toBe(202);
    const afterSend = await sendResponse.json<CourseCheckPlan>();
    expect(afterSend.state).toBe("Complete");
    expect(communicationBody(afterSend).effects.length).toBe(frozenBody.drafts.length);
    expect(sent.length).toBe(frozenBody.drafts.length);
    for (const message of sent) {
      expect(message.attachments?.length).toBe(1);
      expect(message.attachments?.[0]?.contentType).toContain("text/calendar");
      expect(message.attachments?.[0]?.content).toContain("BEGIN:VCALENDAR");
      expect(message.attachments?.[0]?.content).toContain("METHOD:REQUEST");
    }

    const replay = await post(
      `/course-checks/${frozen.id}/send`,
      sendBody,
      deliveryApp,
    );
    expect(replay.status).toBe(200);
    expect(sent.length).toBe(frozenBody.drafts.length);
  });

  it("supports partial recipient failure and unknown reconciliation independently", async () => {
    const store = env.EVENT_STORE.getByName(eventId);
    await store.setProposalCoSpeakersForTest("SUB-PODS0015", [
      {
        name: "Partial Fail Co",
        email: "cc05-fail@example.test",
        biography: "Fails permanently.",
      },
    ]);

    const deliveryApp = makeApp({
      async send(message) {
        if (message.to.toLowerCase().includes("fail")) {
          return { outcome: "permanent_failure", error: "mailbox rejected" };
        }
        return {
          outcome: "unknown",
          error: "provider timeout",
          providerReference: null,
        };
      },
    });

    const sessionId = await sessionForAccepted("SUB-PODS0015", "cc05-partial");
    await patchSession(sessionId, {
      roomId: "chart-room",
      startsAt: "2026-10-14T15:00:00.000Z",
      endsAt: "2026-10-14T16:00:00.000Z",
    });

    const communicationResponse = await post(
      "/course-checks/communications",
      {
        sessionIds: [sessionId],
        subject: "Partial failure calendar",
        bodyText: "Invite.",
        idempotencyKey: "cc05-partial-comm",
      },
      deliveryApp,
    );
    const communication = await communicationResponse.json<CourseCheckPlan>();
    const draftsResponse = await post(
      `/course-checks/${communication.id}/create-drafts`,
      {
        planVersion: communication.version,
        digest: communication.digest,
        stageId: "create-drafts",
        idempotencyKey: "cc05-partial-drafts",
      },
      deliveryApp,
    );
    expect(draftsResponse.status).toBe(201);
    const frozen = await draftsResponse.json<CourseCheckPlan>();
    const sendResponse = await post(
      `/course-checks/${frozen.id}/send`,
      {
        planVersion: frozen.version,
        digest: frozen.digest,
        stageId: "send-messages",
        idempotencyKey: "cc05-partial-send",
      },
      deliveryApp,
    );
    expect(sendResponse.status).toBe(202);
    const plan = await sendResponse.json<CourseCheckPlan>();
    const body = communicationBody(plan);
    expect(body.effects.some((effect) => effect.status === "permanent_failure")).toBe(
      true,
    );
    expect(body.effects.some((effect) => effect.status === "unknown")).toBe(true);
    expect(plan.state).toBe("Needs attention");

    const failed = body.effects.find((effect) => effect.status === "permanent_failure")!;
    const unknown = body.effects.find((effect) => effect.status === "unknown")!;

    const retryUnknown = await post(
      `/course-checks/${plan.id}/effects/${unknown.effectId}/retry`,
      { idempotencyKey: "cc05-partial-retry-unknown" },
      deliveryApp,
    );
    expect(retryUnknown.status).toBe(409);

    const reconcile = await post(
      `/course-checks/${plan.id}/effects/${unknown.effectId}/reconcile`,
      {
        outcome: "not_delivered",
        note: "Provider never accepted the request.",
        idempotencyKey: "cc05-partial-reconcile",
      },
      deliveryApp,
    );
    expect(reconcile.status).toBe(200);

    const retryFailed = await post(
      `/course-checks/${plan.id}/effects/${failed.effectId}/retry`,
      { idempotencyKey: "cc05-partial-retry-failed" },
      deliveryApp,
    );
    expect(retryFailed.status).toBe(200);
  });

  it("creates compensating calendar correction without mutating the original effect", async () => {
    const deliveryApp = makeApp({
      async send(message) {
        return {
          outcome: "sent",
          providerReference: `prov_${message.idempotencyKey}`,
        };
      },
    });

    const sessionId = await sessionForAccepted("SUB-PODS0016", "cc05-comp");
    await patchSession(sessionId, {
      roomId: "harbor-hall",
      startsAt: "2026-10-15T15:00:00.000Z",
      endsAt: "2026-10-15T16:00:00.000Z",
    });

    const communicationResponse = await post(
      "/course-checks/communications",
      {
        sessionIds: [sessionId],
        subject: "Original invite",
        bodyText: "Original calendar body.",
        idempotencyKey: "cc05-comp-comm",
      },
      deliveryApp,
    );
    const communication = await communicationResponse.json<CourseCheckPlan>();
    const draftsResponse = await post(
      `/course-checks/${communication.id}/create-drafts`,
      {
        planVersion: communication.version,
        digest: communication.digest,
        stageId: "create-drafts",
        idempotencyKey: "cc05-comp-drafts",
      },
      deliveryApp,
    );
    const frozen = await draftsResponse.json<CourseCheckPlan>();
    const sendResponse = await post(
      `/course-checks/${frozen.id}/send`,
      {
        planVersion: frozen.version,
        digest: frozen.digest,
        stageId: "send-messages",
        idempotencyKey: "cc05-comp-send",
      },
      deliveryApp,
    );
    const deliveredPlan = await sendResponse.json<CourseCheckPlan>();
    const effect = communicationBody(deliveredPlan).effects[0]!;
    expect(effect.status).toBe("succeeded");
    const originalUid =
      communicationBody(deliveredPlan).drafts[0]?.calendarIntent?.uid;
    const originalSequence =
      communicationBody(deliveredPlan).drafts[0]?.calendarIntent?.sequence ?? 0;

    await patchSession(sessionId, {
      startsAt: "2026-10-15T18:00:00.000Z",
      endsAt: "2026-10-15T19:00:00.000Z",
    });

    const correctionResponse = await post(
      `/course-checks/${frozen.id}/effects/${effect.effectId}/correction`,
      {
        reason: "Room and time changed after send.",
        subject: "Updated session invite",
        bodyText: "Please replace the previous invite.",
        idempotencyKey: "cc05-comp-correction",
      },
      deliveryApp,
    );
    expect(correctionResponse.status).toBe(201);
    const correction = await correctionResponse.json<CourseCheckPlan>();
    const correctionBody = communicationBody(correction);
    expect(correctionBody.source.kind).toBe("compensation");
    expect(correctionBody.compensation?.originalEffectId).toBe(effect.effectId);
    expect(correctionBody.calendarOps[0]?.uid).toBe(originalUid);
    expect(correctionBody.calendarOps[0]?.sequence).toBeGreaterThan(originalSequence);
    expect(correctionBody.calendarOps[0]?.kind).toBe("update");

    const reloadedOriginal = await deliveryApp.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/${frozen.id}`,
      undefined,
      env,
    );
    const originalEffects = communicationBody(
      await reloadedOriginal.json<CourseCheckPlan>(),
    ).effects;
    expect(originalEffects.find((row) => row.effectId === effect.effectId)?.status).toBe(
      "succeeded",
    );
  });

  it("keeps stable calendar UID through public program rollback", async () => {
    const sessionId = await sessionForAccepted("SUB-PODS0017", "cc05-public");
    const placed = await patchSession(sessionId, {
      roomId: "harbor-hall",
      startsAt: "2026-10-16T15:00:00.000Z",
      endsAt: "2026-10-16T16:00:00.000Z",
    });
    const uid = placed.session.calendarUid;
    const sequence = placed.session.calendarSequence;

    const publicationResponse = await post("/course-checks/publications", {
      operation: "publish",
      idempotencyKey: "cc05-public-publish",
    });
    expect(publicationResponse.status).toBe(201);
    const publication = await publicationResponse.json<CourseCheckPlan>();
    expect(publication.body.actionType).toBe("publication");
    const stageId =
      publication.body.actionType === "publication"
        ? (publication.body.stages[0]?.id ?? "publish-program")
        : "publish-program";
    const applyPublication = await post(`/course-checks/${publication.id}/apply`, {
      planVersion: publication.version,
      digest: publication.digest,
      stageId,
      idempotencyKey: "cc05-public-publish-apply",
      softWarningOverrides: (publication.body.findings ?? [])
        .filter((finding) => finding.severity === "warning" && finding.materialExternal)
        .map((finding) => ({
          findingId: finding.id,
          reason: "Calendar identity stability check.",
        })),
    });
    expect(applyPublication.status).toBe(200);
    const applied = await applyPublication.json<CourseCheckPlan>();
    expect(applied.body.actionType).toBe("publication");
    if (applied.body.actionType === "publication") {
      const consequence = applied.body.calendarConsequences.find(
        (row) => row.sessionId === sessionId,
      );
      if (consequence) {
        expect(consequence.uid).toBe(uid);
      }
    }

    const unpublishResponse = await post("/course-checks/publications", {
      operation: "unpublish",
      idempotencyKey: "cc05-public-unpublish",
    });
    expect(unpublishResponse.status).toBe(201);
    const unpublish = await unpublishResponse.json<CourseCheckPlan>();
    const unpublishStage =
      unpublish.body.actionType === "publication"
        ? (unpublish.body.stages[0]?.id ?? "unpublish-program")
        : "unpublish-program";
    const applyUnpublish = await post(`/course-checks/${unpublish.id}/apply`, {
      planVersion: unpublish.version,
      digest: unpublish.digest,
      stageId: unpublishStage,
      idempotencyKey: "cc05-public-unpublish-apply",
    });
    expect(applyUnpublish.status).toBe(200);

    const agenda = await getAgenda();
    const session = agenda.sessions.find((row) => row.id === sessionId);
    expect(session?.calendarUid).toBe(uid);
    expect(session?.calendarSequence).toBe(sequence);
  });
});
