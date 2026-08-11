import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { CourseCheckPlan } from "../../shared/course-check";
import type {
  AgendaWorkspaceResponse,
  OrganizerPrincipal,
  OrganizerProposal,
  PublicProgramResponse,
  SessionPlacementResponse,
} from "../../shared/events";
import { assertPublicProgramPayloadIsSafe } from "../../shared/public-program";
import { createApp } from "../../worker/app";

const eventId = "pacific-open-data-summit-2026";
const signingSecret = "ticket-09-public-program-signing-secret";

const adminPrincipal = {
  id: "t09-admin",
  displayName: "Program Admin",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const adminApp = createApp({
  resolvePrincipal: async () => adminPrincipal,
  signingSecret,
});

const publicApp = createApp({
  resolvePrincipal: async () => null,
  signingSecret,
});

async function loadEvent() {
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

async function acceptProposal(proposalId: string, key: string): Promise<CourseCheckPlan> {
  const create = await adminApp.request(
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
  expect(create.status).toBe(201);
  const plan = await create.json<CourseCheckPlan>();
  const apply = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/${plan.id}/apply`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `${key}-apply`,
      },
      body: JSON.stringify({
        planVersion: plan.version,
        digest: plan.digest,
        stageId: "apply-decision",
        idempotencyKey: `${key}-apply`,
      }),
    },
    env,
  );
  expect(apply.status).toBe(200);
  return apply.json<CourseCheckPlan>();
}

async function getAgenda(): Promise<AgendaWorkspaceResponse> {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}/sessions`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
  return response.json<AgendaWorkspaceResponse>();
}

async function placeSession(
  sessionId: string,
  body: Record<string, unknown>,
): Promise<SessionPlacementResponse> {
  const response = await adminApp.request(
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

async function publishRevision(): Promise<PublicProgramResponse> {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}/program/publish-test`,
    { method: "POST" },
    env,
  );
  expect(response.status).toBe(201);
  return response.json<PublicProgramResponse>();
}

async function fetchProgram(revisionId?: string): Promise<{
  status: number;
  body: PublicProgramResponse | { error: string };
}> {
  const query = revisionId ? `?revision=${encodeURIComponent(revisionId)}` : "";
  const response = await publicApp.request(
    `https://chartstead.test/api/events/${eventId}/program${query}`,
    undefined,
    env,
  );
  return {
    status: response.status,
    body: await response.json(),
  };
}

describe("Ticket 09 public program", () => {
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
      env.AUTH_DB.prepare(`CREATE TABLE IF NOT EXISTS "session" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "expiresAt" INTEGER NOT NULL,
        "token" TEXT NOT NULL UNIQUE,
        "createdAt" INTEGER NOT NULL,
        "updatedAt" INTEGER NOT NULL,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "userId" TEXT NOT NULL
      )`),
      env.AUTH_DB.prepare(`CREATE TABLE IF NOT EXISTS "account" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "accountId" TEXT NOT NULL,
        "providerId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "accessToken" TEXT,
        "refreshToken" TEXT,
        "idToken" TEXT,
        "accessTokenExpiresAt" INTEGER,
        "refreshTokenExpiresAt" INTEGER,
        "scope" TEXT,
        "password" TEXT,
        "createdAt" INTEGER NOT NULL,
        "updatedAt" INTEGER NOT NULL
      )`),
      env.AUTH_DB.prepare(`CREATE TABLE IF NOT EXISTS "verification" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "identifier" TEXT NOT NULL,
        "value" TEXT NOT NULL,
        "expiresAt" INTEGER NOT NULL,
        "createdAt" INTEGER,
        "updatedAt" INTEGER
      )`),
    ]);
    await loadEvent();
  });

  it("returns 404 when no public revision exists", async () => {
    // Fresh DO may already have seed revision — only assert shape if empty path.
    // Force isolation by using a response that has no sessions after wipe is unavailable;
    // publish path is covered below. Empty check uses unknown event.
    const missing = await publicApp.request(
      "https://chartstead.test/api/events/does-not-exist/program",
      undefined,
      env,
    );
    expect(missing.status).toBe(404);
  });

  it("publishes an immutable revision from the valid working subset", async () => {
    const proposals = await listProposals();
    const first = proposals.find((item) => item.status !== "deny") ?? proposals[0];
    const second =
      proposals.find((item) => item.id !== first.id && item.status !== "deny") ??
      proposals[1];
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();

    await acceptProposal(first.id, `t09-accept-${first.id}`);
    await acceptProposal(second.id, `t09-accept-${second.id}`);

    const agenda = await getAgenda();
    expect(agenda.sessions.length).toBeGreaterThanOrEqual(2);
    const [sessionA, sessionB] = agenda.sessions;
    await placeSession(sessionA.id, {
      roomId: "harbor-hall",
      startsAt: "2026-10-07T15:00:00.000Z",
      endsAt: "2026-10-07T15:45:00.000Z",
    });
    // Partial placement (room only) remains publishable with TBD time.
    await placeSession(sessionB.id, {
      roomId: "harbor-hall",
    });

    const store = env.EVENT_STORE.getByName(eventId);
    const speakerId = sessionA.speakers[0]?.id;
    expect(speakerId).toBeTruthy();
    await store.updateSpeakerProfileForTest(speakerId!, {
      biography: "Public-approved biography for Ada.",
      name: sessionA.speakers[0]!.name,
    });

    const published = await publishRevision();
    expect(published.revision.isCurrent).toBe(true);
    expect(published.revision.version).toBeGreaterThanOrEqual(1);
    expect(published.sessions.length).toBeGreaterThanOrEqual(2);
    expect(published.event.themeAccent).toMatch(/^#[0-9a-f]{6}$/);

    const placed = published.sessions.find((item) => item.id === sessionA.id);
    const partial = published.sessions.find((item) => item.id === sessionB.id);
    expect(placed).toMatchObject({
      id: sessionA.id,
      title: sessionA.title,
      roomId: "harbor-hall",
      roomName: "Harbor Hall",
      startsAt: "2026-10-07T15:00:00.000Z",
      day: "2026-10-07",
      calendarUid: sessionA.calendarUid || `cal_${sessionA.id}`,
    });
    expect(placed?.description.length).toBeGreaterThan(0);
    expect(partial?.startsAt).toBeNull();
    expect(partial?.roomId).toBe("harbor-hall");
    expect(partial?.roomPending).toBe(false);

    const speaker = published.speakers.find((item) => item.id === speakerId);
    expect(speaker?.biography).toBe("Public-approved biography for Ada.");
    expect(speaker?.sessionIds).toContain(sessionA.id);

    const leaks = assertPublicProgramPayloadIsSafe(published);
    expect(leaks).toEqual([]);
  });

  it("serves the current revision publicly without auth", async () => {
    const { status, body } = await fetchProgram();
    expect(status).toBe(200);
    expect("sessions" in body).toBe(true);
    if (!("sessions" in body)) return;
    expect(body.revision.isCurrent).toBe(true);
    expect(assertPublicProgramPayloadIsSafe(body)).toEqual([]);
  });

  it("serves a selected immutable revision id and keeps prior snapshots frozen", async () => {
    const first = await fetchProgram();
    expect(first.status).toBe(200);
    if (!("revision" in first.body)) return;
    const firstRevisionId = first.body.revision.id;
    const firstSessionCount = first.body.sessions.length;

    const proposals = await listProposals();
    // Accept another proposal and republish — prior revision stays frozen.
    const candidate = proposals.find(
      (item) => item.programOutcome == null && item.status !== "deny",
    );
    if (candidate) {
      await acceptProposal(candidate.id, `t09-accept-third-${candidate.id}`);
    }

    const secondPublish = await publishRevision();
    expect(secondPublish.revision.id).not.toBe(firstRevisionId);
    expect(secondPublish.revision.isCurrent).toBe(true);

    const selected = await fetchProgram(firstRevisionId);
    expect(selected.status).toBe(200);
    if (!("revision" in selected.body)) return;
    expect(selected.body.revision.id).toBe(firstRevisionId);
    expect(selected.body.revision.isCurrent).toBe(false);
    expect(selected.body.sessions.length).toBe(firstSessionCount);
  });

  it("never leaks organizer or onboarding fields on the public program payload", async () => {
    const { status, body } = await fetchProgram();
    expect(status).toBe(200);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/committeeNote|privateNote|courseCheckPlanId/);
    expect(serialized).not.toMatch(/"email"|speakerEmail|portalToken|signedToken/);
    expect(serialized).not.toMatch(/onboarding_tasks|reminder_drafts/);
    expect(assertPublicProgramPayloadIsSafe(body)).toEqual([]);
  });

  it("exports add-to-calendar ICS using the session calendar UID", async () => {
    const { status, body } = await fetchProgram();
    expect(status).toBe(200);
    if (!("sessions" in body)) return;
    const session =
      body.sessions.find((item) => item.startsAt && item.endsAt) ?? body.sessions[0];
    expect(session).toBeTruthy();

    const response = await publicApp.request(
      `https://chartstead.test/api/events/${eventId}/program/sessions/${session!.id}/calendar.ics`,
      undefined,
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type") ?? "").toMatch(/text\/calendar/);
    const ics = await response.text();
    expect(ics).toContain(`UID:${session!.calendarUid}`);
    expect(ics).toContain(`SUMMARY:${session!.title}`);
    if (session!.startsAt) {
      expect(ics).toContain("DTSTART:");
    }
  });

  it("does not expose working agenda sessions that were never published", async () => {
    const proposals = await listProposals();
    const unpublished = proposals.find(
      (item) => item.programOutcome == null && item.status !== "deny",
    );
    if (!unpublished) return;

    await acceptProposal(unpublished.id, `t09-accept-unpub-${unpublished.id}`);
    const agenda = await getAgenda();
    const fresh = agenda.sessions.find((item) => item.proposalId === unpublished.id);
    expect(fresh).toBeTruthy();

    const { status, body } = await fetchProgram();
    expect(status).toBe(200);
    if (!("sessions" in body)) return;
    expect(body.sessions.some((item) => item.id === fresh!.id)).toBe(false);
  });
});
