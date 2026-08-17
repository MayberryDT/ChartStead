import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type {
  OrganizerActivityByActorResponse,
  OrganizerPrincipal,
} from "../../shared/events";
import { createApp } from "../../worker/app";

const eventId = "pacific-open-data-summit-2026";
const proposalId = "SUB-PODS0001";

const adminPrincipal = {
  id: "cc24-admin",
  displayName: "CC24 Administrator",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const reviewerPrincipal = {
  id: "cc24-reviewer",
  displayName: "CC24 Platform Reviewer",
  role: "reviewer",
  eventIds: [eventId],
  trackIdsByEvent: { [eventId]: ["platform"] },
} as unknown as OrganizerPrincipal;

const adminApp = createApp({
  resolvePrincipal: async () => adminPrincipal,
  signingSecret: "cc24-test-signing-secret",
});

const reviewerApp = createApp({
  resolvePrincipal: async () => reviewerPrincipal,
  signingSecret: "cc24-test-signing-secret",
});

const unauthorizedApp = createApp({
  resolvePrincipal: async () => null,
  signingSecret: "cc24-test-signing-secret",
});

async function softLean(
  app: typeof adminApp,
  actor: OrganizerPrincipal,
  status: "approve" | "maybe" | "deny",
) {
  const detail = await app.request(
    `https://chartstead.test/api/events/${eventId}/organizer/proposals/${proposalId}`,
    undefined,
    env,
  );
  expect(detail.status).toBe(200);
  const detailBody = await detail.json<{
    proposal: { title: string; reviewVersion: number };
  }>();

  const response = await app.request(
    `https://chartstead.test/api/events/${eventId}/organizer/proposals/${proposalId}/review`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status,
        expectedVersion: detailBody.proposal.reviewVersion,
      }),
    },
    env,
  );
  expect(response.status).toBe(200);
  const body = await response.json<{
    proposal: { title: string; status: string; reviewVersion: number };
    auditEvents: Array<{ type: string; actorId: string; toStatus: string | null }>;
  }>();
  expect(body.auditEvents[0]).toMatchObject({
    type: "proposal.review.changed",
    actorId: actor.id,
    toStatus: status,
  });
  return { proposalTitle: detailBody.proposal.title, body };
}

