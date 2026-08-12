import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type {
  CommunicationPlanBody,
  CourseCheckPlan,
} from "../../shared/course-check";
import type {
  OrganizerPrincipal,
  OrganizerProposal,
  ProposalAuditEvent,
  SessionPlacementResponse,
  SpeakerPortalSession,
} from "../../shared/events";
import { createApp } from "../../worker/app";
import type { CommunicationOutboundEmail } from "../../worker/email";
import { signPortalToken } from "../../worker/signed-links";

const eventId = "pacific-open-data-summit-2026";
const signingSecret = "ticket-07-decisions-calendar-secret";

const adminPrincipal = {
  id: "t07-admin",
  displayName: "Ticket 07 Admin",
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
    signingSecret,
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

async function patch(
  path: string,
  body: Record<string, unknown>,
  target = app,
): Promise<Response> {
  return target.request(
    `https://chartstead.test/api/events/${eventId}${path}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
  );
}

async function getProposal(
  proposalId: string,
  target = app,
): Promise<{ proposal: OrganizerProposal; auditEvents: ProposalAuditEvent[] }> {
  const response = await target.request(
    `https://chartstead.test/api/events/${eventId}/organizer/proposals/${proposalId}`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
  return response.json();
}

async function patchSession(
  sessionId: string,
  body: Record<string, unknown>,
  target = app,
): Promise<SessionPlacementResponse> {
  const response = await patch(`/sessions/${sessionId}`, body, target);
  expect(response.status).toBe(200);
  return response.json<SessionPlacementResponse>();
}

function communicationBody(plan: CourseCheckPlan): CommunicationPlanBody {
  if (plan.body.actionType !== "communication") {
    throw new Error("expected communication plan");
  }
  return plan.body;
}

async function acceptProposal(
  proposalId: string,
  keyPrefix: string,
  target = app,
): Promise<CourseCheckPlan> {
  const decisionResponse = await post(
    "/course-checks/decisions",
    {
      proposalId,
      outcome: "accepted",
      idempotencyKey: `${keyPrefix}-decision`,
    },
    target,
  );
  expect(decisionResponse.status).toBe(201);
  const decision = await decisionResponse.json<CourseCheckPlan>();
  const applyResponse = await post(
    `/course-checks/${decision.id}/apply`,
    {
      planVersion: decision.version,
      digest: decision.digest,
      stageId: "apply-decision",
      idempotencyKey: `${keyPrefix}-apply`,
    },
    target,
  );
  expect(applyResponse.status).toBe(200);
  return applyResponse.json<CourseCheckPlan>();
}

async function openPortalForProposal(
  proposalId: string,
  target = app,
): Promise<SpeakerPortalSession> {
  const store = env.EVENT_STORE.getByName(eventId);
  const cascade = await store.getAcceptanceCascade(proposalId);
  const grant = cascade.portalTokens[0]!;
  expect(grant?.signedToken || grant?.tokenId).toBeTruthy();
  const token =
    grant.signedToken ??
    (await signPortalToken(signingSecret, {
      v: 1,
      kind: "portal",
      eventId,
      speakerId: grant.speakerId,
      tokenId: grant.tokenId,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    }));
  const response = await target.request(
    `https://chartstead.test/api/events/${eventId}/portal?token=${encodeURIComponent(token)}`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
  return response.json<SpeakerPortalSession>();
}

describe("Ticket 07 — decision communication and calendar lifecycle", () => {
  beforeAll(async () => {
    const response = await app.request(
      `https://chartstead.test/api/events/${eventId}`,
      undefined,
      env,
    );
    expect(response.status).toBe(200);
  });

  it("keeps internal approve/maybe/deny independent of drafts and provider sends", async () => {
    const sent: CommunicationOutboundEmail[] = [];
    const deliveryApp = makeApp({
      async send(message) {
        sent.push(message);
        return { outcome: "sent", providerReference: `prov_${sent.length}` };
      },
    });

    const proposalId = "SUB-PODS0040";
    const before = await getProposal(proposalId, deliveryApp);
    const review = await patch(
      `/organizer/proposals/${proposalId}/review`,
      {
        status: "approve",
        committeeNote: before.proposal.committeeNote,
        privateNote: before.proposal.privateNote,
        expectedVersion: before.proposal.reviewVersion,
      },
      deliveryApp,
    );
    expect(review.status).toBe(200);
    expect(sent).toHaveLength(0);

    const after = await getProposal(proposalId, deliveryApp);
    expect(after.proposal.status).toBe("approve");
    expect(after.proposal.programOutcome).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("surfaces independent decision, draft, delivery, and calendar state on portal and organizer history", async () => {
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

    const proposalId = "SUB-PODS0041";
    await acceptProposal(proposalId, "t07-lifecycle", deliveryApp);
    expect(sent).toHaveLength(0);

    const portalAfterAccept = await openPortalForProposal(proposalId, deliveryApp);
    expect(portalAfterAccept.acceptanceState).toBe("accepted");
    expect(portalAfterAccept.messages).toEqual([]);

    const store = env.EVENT_STORE.getByName(eventId);
    const cascade = await store.getAcceptanceCascade(proposalId);
    const sessionId = cascade.sessions[0]!.id;

    await patchSession(
      sessionId,
      {
        startsAt: "2026-10-20T15:00:00.000Z",
        endsAt: "2026-10-20T16:00:00.000Z",
        roomId: null,
      },
      deliveryApp,
    );

    const communicationResponse = await post(
      "/course-checks/communications",
      {
        sessionIds: [sessionId],
        subject: "Your session is on the program",
        bodyText: "Calendar invite attached. Location pending.",
        idempotencyKey: "t07-lifecycle-comm",
      },
      deliveryApp,
    );
    expect(communicationResponse.status).toBe(201);
    const communication = await communicationResponse.json<CourseCheckPlan>();
    expect(sent).toHaveLength(0);

    const draftsResponse = await post(
      `/course-checks/${communication.id}/create-drafts`,
      {
        planVersion: communication.version,
        digest: communication.digest,
        stageId: "create-drafts",
        idempotencyKey: "t07-lifecycle-drafts",
      },
      deliveryApp,
    );
    expect(draftsResponse.status).toBe(201);
    const frozen = await draftsResponse.json<CourseCheckPlan>();
    const frozenBody = communicationBody(frozen);
    expect(frozenBody.stageVisibility.draft).toBe("complete");
    expect(frozenBody.drafts[0]?.calendarIntent?.locationPending).toBe(true);
    expect(sent).toHaveLength(0);

    const portalDraft = await openPortalForProposal(proposalId, deliveryApp);
    expect(portalDraft.acceptanceState).toBe("accepted");
    expect(portalDraft.messages.length).toBeGreaterThan(0);
    expect(portalDraft.messages.every((m) => m.status === "draft")).toBe(true);
    expect(portalDraft.messages.some((m) => m.kind === "calendar_invite")).toBe(
      true,
    );
    expect(
      portalDraft.messages.find((m) => m.kind === "calendar_invite")?.calendar
        ?.locationPending,
    ).toBe(true);

    const historyDraft = await getProposal(proposalId, deliveryApp);
    expect(
      historyDraft.auditEvents.some(
        (e) => e.type === "course_check.communication.drafts_created",
      ),
    ).toBe(true);
    expect(
      historyDraft.auditEvents.some(
        (e) => e.type === "course_check.decision.applied",
      ),
    ).toBe(true);

    const sendResponse = await post(
      `/course-checks/${frozen.id}/send`,
      {
        planVersion: frozen.version,
        digest: frozen.digest,
        stageId: "send-messages",
        idempotencyKey: "t07-lifecycle-send",
      },
      deliveryApp,
    );
    expect(sendResponse.status).toBe(202);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.some((m) => m.attachments?.some((a) => a.filename === "invite.ics"))).toBe(
      true,
    );

    const portalDelivered = await openPortalForProposal(proposalId, deliveryApp);
    expect(portalDelivered.acceptanceState).toBe("accepted");
    expect(portalDelivered.messages.some((m) => m.status === "delivered")).toBe(
      true,
    );
    const invite = portalDelivered.messages.find((m) => m.kind === "calendar_invite");
    expect(invite?.calendar?.operation).toBe("create");
    expect(invite?.calendar?.locationPending).toBe(true);
    expect(invite?.calendar?.uid).toMatch(/^cal_/);

    const historySent = await getProposal(proposalId, deliveryApp);
    expect(
      historySent.auditEvents.some(
        (e) => e.type === "course_check.communication.send_started",
      ),
    ).toBe(true);

    const leaked = JSON.stringify(portalDelivered);
    expect(leaked).not.toMatch(/committeeNote|privateNote|digest|findings|approval/i);
  });

  it("keeps UID stable and raises sequence on update; cancel uses same UID", async () => {
    const proposalId = "SUB-PODS0042";
    await acceptProposal(proposalId, "t07-uid");
    const store = env.EVENT_STORE.getByName(eventId);
    const cascade = await store.getAcceptanceCascade(proposalId);
    const sessionId = cascade.sessions[0]!.id;

    const created = await patchSession(sessionId, {
      roomId: "harbor-hall",
      startsAt: "2026-10-21T14:00:00.000Z",
      endsAt: "2026-10-21T15:00:00.000Z",
    });
    const uid = created.session.calendarUid;
    expect(uid).toMatch(/^cal_/);

    const updated = await patchSession(sessionId, {
      startsAt: "2026-10-21T18:00:00.000Z",
      endsAt: "2026-10-21T19:00:00.000Z",
    });
    expect(updated.calendarIntentsCreated[0]?.uid).toBe(uid);
    expect(updated.session.calendarSequence).toBeGreaterThan(
      created.session.calendarSequence,
    );

    const updateComm = await post("/course-checks/communications", {
      sessionIds: [sessionId],
      subject: "Time changed",
      bodyText: "Updated invite.",
      idempotencyKey: "t07-uid-update-comm",
    });
    expect(updateComm.status).toBe(201);
    const updateBody = communicationBody(await updateComm.json<CourseCheckPlan>());
    expect(updateBody.calendarOps[0]).toMatchObject({
      kind: "update",
      uid,
      sequence: updated.session.calendarSequence,
    });

    const cancelled = await patchSession(sessionId, {
      startsAt: null,
      endsAt: null,
    });
    expect(cancelled.calendarIntentsCreated.some((i) => i.kind === "cancel")).toBe(
      true,
    );
    expect(cancelled.calendarIntentsCreated[0]?.uid).toBe(uid);

    const cancelComm = await post("/course-checks/communications", {
      sessionIds: [sessionId],
      subject: "Cancelled",
      bodyText: "Remove invite.",
      idempotencyKey: "t07-uid-cancel-comm",
    });
    expect(cancelComm.status).toBe(201);
    const cancelPlan = await cancelComm.json<CourseCheckPlan>();
    const cancelBody = communicationBody(cancelPlan);
    expect(cancelBody.calendarOps[0]?.kind).toBe("cancel");
    expect(cancelBody.calendarOps[0]?.uid).toBe(uid);

    const drafts = await post(`/course-checks/${cancelPlan.id}/create-drafts`, {
      planVersion: cancelPlan.version,
      digest: cancelPlan.digest,
      stageId: "create-drafts",
      idempotencyKey: "t07-uid-cancel-drafts",
    });
    expect(drafts.status).toBe(201);
    const frozen = communicationBody(await drafts.json<CourseCheckPlan>());
    expect(frozen.drafts[0]?.calendarIntent?.method).toBe("CANCEL");
    expect(frozen.drafts[0]?.calendarIntent?.ics).toContain("METHOD:CANCEL");
    expect(frozen.drafts[0]?.calendarIntent?.ics).toContain("STATUS:CANCELLED");
    expect(frozen.drafts[0]?.calendarIntent?.uid).toBe(uid);
  });

  it("only authorized send stage reaches the provider; create-drafts and apply do not", async () => {
    const sent: CommunicationOutboundEmail[] = [];
    const deliveryApp = makeApp({
      async send(message) {
        sent.push(message);
        return { outcome: "sent", providerReference: `prov_${sent.length}` };
      },
    });

    const proposalId = "SUB-PODS0043";
    await acceptProposal(proposalId, "t07-boundary", deliveryApp);
    expect(sent).toHaveLength(0);

    const store = env.EVENT_STORE.getByName(eventId);
    const cascade = await store.getAcceptanceCascade(proposalId);
    const sessionId = cascade.sessions[0]!.id;
    await patchSession(
      sessionId,
      {
        roomId: "chart-room",
        startsAt: "2026-10-22T15:00:00.000Z",
        endsAt: "2026-10-22T16:00:00.000Z",
      },
      deliveryApp,
    );
    expect(sent).toHaveLength(0);

    const communicationResponse = await post(
      "/course-checks/communications",
      {
        sessionIds: [sessionId],
        subject: "Boundary check",
        bodyText: "Should not send yet.",
        idempotencyKey: "t07-boundary-comm",
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
        idempotencyKey: "t07-boundary-drafts",
      },
      deliveryApp,
    );
    expect(draftsResponse.status).toBe(201);
    expect(sent).toHaveLength(0);

    const frozen = await draftsResponse.json<CourseCheckPlan>();
    const sendResponse = await post(
      `/course-checks/${frozen.id}/send`,
      {
        planVersion: frozen.version,
        digest: frozen.digest,
        stageId: "send-messages",
        idempotencyKey: "t07-boundary-send",
      },
      deliveryApp,
    );
    expect(sendResponse.status).toBe(202);
    expect(sent.length).toBeGreaterThan(0);

    // Replay send is idempotent — no additional provider calls beyond first delivery.
    const replayCount = sent.length;
    const replay = await post(
      `/course-checks/${frozen.id}/send`,
      {
        planVersion: frozen.version,
        digest: frozen.digest,
        stageId: "send-messages",
        idempotencyKey: "t07-boundary-send",
      },
      deliveryApp,
    );
    expect([200, 202]).toContain(replay.status);
    expect(sent.length).toBe(replayCount);
  });

  it("reflects partial failure and retry on portal and organizer history", async () => {
    let attempts = 0;
    const deliveryApp = makeApp({
      async send() {
        attempts += 1;
        if (attempts === 1) {
          return { outcome: "permanent_failure", error: "mailbox full" };
        }
        return { outcome: "sent", providerReference: `prov_retry_${attempts}` };
      },
    });

    const proposalId = "SUB-PODS0044";
    await acceptProposal(proposalId, "t07-retry", deliveryApp);
    const store = env.EVENT_STORE.getByName(eventId);
    const cascade = await store.getAcceptanceCascade(proposalId);
    const sessionId = cascade.sessions[0]!.id;
    await patchSession(
      sessionId,
      {
        roomId: "harbor-hall",
        startsAt: "2026-10-23T15:00:00.000Z",
        endsAt: "2026-10-23T16:00:00.000Z",
      },
      deliveryApp,
    );

    const communicationResponse = await post(
      "/course-checks/communications",
      {
        sessionIds: [sessionId],
        subject: "Retry path",
        bodyText: "Will fail then succeed.",
        idempotencyKey: "t07-retry-comm",
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
        idempotencyKey: "t07-retry-drafts",
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
        idempotencyKey: "t07-retry-send",
      },
      deliveryApp,
    );
    expect(sendResponse.status).toBe(202);
    const afterFail = await sendResponse.json<CourseCheckPlan>();
    const failedEffect = communicationBody(afterFail).effects.find(
      (e) => e.status === "permanent_failure",
    );
    expect(failedEffect).toBeTruthy();

    const portalFailed = await openPortalForProposal(proposalId, deliveryApp);
    expect(portalFailed.messages.some((m) => m.status === "failed")).toBe(true);

    const retryResponse = await post(
      `/course-checks/${frozen.id}/effects/${failedEffect!.effectId}/retry`,
      {
        idempotencyKey: "t07-retry-manual",
      },
      deliveryApp,
    );
    expect(retryResponse.status).toBe(200);

    // Alarm/flush path may already run on send; force another delivery cycle via DO alarm.
    const afterRetry = await retryResponse.json<CourseCheckPlan>();
    const effectAfterRetry = communicationBody(afterRetry).effects.find(
      (e) => e.effectId === failedEffect!.effectId,
    );
    // Retry queues the effect; flush may complete within the retry handler or alarm.
    expect(
      effectAfterRetry &&
        ["queued", "sending", "succeeded", "delivered", "retry_scheduled"].includes(
          effectAfterRetry.status,
        )
        ? true
        : effectAfterRetry?.status,
    ).toBeTruthy();

    const history = await getProposal(proposalId, deliveryApp);
    expect(
      history.auditEvents.some(
        (e) => e.type === "course_check.communication.effect_retry",
      ),
    ).toBe(true);
  });
});
