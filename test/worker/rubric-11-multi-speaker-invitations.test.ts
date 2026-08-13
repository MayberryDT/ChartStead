import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { CommunicationPlanBody, CourseCheckPlan } from "../../shared/course-check";
import type { OnboardingTaskBatchResult, OrganizerPrincipal, SpeakerPortalSession } from "../../shared/events";
import { createApp } from "../../worker/app";

const eventId = "pacific-open-data-summit-2026";
const otherEventId = "ai-engineer-worlds-fair-2026";
const principal = {
  id: "rubric-11-admin",
  displayName: "Rubric 11 Admin",
  role: "admin",
  eventIds: [eventId, otherEventId],
} satisfies OrganizerPrincipal;
const app = createApp({
  resolvePrincipal: async () => principal,
  signingSecret: "rubric-11-signed-portal-secret",
});

async function accept(proposalId: string, key: string) {
  const created = await app.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/decisions`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify({ proposalId, outcome: "accepted", idempotencyKey: key }),
    },
    env,
  );
  expect(created.status).toBe(201);
  const plan = await created.json<CourseCheckPlan>();
  const applied = await app.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/${plan.id}/apply`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": `${key}-apply` },
      body: JSON.stringify({
        planVersion: plan.version,
        digest: plan.digest,
        stageId: "apply-decision",
        idempotencyKey: `${key}-apply`,
      }),
    },
    env,
  );
  expect(applied.status).toBe(200);
}

describe("Rubric 11 multi-speaker tasks and portal invitations", () => {
  beforeAll(async () => {
    for (const id of [eventId, otherEventId]) {
      const loaded = await app.request(`https://chartstead.test/api/events/${id}`, undefined, env);
      expect(loaded.status).toBe(200);
    }
    await accept("SUB-PODS0051", "rubric-11-a");
    await accept("SUB-PODS0052", "rubric-11-b");
  });

  it("assigns independent tasks atomically and replays the batch idempotently", async () => {
    const store = env.EVENT_STORE.getByName(eventId);
    const firstCascade = await store.getAcceptanceCascade("SUB-PODS0051");
    const secondCascade = await store.getAcceptanceCascade("SUB-PODS0052");
    const speakerIds = [firstCascade.speakers[0]!.id, secondCascade.speakers[0]!.id];
    const input = {
      speakerIds,
      title: "Confirm travel plans",
      instructions: "Confirm arrival and departure dates.",
      kind: "travel",
      completionRequirement: "manual",
      dueAt: "2026-09-01T12:00:00.000Z",
      idempotencyKey: "rubric-11-travel-batch",
    };
    const request = () => app.request(
      `https://chartstead.test/api/events/${eventId}/onboarding/tasks`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": input.idempotencyKey },
        body: JSON.stringify(input),
      },
      env,
    );
    const created = await request();
    expect(created.status).toBe(201);
    const batch = await created.json<OnboardingTaskBatchResult>();
    expect(batch.tasks).toHaveLength(2);
    expect(new Set(batch.tasks.map((task) => task.id)).size).toBe(2);
    expect(new Set(batch.tasks.map((task) => task.speakerId))).toEqual(new Set(speakerIds));

    const replay = await request();
    expect(replay.status).toBe(200);
    expect((await replay.json<OnboardingTaskBatchResult>()).tasks.map((task) => task.id)).toEqual(
      batch.tasks.map((task) => task.id),
    );

    const firstGrant = firstCascade.portalTokens[0]!;
    const complete = await app.request(
      `https://chartstead.test/api/events/${eventId}/portal/tasks/${batch.tasks[0]!.id}/complete?token=${encodeURIComponent(firstGrant.signedToken!)}`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      env,
    );
    expect(complete.status).toBe(200);
    const firstSession = await complete.json<SpeakerPortalSession>();
    expect(firstSession.tasks.find((task) => task.id === batch.tasks[0]!.id)?.status).toBe("completed");
    const secondGrant = secondCascade.portalTokens[0]!;
    const secondSession = await (
      await app.request(
        `https://chartstead.test/api/events/${eventId}/portal?token=${encodeURIComponent(secondGrant.signedToken!)}`,
        undefined,
        env,
      )
    ).json<SpeakerPortalSession>();
    expect(secondSession.tasks.find((task) => task.id === batch.tasks[1]!.id)?.status).toBe("open");
  });

  it("prepares recipient-specific scoped portal invitations and rejects cross-event speakers", async () => {
    const store = env.EVENT_STORE.getByName(eventId);
    const first = await store.getAcceptanceCascade("SUB-PODS0051");
    const second = await store.getAcceptanceCascade("SUB-PODS0052");
    const speakerIds = [first.speakers[0]!.id, second.speakers[0]!.id];
    const created = await app.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/communications`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "rubric-11-invitations" },
        body: JSON.stringify({
          speakerIds,
          portalInvitation: true,
          subject: "Your private speaker portal",
          bodyText: "Hello {{speaker_name}}, open {{portal_url}} for {{event_name}}.",
          idempotencyKey: "rubric-11-invitations",
        }),
      },
      env,
    );
    expect(created.status).toBe(201);
    const plan = await created.json<CourseCheckPlan>();
    const body = plan.body as CommunicationPlanBody;
    expect(body.portalInvitation).toBe(true);
    const recipients = body.recipientGroups.flatMap((group) => group.recipients);
    expect(recipients).toHaveLength(2);
    expect(new Set(recipients.map((recipient) => recipient.portalUrl)).size).toBe(2);
    for (const recipient of recipients) {
      expect(recipient.portalUrl).toContain(`/e/${eventId}/portal/`);
      expect(recipient.portalTokenId).toBeTruthy();
    }

    const drafts = await app.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/${plan.id}/create-drafts`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "rubric-11-drafts" },
        body: JSON.stringify({
          planVersion: plan.version,
          digest: plan.digest,
          stageId: "create-drafts",
          idempotencyKey: "rubric-11-drafts",
        }),
      },
      env,
    );
    expect(drafts.status).toBe(201);
    const frozen = (await drafts.json<CourseCheckPlan>()).body as CommunicationPlanBody;
    expect(frozen.drafts).toHaveLength(2);
    expect(frozen.drafts[0]!.bodyText).toContain(frozen.drafts[0]!.recipientName);
    expect(frozen.drafts[0]!.bodyText).not.toBe(frozen.drafts[1]!.bodyText);
    for (const recipient of recipients) {
      const draft = frozen.drafts.find((row) => row.recipientName === recipient.name);
      expect(draft?.bodyText).toContain(recipient.portalUrl ?? "");
      expect(draft?.bodyText).not.toContain("{{portal_url}}");
    }

    const isolated = await app.request(
      `https://chartstead.test/api/events/${otherEventId}/onboarding/tasks`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "rubric-11-cross-event" },
        body: JSON.stringify({
          speakerIds: [speakerIds[0]],
          title: "Wrong event",
          instructions: "Must not be created.",
          kind: "custom",
          completionRequirement: "manual",
          idempotencyKey: "rubric-11-cross-event",
        }),
      },
      env,
    );
    expect(isolated.status).toBe(400);
  });
});
