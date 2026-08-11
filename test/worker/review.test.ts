import { env, evictDurableObject } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { OrganizerPrincipal } from "../../shared/events";
import { createApp } from "../../worker/app";
import { loadPrincipalForUser } from "../../worker/auth";

const eventId = "pacific-open-data-summit-2026";

const adminPrincipal = {
  id: "ticket-04-admin",
  displayName: "Ticket 04 Administrator",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const reviewerPrincipal = {
  id: "ticket-04-reviewer",
  displayName: "Platform Reviewer",
  role: "reviewer",
  eventIds: [eventId],
  trackIdsByEvent: { [eventId]: ["platform"] },
} as unknown as OrganizerPrincipal;

const adminApp = createApp({
  resolvePrincipal: async () => adminPrincipal,
  signingSecret: "ticket-04-test-signing-secret",
});

const reviewerApp = createApp({
  resolvePrincipal: async () => reviewerPrincipal,
  signingSecret: "ticket-04-test-signing-secret",
});

describe("shared track review queue", () => {
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
    const response = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}`,
      undefined,
      env,
    );
    expect(response.status).toBe(200);
  });

  it("limits reviewer queues and stable detail links to assigned tracks", async () => {
    const queue = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      undefined,
      env,
    );
    expect(queue.status).toBe(200);
    const queueBody = await queue.json<{
      proposals: Array<{ id: string; trackId: string }>;
    }>();
    expect(queueBody.proposals).toHaveLength(14);
    expect(new Set(queueBody.proposals.map((proposal) => proposal.trackId))).toEqual(
      new Set(["platform"]),
    );

    const assignedDetail = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/SUB-PODS0001`,
      undefined,
      env,
    );
    expect(assignedDetail.status).toBe(200);
    await expect(assignedDetail.json()).resolves.toMatchObject({
      proposal: { id: "SUB-PODS0001", trackId: "platform" },
    });

    const outsideDetail = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/SUB-PODS0015`,
      undefined,
      env,
    );
    expect(outsideDetail.status).toBe(404);
  });

  it("keeps event-wide visibility and CFP administration with administrators", async () => {
    const queue = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      undefined,
      env,
    );
    const queueBody = await queue.json<{ proposals: Array<{ id: string }> }>();
    expect(queueBody.proposals).toHaveLength(47);

    const reviewerForms = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/forms`,
      undefined,
      env,
    );
    expect(reviewerForms.status).toBe(403);
  });

  it("filters and sorts the authorized queue without widening track access", async () => {
    const response = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals?status=unreviewed&track=platform&sort=title-asc&q=practical`,
      undefined,
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      proposals: Array<{
        title: string;
        status: string;
        trackId: string;
      }>;
    }>();
    expect(body.proposals.length).toBeGreaterThan(1);
    expect(body.proposals.every((proposal) => proposal.status === "unreviewed")).toBe(
      true,
    );
    expect(body.proposals.every((proposal) => proposal.trackId === "platform")).toBe(
      true,
    );
    expect(body.proposals.map((proposal) => proposal.title)).toEqual(
      [...body.proposals.map((proposal) => proposal.title)].sort((left, right) =>
        left.localeCompare(right),
      ),
    );

    const outsideTrack = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals?track=community`,
      undefined,
      env,
    );
    expect(outsideTrack.status).toBe(403);
  });

  it("persists reversible decisions and notes with audit history but no email", async () => {
    const proposalId = "SUB-PODS0001";
    const store = env.EVENT_STORE.getByName(eventId);
    const beforeOutbox = await store.listOutboxMessages(proposalId);
    const beforeEvent = await store.getEvent();

    let reviewVersion = 0;
    for (const status of ["approve", "maybe", "deny", "unreviewed"] as const) {
      const response = await reviewerApp.request(
        `https://chartstead.test/api/events/${eventId}/organizer/proposals/${proposalId}/review`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            status,
            committeeNote:
              status === "approve"
                ? "Strong practical evidence. Compare against the second platform slot."
                : undefined,
            expectedVersion: reviewVersion,
          }),
        },
        env,
      );
      expect(response.status).toBe(200);
      const body = await response.json<{
        proposal: { status: string; committeeNote: string; reviewVersion: number };
        auditEvents: Array<{ type: string; toStatus: string | null }>;
      }>();
      expect(body.proposal.status).toBe(status);
      expect(body.proposal.reviewVersion).toBe(reviewVersion + 1);
      expect(body.auditEvents[0]).toMatchObject({
        type: "proposal.review.changed",
        toStatus: status,
      });
      reviewVersion = body.proposal.reviewVersion;
    }

    expect(await store.listOutboxMessages(proposalId)).toEqual(beforeOutbox);
    expect((await store.getEvent())?.unreviewedCount).toBe(beforeEvent?.unreviewedCount);

    await evictDurableObject(store);
    const afterEviction = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/${proposalId}`,
      undefined,
      env,
    );
    await expect(afterEviction.json()).resolves.toMatchObject({
      proposal: {
        status: "unreviewed",
        committeeNote:
          "Strong practical evidence. Compare against the second platform slot.",
        reviewVersion: 4,
      },
      auditEvents: [
        expect.objectContaining({ toStatus: "unreviewed" }),
        expect.objectContaining({ toStatus: "deny" }),
        expect.objectContaining({ toStatus: "maybe" }),
        expect.objectContaining({ toStatus: "approve" }),
      ],
    });
  });

  it("rejects stale review writes and writes outside assigned tracks", async () => {
    const stale = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/SUB-PODS0001/review`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "approve", expectedVersion: 0 }),
      },
      env,
    );
    expect(stale.status).toBe(409);

    const outside = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/SUB-PODS0015/review`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "approve", expectedVersion: 0 }),
      },
      env,
    );
    expect(outside.status).toBe(404);
  });

  it("lets administrators grant one or more valid tracks to an existing user", async () => {
    const reviewerId = `reviewer-${crypto.randomUUID()}`;
    const reviewerEmail = `${reviewerId}@example.test`;
    const now = Date.now();
    await env.AUTH_DB.prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?, ?, ?, 1, ?, ?)`,
    )
      .bind(reviewerId, "Assigned Reviewer", reviewerEmail, now, now)
      .run();

    const grant = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/reviewers`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: reviewerEmail,
          trackIds: ["platform", "community"],
        }),
      },
      env,
    );
    expect(grant.status).toBe(200);
    await expect(grant.json()).resolves.toMatchObject({
      reviewer: {
        id: reviewerId,
        email: reviewerEmail,
        trackIds: ["platform", "community"],
      },
    });

    const assignmentRows = await env.AUTH_DB.prepare(
      `SELECT track_id FROM reviewer_track_assignments
       WHERE event_id = ? AND user_id = ? ORDER BY track_id`,
    )
      .bind(eventId, reviewerId)
      .all<{ track_id: string }>();
    expect(assignmentRows.results.map((row) => row.track_id)).toEqual([
      "community",
      "platform",
    ]);

    const extendGrant = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/reviewers`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: reviewerEmail,
          trackIds: ["program-ops"],
        }),
      },
      env,
    );
    expect(extendGrant.status).toBe(200);
    await expect(extendGrant.json()).resolves.toMatchObject({
      reviewer: {
        trackIds: ["community", "platform", "program-ops"],
      },
    });

    await expect(
      loadPrincipalForUser(env.AUTH_DB, {
        id: reviewerId,
        name: "Assigned Reviewer",
      }),
    ).resolves.toMatchObject({
      id: reviewerId,
      role: "reviewer",
      eventIds: [eventId],
      rolesByEvent: { [eventId]: "reviewer" },
      trackIdsByEvent: {
        [eventId]: ["community", "platform", "program-ops"],
      },
    });
  });

  it("lets administrators remove reviewer access and track assignments", async () => {
    const reviewerId = `reviewer-${crypto.randomUUID()}`;
    const reviewerEmail = `${reviewerId}@example.test`;
    const now = Date.now();
    await env.AUTH_DB.batch([
      env.AUTH_DB.prepare(
        `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES (?, ?, ?, 1, ?, ?)`,
      ).bind(reviewerId, "Removed Reviewer", reviewerEmail, now, now),
      env.AUTH_DB.prepare(
        `INSERT INTO event_memberships (event_id, user_id, role) VALUES (?, ?, 'reviewer')`,
      ).bind(eventId, reviewerId),
      env.AUTH_DB.prepare(
        `INSERT INTO reviewer_track_assignments (event_id, user_id, track_id)
         VALUES (?, ?, 'platform')`,
      ).bind(eventId, reviewerId),
    ]);

    const forbidden = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/reviewers/${reviewerId}`,
      { method: "DELETE" },
      env,
    );
    expect(forbidden.status).toBe(403);

    const response = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/reviewers/${reviewerId}`,
      { method: "DELETE" },
      env,
    );

    expect(response.status).toBe(200);
    const membership = await env.AUTH_DB.prepare(
      `SELECT role FROM event_memberships WHERE event_id = ? AND user_id = ?`,
    )
      .bind(eventId, reviewerId)
      .first();
    const assignments = await env.AUTH_DB.prepare(
      `SELECT track_id FROM reviewer_track_assignments WHERE event_id = ? AND user_id = ?`,
    )
      .bind(eventId, reviewerId)
      .all();
    expect(membership).toBeNull();
    expect(assignments.results).toEqual([]);
  });

  it("lets administrators replace a reviewer's assigned tracks", async () => {
    const reviewerId = `reviewer-${crypto.randomUUID()}`;
    const reviewerEmail = `${reviewerId}@example.test`;
    const now = Date.now();
    await env.AUTH_DB.batch([
      env.AUTH_DB.prepare(
        `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES (?, ?, ?, 1, ?, ?)`,
      ).bind(reviewerId, "Edited Reviewer", reviewerEmail, now, now),
      env.AUTH_DB.prepare(
        `INSERT INTO event_memberships (event_id, user_id, role) VALUES (?, ?, 'reviewer')`,
      ).bind(eventId, reviewerId),
      env.AUTH_DB.prepare(
        `INSERT INTO reviewer_track_assignments (event_id, user_id, track_id)
         VALUES (?, ?, 'platform'), (?, ?, 'community')`,
      ).bind(eventId, reviewerId, eventId, reviewerId),
    ]);

    const forbidden = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/reviewers/${reviewerId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trackIds: ["design-systems"] }),
      },
      env,
    );
    expect(forbidden.status).toBe(403);

    const response = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/reviewers/${reviewerId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trackIds: ["design-systems"] }),
      },
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      reviewer: { id: reviewerId, trackIds: ["design-systems"] },
    });
    const assignments = await env.AUTH_DB.prepare(
      `SELECT track_id FROM reviewer_track_assignments
       WHERE event_id = ? AND user_id = ? ORDER BY track_id`,
    )
      .bind(eventId, reviewerId)
      .all<{ track_id: string }>();
    expect(assignments.results.map((row) => row.track_id)).toEqual([
      "design-systems",
    ]);
  });
});
