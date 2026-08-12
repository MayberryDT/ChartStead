import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { CourseCheckPlan } from "../../shared/course-check";
import type {
  OnboardingBoard,
  OrganizerPrincipal,
  SpeakerPortalSession,
} from "../../shared/events";
import { createApp } from "../../worker/app";

const eventId = "pacific-open-data-summit-2026";
const otherEventId = "ai-engineer-worlds-fair-2026";

const admin = {
  id: "t24-admin",
  displayName: "Speaker Directory Admin",
  role: "admin",
  eventIds: [eventId, otherEventId],
  rolesByEvent: { [eventId]: "admin", [otherEventId]: "admin" },
} satisfies OrganizerPrincipal;

const reviewer = {
  id: "t24-reviewer",
  displayName: "Speaker Directory Reviewer",
  role: "reviewer",
  eventIds: [eventId],
  rolesByEvent: { [eventId]: "reviewer" },
} satisfies OrganizerPrincipal;

const signingSecret = "ticket-24-speaker-directory-signing-secret";
const adminApp = createApp({ resolvePrincipal: async () => admin, signingSecret });
const reviewerApp = createApp({ resolvePrincipal: async () => reviewer });

async function createSpeaker(
  event: string,
  input: Record<string, unknown>,
  app = adminApp,
) {
  return app.request(
    `https://chartstead.test/api/events/${event}/speakers`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
    env,
  );
}

