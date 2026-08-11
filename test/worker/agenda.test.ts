import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { CourseCheckPlan } from "../../shared/course-check";
import type {
  AgendaWorkspaceResponse,
  OrganizerPrincipal,
  OrganizerProposal,
  SessionPlacementResponse,
} from "../../shared/events";
import { createApp } from "../../worker/app";

const eventId = "pacific-open-data-summit-2026";
const signingSecret = "ticket-08-agenda-signing-secret";

const adminPrincipal = {
  id: "t08-admin",
  displayName: "Agenda Admin",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const reviewerPrincipal = {
  id: "t08-reviewer",
  displayName: "Agenda Reviewer",
  role: "reviewer",
  eventIds: [eventId],
  rolesByEvent: { [eventId]: "reviewer" },
  trackIdsByEvent: { [eventId]: ["platform"] },
} satisfies OrganizerPrincipal;

const adminApp = createApp({
  resolvePrincipal: async () => adminPrincipal,
  signingSecret,
});

const reviewerApp = createApp({
  resolvePrincipal: async () => reviewerPrincipal,
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
): Promise<{ status: number; payload: SessionPlacementResponse | { error: string } }> {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}/sessions/${sessionId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
  );
  return {
    status: response.status,
    payload: await response.json(),
  };
}

describe("Ticket 08 fluid agenda", () => {
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
    ]);
    await loadEvent();
  });

  it("lists accepted sessions in the unplaced pool with TBD placement", async () => {
    const proposals = await listProposals();
    const target = proposals.find((p) => p.status !== "deny") ?? proposals[0];
    await acceptProposal(target.id, `t08-unplaced-${target.id}`);

    const agenda = await getAgenda();
    expect(agenda.sessions.length).toBeGreaterThan(0);
    const session = agenda.sessions.find((item) => item.proposalId === target.id);
    expect(session).toBeTruthy();
    expect(session!.placementStatus).toBe("unplaced");
    expect(session!.roomId).toBeNull();
    expect(session!.startsAt).toBeNull();
    expect(session!.endsAt).toBeNull();
    expect(agenda.unplacedSessions.some((item) => item.id === session!.id)).toBe(true);
    expect(agenda.counts.unplaced).toBeGreaterThan(0);
    expect(session!.speakers.length).toBeGreaterThan(0);
    expect(session!.calendarUid).toMatch(/^cal_/);
  });

  it("saves partial TBD placement without fabricating completeness", async () => {
    const agenda = await getAgenda();
    const session = agenda.unplacedSessions[0] ?? agenda.sessions[0];
    expect(session).toBeTruthy();

    const placed = await placeSession(session.id, { roomId: "harbor-hall" });
    expect(placed.status).toBe(200);
    const body = placed.payload as SessionPlacementResponse;
    expect(body.session.roomId).toBe("harbor-hall");
    expect(body.session.roomName).toBe("Harbor Hall");
    expect(body.session.startsAt).toBeNull();
    expect(body.session.endsAt).toBeNull();
    expect(body.session.placementStatus).toBe("partial");

    const reloaded = await getAgenda();
    const again = reloaded.sessions.find((item) => item.id === session.id);
    expect(again?.placementStatus).toBe("partial");
    expect(again?.roomId).toBe("harbor-hall");
    expect(again?.startsAt).toBeNull();
  });

  it("places and moves sessions, persisting conflicts without blocking", async () => {
    const proposals = await listProposals();
    const candidates = proposals.filter((p) => p.programOutcome !== "accepted").slice(0, 2);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    await acceptProposal(candidates[0].id, `t08-conflict-a-${candidates[0].id}`);
    await acceptProposal(candidates[1].id, `t08-conflict-b-${candidates[1].id}`);

    const agenda = await getAgenda();
    const a = agenda.sessions.find((s) => s.proposalId === candidates[0].id)!;
    const b = agenda.sessions.find((s) => s.proposalId === candidates[1].id)!;

    const placeA = await placeSession(a.id, {
      roomId: "compass-room",
      startsAt: "2026-10-07T16:00:00.000Z",
      endsAt: "2026-10-07T16:45:00.000Z",
    });
    expect(placeA.status).toBe(200);

    const placeB = await placeSession(b.id, {
      roomId: "compass-room",
      startsAt: "2026-10-07T16:30:00.000Z",
      endsAt: "2026-10-07T17:15:00.000Z",
    });
    expect(placeB.status).toBe(200);
    const conflictBody = placeB.payload as SessionPlacementResponse;
    expect(conflictBody.session.placementStatus).toBe("placed");
    expect(conflictBody.conflicts.some((c) => c.kind === "room_overlap")).toBe(true);
    const roomConflict = conflictBody.conflicts.find((c) => c.kind === "room_overlap")!;
    expect(roomConflict.roomName).toBe("Compass Room");
    expect(roomConflict.sessionIds).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(roomConflict.actions).toEqual(
      expect.arrayContaining(["move_time", "move_room", "keep_placement"]),
    );
    expect(conflictBody.counts.conflicts).toBeGreaterThan(0);

    const reloaded = await getAgenda();
    expect(reloaded.conflicts.some((c) => c.kind === "room_overlap")).toBe(true);
    expect(
      reloaded.sessions.find((s) => s.id === b.id)?.roomId,
    ).toBe("compass-room");

    const moveB = await placeSession(b.id, { roomId: "chart-room" });
    expect(moveB.status).toBe(200);
    const repaired = moveB.payload as SessionPlacementResponse;
    expect(repaired.session.roomId).toBe("chart-room");
    expect(
      repaired.conflicts.some(
        (c) =>
          c.kind === "room_overlap" &&
          c.sessionIds.includes(a.id) &&
          c.sessionIds.includes(b.id),
      ),
    ).toBe(false);
  });

  it("names speaker double-booking across two sessions", async () => {
    const proposals = await listProposals();
    const first = proposals.find((p) => p.programOutcome !== "accepted")!;
    await acceptProposal(first.id, `t08-speaker-a-${first.id}`);

    const guaranteed = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/guaranteed-speakers`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "t08-guaranteed-same-email",
        },
        body: JSON.stringify({
          title: "Guaranteed follow-up",
          format: "talk",
          trackId: "platform",
          speakers: [
            {
              name: first.speakerName,
              email: first.speakerEmail,
              biography: "Returning speaker",
              role: "primary",
            },
          ],
          idempotencyKey: "t08-guaranteed-same-email",
        }),
      },
      env,
    );
    expect([200, 201]).toContain(guaranteed.status);
    const plan = await guaranteed.json<CourseCheckPlan>();
    const apply = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/${plan.id}/apply`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "t08-guaranteed-same-email-apply",
        },
        body: JSON.stringify({
          planVersion: plan.version,
          digest: plan.digest,
          stageId: "apply-decision",
          idempotencyKey: "t08-guaranteed-same-email-apply",
        }),
      },
      env,
    );
    expect(apply.status).toBe(200);

    const agenda = await getAgenda();
    const sessions = agenda.sessions.filter((session) =>
      session.speakers.some(
        (speaker) =>
          speaker.email.toLowerCase() === first.speakerEmail.toLowerCase(),
      ),
    );
    expect(sessions.length).toBeGreaterThanOrEqual(2);

    const [left, right] = sessions;
    await placeSession(left.id, {
      roomId: "harbor-hall",
      startsAt: "2026-10-08T15:00:00.000Z",
      endsAt: "2026-10-08T15:45:00.000Z",
    });
    const second = await placeSession(right.id, {
      roomId: "chart-room",
      startsAt: "2026-10-08T15:15:00.000Z",
      endsAt: "2026-10-08T16:00:00.000Z",
    });
    expect(second.status).toBe(200);
    const body = second.payload as SessionPlacementResponse;
    const speakerConflict = body.conflicts.find((c) => c.kind === "speaker_double_book");
    expect(speakerConflict).toBeTruthy();
    expect(speakerConflict!.speakerName).toBeTruthy();
    expect(speakerConflict!.sessionTitles).toHaveLength(2);
    expect(speakerConflict!.actions).toContain("open_speaker_schedule");
  });

  it("records calendar create then update intents for schedule changes", async () => {
    const agenda = await getAgenda();
    const session =
      agenda.sessions.find((item) => item.placementStatus !== "placed") ??
      agenda.sessions[0];
    expect(session).toBeTruthy();

    const create = await placeSession(session.id, {
      roomId: "harbor-hall",
      startsAt: "2026-10-07T18:00:00.000Z",
      endsAt: "2026-10-07T18:40:00.000Z",
    });
    expect(create.status).toBe(200);
    const created = create.payload as SessionPlacementResponse;
    expect(created.calendarIntentsCreated.some((i) => i.kind === "create")).toBe(true);
    expect(created.session.calendarInviteRecorded).toBe(true);
    expect(created.session.calendarUid).toBeTruthy();

    const update = await placeSession(session.id, {
      startsAt: "2026-10-07T19:00:00.000Z",
      endsAt: "2026-10-07T19:40:00.000Z",
    });
    expect(update.status).toBe(200);
    const updated = update.payload as SessionPlacementResponse;
    expect(updated.calendarIntentsCreated.some((i) => i.kind === "update")).toBe(true);
    expect(updated.session.calendarSequence).toBeGreaterThan(0);
    expect(updated.calendarIntentsCreated[0]?.uid).toBe(created.session.calendarUid);

    const reloaded = await getAgenda();
    expect(
      reloaded.calendarIntents.some(
        (intent) =>
          intent.sessionId === session.id && intent.kind === "update",
      ),
    ).toBe(true);
  });

  it("forbids reviewer access to agenda mutations", async () => {
    const list = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/sessions`,
      undefined,
      env,
    );
    expect(list.status).toBe(403);

    const agenda = await getAgenda();
    const session = agenda.sessions[0];
    const patch = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/sessions/${session.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: "harbor-hall" }),
      },
      env,
    );
    expect(patch.status).toBe(403);
  });
});