describe("Course Check 24 — organizer activity by actor", () => {
  beforeAll(async () => {
    const now = Date.now();
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
      env.AUTH_DB.prepare(
        `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email`,
      ).bind(
        adminPrincipal.id,
        adminPrincipal.displayName,
        "cc24-admin@example.test",
        now,
        now,
      ),
      env.AUTH_DB.prepare(
        `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email`,
      ).bind(
        reviewerPrincipal.id,
        reviewerPrincipal.displayName,
        "cc24-reviewer@example.test",
        now,
        now,
      ),
      env.AUTH_DB.prepare(
        `INSERT INTO event_memberships (event_id, user_id, role)
         VALUES (?, ?, 'admin')
         ON CONFLICT(event_id, user_id) DO UPDATE SET role = 'admin'`,
      ).bind(eventId, adminPrincipal.id),
      env.AUTH_DB.prepare(
        `INSERT INTO event_memberships (event_id, user_id, role)
         VALUES (?, ?, 'reviewer')
         ON CONFLICT(event_id, user_id) DO UPDATE SET role = 'reviewer'`,
      ).bind(eventId, reviewerPrincipal.id),
      env.AUTH_DB.prepare(
        `INSERT INTO reviewer_track_assignments (event_id, user_id, track_id)
         VALUES (?, ?, 'platform')
         ON CONFLICT(event_id, user_id, track_id) DO NOTHING`,
      ).bind(eventId, reviewerPrincipal.id),
    ]);

    const response = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}`,
      undefined,
      env,
    );
    expect(response.status).toBe(200);
  });

  it("lets admins list actors and load an actor's proposal audit entries with titles", async () => {
    const { proposalTitle } = await softLean(adminApp, adminPrincipal, "maybe");

    const list = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/activity`,
      undefined,
      env,
    );
    expect(list.status).toBe(200);
    const listBody = await list.json<OrganizerActivityByActorResponse>();
    expect(listBody.actorId).toBeNull();
    expect(listBody.entries).toEqual([]);
    expect(listBody.actors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: adminPrincipal.id,
          name: adminPrincipal.displayName,
          role: "admin",
        }),
        expect.objectContaining({
          id: reviewerPrincipal.id,
          name: reviewerPrincipal.displayName,
          role: "reviewer",
        }),
      ]),
    );

    const filtered = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/activity?actorId=${adminPrincipal.id}`,
      undefined,
      env,
    );
    expect(filtered.status).toBe(200);
    const filteredBody = await filtered.json<OrganizerActivityByActorResponse>();
    expect(filteredBody.actorId).toBe(adminPrincipal.id);
    expect(filteredBody.actor).toMatchObject({
      id: adminPrincipal.id,
      name: adminPrincipal.displayName,
      role: "admin",
    });
    expect(filteredBody.entries.length).toBeGreaterThan(0);
    expect(filteredBody.entries.every((entry) => entry.actorId === adminPrincipal.id)).toBe(
      true,
    );
    expect(filteredBody.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          proposalId,
          proposalTitle,
          type: "proposal.review.changed",
          actorId: adminPrincipal.id,
          toStatus: "maybe",
        }),
      ]),
    );
  });

  it("forbids reviewers from requesting another actor's activity", async () => {
    const response = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/activity?actorId=${adminPrincipal.id}`,
      undefined,
      env,
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("lets reviewers load only their own activity after a soft lean", async () => {
    const { proposalTitle } = await softLean(reviewerApp, reviewerPrincipal, "approve");

    const own = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/activity?actorId=${reviewerPrincipal.id}`,
      undefined,
      env,
    );
    expect(own.status).toBe(200);
    const body = await own.json<OrganizerActivityByActorResponse>();
    expect(body.actors).toEqual([
      expect.objectContaining({
        id: reviewerPrincipal.id,
        role: "reviewer",
      }),
    ]);
    expect(body.actor).toMatchObject({
      id: reviewerPrincipal.id,
      role: "reviewer",
    });
    expect(body.entries.length).toBeGreaterThan(0);
    expect(body.entries.every((entry) => entry.actorId === reviewerPrincipal.id)).toBe(
      true,
    );
    expect(body.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          proposalId,
          proposalTitle,
          type: "proposal.review.changed",
          actorId: reviewerPrincipal.id,
          toStatus: "approve",
        }),
      ]),
    );
  });

  it("rejects unauthorized callers with 401", async () => {
    const anonymous = await unauthorizedApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/activity`,
      undefined,
      env,
    );
    expect(anonymous.status).toBe(401);
    await expect(anonymous.json()).resolves.toEqual({ error: "Unauthorized" });

    const outsiderApp = createApp({
      resolvePrincipal: async () =>
        ({
          id: "cc24-outsider",
          displayName: "Outsider",
          role: "reviewer",
          eventIds: ["some-other-event"],
        }) satisfies OrganizerPrincipal,
      signingSecret: "cc24-test-signing-secret",
    });
    const outsider = await outsiderApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/activity`,
      undefined,
      env,
    );
    expect(outsider.status).toBe(401);
    await expect(outsider.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("unions onboarding and evaluation activity for an actor", async () => {
    const store = env.EVENT_STORE.getByName(eventId);
    await store.appendOnboardingHistory({
      speakerId: "sp-activity-feed",
      taskId: null,
      assetId: null,
      type: "profile_updated",
      summary: "Updated speaker profile for activity feed",
      actorId: adminPrincipal.id,
      actorName: adminPrincipal.displayName,
    });
    await store.recordReviewProgressAudit({
      roundId: null,
      action: "evaluation_plan.saved",
      actorId: adminPrincipal.id,
      actorName: adminPrincipal.displayName,
      detail: { source: "cc24-activity-test" },
    });

    const response = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/activity?actorId=${adminPrincipal.id}&limit=100`,
      undefined,
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<OrganizerActivityByActorResponse>();
    expect(body.hasMore).toBe(false);
    expect(body.limit).toBe(100);
    expect(body.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "onboarding_history",
          domain: "onboarding",
          label: "Profile updated",
          actorId: adminPrincipal.id,
        }),
        expect.objectContaining({
          source: "evaluation_plan_audit_events",
          domain: "evaluation",
          label: "Saved evaluation plan",
          actorId: adminPrincipal.id,
        }),
      ]),
    );
  });
});