describe("Ticket 24 organizer speaker directory", () => {
  beforeAll(async () => {
    for (const id of [eventId, otherEventId]) {
      const response = await adminApp.request(
        `https://chartstead.test/api/events/${id}`,
        undefined,
        env,
      );
      expect(response.status).toBe(200);
    }
  });

  it("creates an event participation and preserves its title and organization snapshots when the current profile changes", async () => {
    const created = await createSpeaker(eventId, {
      name: "Rae Snapshot",
      email: "rae.snapshot@example.test",
      biography: "Original biography",
      titleSnapshot: "Research Director",
      organizationSnapshot: "Open Harbor Lab",
      role: "invited",
    });
    expect(created.status).toBe(201);
    const body = await created.json<{
      speaker: { speakerId: string; name: string; email: string };
      reused: boolean;
      sessionLinkage: string;
    }>();
    expect(body.reused).toBe(false);
    expect(body.sessionLinkage).toBe("course_check_required");

    const patched = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/speakers/${body.speaker.speakerId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Rae Corrected",
          email: "rae.corrected@example.test",
          biography: "Corrected biography",
        }),
      },
      env,
    );
    expect(patched.status).toBe(200);

    const boardResponse = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/onboarding`,
      undefined,
      env,
    );
    const board = await boardResponse.json<OnboardingBoard>();
    const row = board.speakers.find(
      (speaker) => speaker.speakerId === body.speaker.speakerId,
    );
    expect(row).toMatchObject({
      name: "Rae Corrected",
      email: "rae.corrected@example.test",
      biography: "Corrected biography",
      titleSnapshot: "Research Director",
      organizationSnapshot: "Open Harbor Lab",
      role: "invited",
    });
  });

  it("requires an explicit identity choice for exact email reuse and ambiguous name matches", async () => {
    const first = await createSpeaker(eventId, {
      name: "Deliberate Reuse",
      email: "deliberate.reuse@example.test",
      titleSnapshot: "Principal",
      organizationSnapshot: "First Org",
      role: "invited",
      createNewIdentity: true,
    });
    expect(first.status).toBe(201);
    const firstBody = await first.json<{ speaker: { speakerId: string } }>();

    const unconfirmed = await createSpeaker(eventId, {
      name: "Deliberate Reuse",
      email: "DELIBERATE.REUSE@example.test",
      titleSnapshot: "Principal",
      organizationSnapshot: "Second Org",
      role: "invited",
    });
    expect(unconfirmed.status).toBe(409);
    await expect(unconfirmed.json()).resolves.toMatchObject({
      code: "identity_choice_required",
      matches: [{ speakerId: firstBody.speaker.speakerId, signal: "email" }],
    });

    const reused = await createSpeaker(eventId, {
      name: "Deliberate Reuse",
      email: "deliberate.reuse@example.test",
      titleSnapshot: "Principal",
      organizationSnapshot: "Second Org",
      role: "invited",
      reuseSpeakerId: firstBody.speaker.speakerId,
    });
    expect(reused.status).toBe(200);
    await expect(reused.json()).resolves.toMatchObject({
      reused: true,
      speaker: { speakerId: firstBody.speaker.speakerId },
    });

    await createSpeaker(eventId, {
      name: "Shared Conference Name",
      email: "shared.one@example.test",
      titleSnapshot: "Engineer",
      organizationSnapshot: "One",
      role: "invited",
      createNewIdentity: true,
    });
    await createSpeaker(eventId, {
      name: "Shared Conference Name",
      email: "shared.two@example.test",
      titleSnapshot: "Designer",
      organizationSnapshot: "Two",
      role: "invited",
      createNewIdentity: true,
    });
    const ambiguous = await createSpeaker(eventId, {
      name: "Shared Conference Name",
      email: "shared.three@example.test",
      titleSnapshot: "Organizer",
      organizationSnapshot: "Three",
      role: "invited",
    });
    expect(ambiguous.status).toBe(409);
    const ambiguousBody = await ambiguous.json<{
      code: string;
      matches: Array<{ signal: string }>;
    }>();
    expect(ambiguousBody.code).toBe("identity_choice_required");
    expect(ambiguousBody.matches).toHaveLength(2);
    expect(ambiguousBody.matches.every((match) => match.signal === "name")).toBe(true);
  });

  it("immediately projects organizer profile corrections into an existing portal without rewriting participation history", async () => {
    const proposalId = "SUB-PODS0038";
    const key = "t24-portal-profile";
    const create = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/decisions`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify({ proposalId, outcome: "accepted", idempotencyKey: key }),
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
    const cascade = await env.EVENT_STORE.getByName(eventId).getAcceptanceCascade(proposalId);
    const grant = cascade.portalTokens[0]!;
    expect(grant.signedToken).toBeTruthy();
    const before = (await (
      await adminApp.request(
        `https://chartstead.test/api/events/${eventId}/portal?token=${encodeURIComponent(grant.signedToken!)}`,
        undefined,
        env,
      )
    ).json<SpeakerPortalSession>());

    const patch = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/speakers/${grant.speakerId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Portal Name Corrected",
          email: "portal.corrected@example.test",
          biography: "Corrected by the organizer.",
        }),
      },
      env,
    );
    expect(patch.status).toBe(200);

    const after = await (
      await adminApp.request(
        `https://chartstead.test/api/events/${eventId}/portal?token=${encodeURIComponent(grant.signedToken!)}`,
        undefined,
        env,
      )
    ).json<SpeakerPortalSession>();
    expect(after.profile).toMatchObject({
      name: "Portal Name Corrected",
      email: "portal.corrected@example.test",
      biography: "Corrected by the organizer.",
    });
    expect(after.participation).toEqual(before.participation);
  });

  it("does not silently create a session and leaves guaranteed-speaker linkage on the existing Course Check path", async () => {
    const email = "explicit.session.path@example.test";
    const created = await createSpeaker(eventId, {
      name: "Explicit Session Path",
      email,
      titleSnapshot: "Invited Fellow",
      organizationSnapshot: "Course Check Guild",
      role: "invited",
      createNewIdentity: true,
    });
    expect(created.status).toBe(201);
    const createdBody = await created.json<{ speaker: { speakerId: string } }>();

    const before = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/sessions`,
      undefined,
      env,
    );
    expect(JSON.stringify(await before.json())).not.toContain(createdBody.speaker.speakerId);

    const planResponse = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/guaranteed-speakers`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "t24-explicit-guaranteed-session",
        },
        body: JSON.stringify({
          sourceLabel: "Speaker directory",
          title: "Guaranteed session awaiting review",
          format: "talk",
          trackId: "platform",
          speakers: [{ name: "Explicit Session Path", email, role: "primary" }],
          idempotencyKey: "t24-explicit-guaranteed-session",
        }),
      },
      env,
    );
    expect(planResponse.status).toBe(201);
    const plan = await planResponse.json<CourseCheckPlan>();
    expect(plan.actionType).toBe("guaranteed_speaker");

    const afterPlanOnly = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/sessions`,
      undefined,
      env,
    );
    expect(JSON.stringify(await afterPlanOnly.json())).not.toContain(createdBody.speaker.speakerId);
  });

  it("allows admins only and keeps identical email identities isolated between event stores", async () => {
    const denied = await createSpeaker(
      eventId,
      {
        name: "Denied Speaker",
        email: "denied.speaker@example.test",
        titleSnapshot: "Staff",
        organizationSnapshot: "Denied",
        role: "invited",
      },
      reviewerApp,
    );
    expect(denied.status).toBe(403);

    const email = "cross.event.directory@example.test";
    const inFirst = await createSpeaker(eventId, {
      name: "First Event Identity",
      email,
      titleSnapshot: "First",
      organizationSnapshot: "First Event",
      role: "invited",
      createNewIdentity: true,
    });
    const inSecond = await createSpeaker(otherEventId, {
      name: "Second Event Identity",
      email,
      titleSnapshot: "Second",
      organizationSnapshot: "Second Event",
      role: "invited",
      createNewIdentity: true,
    });
    expect(inFirst.status).toBe(201);
    expect(inSecond.status).toBe(201);
    const firstBody = await inFirst.json<{ speaker: { speakerId: string } }>();
    const secondBody = await inSecond.json<{ speaker: { speakerId: string } }>();
    expect(secondBody.speaker.speakerId).not.toBe(firstBody.speaker.speakerId);

    const deniedEdit = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/speakers/${firstBody.speaker.speakerId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Reviewer must not edit" }),
      },
      env,
    );
    expect(deniedEdit.status).toBe(403);

    const secondBoard = await (
      await adminApp.request(
        `https://chartstead.test/api/events/${otherEventId}/onboarding`,
        undefined,
        env,
      )
    ).json<OnboardingBoard>();
    expect(secondBoard.speakers).toEqual([
      expect.objectContaining({
        speakerId: secondBody.speaker.speakerId,
        name: "Second Event Identity",
      }),
    ]);
  });
});
