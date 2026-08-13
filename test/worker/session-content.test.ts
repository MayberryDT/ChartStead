import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type {
  AgendaWorkspaceResponse,
  OrganizerPrincipal,
  OrganizerProposal,
  SessionContentMutationResponse,
  SessionContentWorkspaceResponse,
} from "../../shared/events";
import type { CourseCheckPlan } from "../../shared/course-check";
import { createApp } from "../../worker/app";

const eventId = "pacific-open-data-summit-2026";
const admin = {
  id: "rubric-15-admin",
  displayName: "Content Admin",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;
const adminApp = createApp({ resolvePrincipal: async () => admin });
const reviewerApp = createApp({
  resolvePrincipal: async () => ({
    id: "rubric-15-reviewer",
    displayName: "Content Reviewer",
    role: "reviewer",
    eventIds: [eventId],
    trackIdsByEvent: { [eventId]: ["platform"] },
  }),
});
const publicApp = createApp({ resolvePrincipal: async () => null });

async function requestJson<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const response = await adminApp.request(`https://chartstead.test${path}`, init, env);
  return { status: response.status, body: await response.json<T>() };
}

describe("Rubric 15 session content", () => {
  let sessionId = "";

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
    ]);
    await requestJson(`/api/events/${eventId}`);
    const proposals = await requestJson<{ proposals: OrganizerProposal[] }>(
      `/api/events/${eventId}/proposals`,
    );
    const proposal = proposals.body.proposals.find(
      (candidate) => candidate.programOutcome == null && candidate.status !== "deny",
    );
    expect(proposal).toBeTruthy();
    const key = `rubric-15-${proposal!.id}`;
    const created = await requestJson<CourseCheckPlan>(
      `/api/events/${eventId}/course-checks/decisions`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify({ proposalId: proposal!.id, outcome: "accepted", idempotencyKey: key }),
      },
    );
    const applied = await requestJson<CourseCheckPlan>(
      `/api/events/${eventId}/course-checks/${created.body.id}/apply`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": `${key}-apply` },
        body: JSON.stringify({
          planVersion: created.body.version,
          digest: created.body.digest,
          stageId: "apply-decision",
          idempotencyKey: `${key}-apply`,
        }),
      },
    );
    expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    const agenda = await requestJson<AgendaWorkspaceResponse>(`/api/events/${eventId}/sessions`);
    sessionId = agenda.body.sessions.find((session) => session.proposalId === proposal!.id)!.id;
    const placement = await requestJson(`/api/events/${eventId}/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roomId: "harbor-hall",
        startsAt: "2026-10-07T15:00:00.000Z",
        endsAt: "2026-10-07T15:45:00.000Z",
      }),
    });
    expect(placement.status).toBe(200);
  });

  it("edits, reviews, restores, and rejects stale or unauthorized writes", async () => {
    const initial = await requestJson<SessionContentWorkspaceResponse>(
      `/api/events/${eventId}/session-content`,
    );
    const session = initial.body.sessions.find((candidate) => candidate.id === sessionId)!;
    expect(session.contentStatus).toBe("draft");
    expect(session.contentHistory).toHaveLength(1);

    const denied = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/session-content/${sessionId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: session.contentVersion, title: "Forbidden" }),
      },
      env,
    );
    expect(denied.status).toBe(403);
    const anonymous = await publicApp.request(
      `https://chartstead.test/api/events/${eventId}/session-content`,
      undefined,
      env,
    );
    expect(anonymous.status).toBe(401);

    const edited = await requestJson<SessionContentMutationResponse>(
      `/api/events/${eventId}/session-content/${sessionId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: session.contentVersion,
          title: "Edited public title",
          abstract: "Internal abstract revision",
          publicContent: "Approved public description",
        }),
      },
    );
    expect(edited.body.session).toMatchObject({
      title: "Edited public title",
      abstract: "Internal abstract revision",
      publicContent: "Approved public description",
      contentStatus: "draft",
      contentVersion: 2,
    });
    expect(edited.body.session.contentHistory[0]).toMatchObject({
      actorId: admin.id,
      changedFields: ["title", "abstract", "publicContent"],
      previous: { title: session.title },
    });

    const stale = await requestJson<{ code: string }>(
      `/api/events/${eventId}/session-content/${sessionId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: 1, status: "approved" }),
      },
    );
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("content_version_mismatch");

    const approved = await requestJson<SessionContentMutationResponse>(
      `/api/events/${eventId}/session-content/${sessionId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: 2, status: "approved" }),
      },
    );
    expect(approved.body.session.contentStatus).toBe("approved");

    const restored = await requestJson<SessionContentMutationResponse>(
      `/api/events/${eventId}/session-content/${sessionId}/restore`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: 3, restoreVersion: 1 }),
      },
    );
    expect(restored.body.session.contentVersion).toBe(4);
    expect(restored.body.session.contentHistory[0].changeKind).toBe("restore");
    expect(restored.body.session.roomId).toBe("harbor-hall");
    expect(restored.body.session.startsAt).toBe("2026-10-07T15:00:00.000Z");

    const publication = await requestJson<CourseCheckPlan>(
      `/api/events/${eventId}/course-checks/publications`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "rubric-15-publish" },
        body: JSON.stringify({ operation: "publish", idempotencyKey: "rubric-15-publish" }),
      },
    );
    expect(publication.body.body.actionType).toBe("publication");
    if (publication.body.body.actionType !== "publication") return;
    expect(publication.body.body.excludedSessions).toContainEqual(
      expect.objectContaining({
        sessionId,
        reasons: expect.arrayContaining(["content is not approved"]),
      }),
    );
  });
});
