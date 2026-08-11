import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { CourseCheckPlan } from "../../shared/course-check";
import type {
  OrganizerPrincipal,
  OrganizerProposal,
  SpeakerPortalSession,
} from "../../shared/events";
import { createApp } from "../../worker/app";
import { signPortalToken } from "../../worker/signed-links";

const eventId = "pacific-open-data-summit-2026";
const signingSecret = "ticket-05-portal-signing-secret";

const adminPrincipal = {
  id: "t05-admin",
  displayName: "Portal Admin",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const adminApp = createApp({
  resolvePrincipal: async () => adminPrincipal,
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

async function signedPortalUrl(input: {
  speakerId: string;
  tokenId: string;
  signedToken?: string | null;
  exp?: number;
}): Promise<string> {
  const token =
    input.signedToken ??
    (await signPortalToken(signingSecret, {
      v: 1,
      kind: "portal",
      eventId,
      speakerId: input.speakerId,
      tokenId: input.tokenId,
      exp: input.exp ?? Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    }));
  return `https://chartstead.test/api/events/${eventId}/portal?token=${encodeURIComponent(token)}`;
}

async function openPortal(url: string) {
  return adminApp.request(url, undefined, env);
}

describe("Ticket 05 speaker portal", () => {
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

  it("lets an accepted speaker open a signed portal with proposal, session, profile, and tasks", async () => {
    const proposalId = "SUB-PODS0030";
    const before = await getProposal(proposalId);
    await acceptProposal(proposalId, `portal-primary-${proposalId}`);

    const store = env.EVENT_STORE.getByName(eventId);
    const cascade = await store.getAcceptanceCascade(proposalId);
    expect(cascade.portalTokens.length).toBe(cascade.speakers.length);
    const grant = cascade.portalTokens[0]!;
    expect(grant.signedToken).toBeTruthy();
    const speaker = cascade.speakers.find((row) => row.id === grant.speakerId)!;

    const response = await openPortal(
      await signedPortalUrl({
        speakerId: grant.speakerId,
        tokenId: grant.tokenId,
        signedToken: grant.signedToken,
      }),
    );
    expect(response.status).toBe(200);
    const session = await response.json<SpeakerPortalSession>();

    expect(session.eventId).toBe(eventId);
    expect(session.eventName.length).toBeGreaterThan(0);
    expect(session.acceptanceState).toBe("accepted");
    expect(session.proposal).toMatchObject({
      id: proposalId,
      title: before.title,
      programOutcome: "accepted",
    });
    expect(session.profile).toMatchObject({
      id: speaker.id,
      name: speaker.name,
      email: speaker.email,
      biography: speaker.biography,
    });
    expect(session.participation).toMatchObject({
      speakerId: speaker.id,
      role: "primary",
    });
    expect(session.participation.titleAtEvent).toBeTruthy();
    expect(session.session).toMatchObject({
      title: before.title,
      roomId: null,
      startsAt: null,
    });
    expect(session.tasks.length).toBeGreaterThanOrEqual(3);
    expect(session.tasks.every((task) => task.speakerId === speaker.id)).toBe(true);
    expect(session.tasks.some((task) => task.dueAt)).toBe(true);
    expect(session.nextDeadline).toBeTruthy();

    const leaked = JSON.stringify(session);
    expect(leaked).not.toMatch(/committeeNote|privateNote|digest|findings|course_check|approval/i);
    expect(session).not.toHaveProperty("committeeNote");
    expect(session).not.toHaveProperty("privateNote");
    expect(session).not.toHaveProperty("courseCheck");
  });

  it("gives co-speakers distinct portal access scoped to their participation and tasks", async () => {
    const proposalId = "SUB-PODS0031";
    const store = env.EVENT_STORE.getByName(eventId);
    await store.setProposalCoSpeakersForTest(proposalId, [
      {
        name: "Portal Co Speaker",
        email: "portal-co-31@example.test",
        biography: "Co-speaker bio for portal isolation.",
      },
    ]);
    await acceptProposal(proposalId, `portal-co-${proposalId}`);

    const cascade = await store.getAcceptanceCascade(proposalId);
    expect(cascade.speakers.length).toBeGreaterThanOrEqual(2);
    expect(cascade.portalTokens.length).toBe(cascade.speakers.length);

    const primary = cascade.participations.find((row) => row.role === "primary")!;
    const co = cascade.participations.find((row) => row.role === "co")!;
    const primaryGrant = cascade.portalTokens.find(
      (row) => row.speakerId === primary.speakerId,
    )!;
    const coGrant = cascade.portalTokens.find((row) => row.speakerId === co.speakerId)!;

    expect(primaryGrant.signedToken).toBeTruthy();
    expect(coGrant.signedToken).toBeTruthy();
    expect(primaryGrant.signedToken).not.toBe(coGrant.signedToken);

    const primarySession = await (
      await openPortal(
        await signedPortalUrl({
          speakerId: primaryGrant.speakerId,
          tokenId: primaryGrant.tokenId,
          signedToken: primaryGrant.signedToken,
        }),
      )
    ).json<SpeakerPortalSession>();
    const coSession = await (
      await openPortal(
        await signedPortalUrl({
          speakerId: coGrant.speakerId,
          tokenId: coGrant.tokenId,
          signedToken: coGrant.signedToken,
        }),
      )
    ).json<SpeakerPortalSession>();

    expect(primarySession.participation.role).toBe("primary");
    expect(coSession.participation.role).toBe("co");
    expect(primarySession.profile.id).toBe(primary.speakerId);
    expect(coSession.profile.id).toBe(co.speakerId);
    expect(primarySession.profile.id).not.toBe(coSession.profile.id);
    expect(primarySession.tasks.every((task) => task.speakerId === primary.speakerId)).toBe(
      true,
    );
    expect(coSession.tasks.every((task) => task.speakerId === co.speakerId)).toBe(true);
    expect(primarySession.tasks.some((task) => task.speakerId === co.speakerId)).toBe(false);
    expect(coSession.tasks.some((task) => task.speakerId === primary.speakerId)).toBe(false);
    expect(primarySession.session?.id).toBe(coSession.session?.id);
    expect(coSession.profile.email).toBe("portal-co-31@example.test");
    expect(primarySession.profile.email).not.toBe(coSession.profile.email);
  });

  it("rejects invalid, expired, and revoked portal links without leaking data", async () => {
    const proposalId = "SUB-PODS0032";
    await acceptProposal(proposalId, `portal-auth-${proposalId}`);
    const store = env.EVENT_STORE.getByName(eventId);
    const cascade = await store.getAcceptanceCascade(proposalId);
    const grant = cascade.portalTokens[0]!;

    const invalid = await openPortal(
      `https://chartstead.test/api/events/${eventId}/portal?token=not-a-token`,
    );
    expect(invalid.status).toBe(401);
    await expect(invalid.json()).resolves.toEqual({
      error: "This portal link is invalid or has expired.",
    });

    const malformed = await openPortal(
      `https://chartstead.test/api/events/${eventId}/portal?token=e30.%%`,
    );
    expect(malformed.status).toBe(401);

    const expired = await openPortal(
      await signedPortalUrl({
        speakerId: grant.speakerId,
        tokenId: grant.tokenId,
        exp: Math.floor(Date.now() / 1000) - 10,
      }),
    );
    expect(expired.status).toBe(401);
    await expect(expired.json()).resolves.toEqual({
      error: "This portal link is invalid or has expired.",
    });

    await store.revokePortalToken(grant.tokenId);
    const revoked = await openPortal(
      await signedPortalUrl({
        speakerId: grant.speakerId,
        tokenId: grant.tokenId,
      }),
    );
    expect(revoked.status).toBe(401);
    const revokedBody = await revoked.json<{ error: string }>();
    expect(revokedBody).toEqual({
      error: "This portal link is invalid or has expired.",
    });
    expect(JSON.stringify(revokedBody)).not.toMatch(/SUB-PODS0032|committee|biography/i);
  });

  it("reflects cascade truth updates without Course Check evidence after compensation-like changes", async () => {
    const proposalId = "SUB-PODS0033";
    await acceptProposal(proposalId, `portal-comp-${proposalId}`);
    const store = env.EVENT_STORE.getByName(eventId);
    const cascade = await store.getAcceptanceCascade(proposalId);
    const grant = cascade.portalTokens[0]!;
    expect(grant.signedToken).toBeTruthy();
    const url = await signedPortalUrl({
      speakerId: grant.speakerId,
      tokenId: grant.tokenId,
      signedToken: grant.signedToken,
    });

    const before = await (await openPortal(url)).json<SpeakerPortalSession>();
    expect(before.session?.title).toBeTruthy();

    const updatedTitle = "Revised session title after cascade";
    await store.updateSessionForTest(cascade.sessions[0]!.id, {
      title: updatedTitle,
      roomId: "ballroom-a",
      startsAt: "2026-09-12T16:00:00.000Z",
      endsAt: "2026-09-12T16:45:00.000Z",
    });
    await store.updateSpeakerProfileForTest(grant.speakerId, {
      biography: "Updated current biography after cascade.",
    });
    await store.updateParticipationSnapshotForTest(before.participation.id, {
      titleAtEvent: "Staff Engineer at Event Time",
      organizationAtEvent: "Historic Org Snapshot",
    });

    const after = await (await openPortal(url)).json<SpeakerPortalSession>();
    expect(after.session).toMatchObject({
      title: updatedTitle,
      roomId: "ballroom-a",
      startsAt: "2026-09-12T16:00:00.000Z",
    });
    expect(after.profile.biography).toBe("Updated current biography after cascade.");
    expect(after.participation.titleAtEvent).toBe("Staff Engineer at Event Time");
    expect(after.participation.organizationAtEvent).toBe("Historic Org Snapshot");
    expect(after.profile.biography).not.toBe(after.participation.titleAtEvent);

    const leaked = JSON.stringify(after);
    expect(leaked).not.toMatch(/digest|findings|courseCheck|committeeNote|privateNote/i);

    // Compensation removes durable cascade access; portal fails closed.
    await store.compensateAcceptanceForTest(proposalId);
    const compensated = await openPortal(url);
    expect(compensated.status).toBe(401);
  });
});
