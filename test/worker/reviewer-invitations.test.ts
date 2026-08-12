import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { OrganizerPrincipal } from "../../shared/events";
import { createApp } from "../../worker/app";
import { loadPrincipalForUser } from "../../worker/auth";

const eventId = "pacific-open-data-summit-2026";

const admin = {
  id: "ticket-22-admin",
  displayName: "Invitation Administrator",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const app = createApp({
  resolvePrincipal: async () => admin,
  emailSender: null,
  signingSecret: "ticket-22-invitation-signing-secret",
});

async function createInvitation(input?: {
  sender?: { send(message: { to: string; text: string }): Promise<void> } | null;
}) {
  const email = `new-reviewer-${crypto.randomUUID()}@example.test`;
  const invitationApp = createApp({
    resolvePrincipal: async () => admin,
    emailSender: input?.sender ?? null,
    signingSecret: "ticket-22-invitation-signing-secret",
  });
  const response = await invitationApp.request(
    `https://chartstead.test/api/events/${eventId}/reviewers`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, trackIds: ["platform", "community"] }),
    },
    env,
  );
  const body = await response.json<{
    invitation: { id: string; status: string; deliveryState: string };
  }>();
  const outbox = (await env.EVENT_STORE.getByName(eventId).listOutboxMessages())
    .find((message) => message.toEmail === email);
  if (!outbox) throw new Error("Invitation outbox message not found.");
  const bodies = await env.EVENT_STORE.getByName(eventId).getOutboxBodies(outbox.id);
  const token = bodies?.text.match(/reviewer-invitations\/([^\s]+)/)?.[1];
  if (!token) throw new Error("Invitation token not found in email.");
  return { email, response, body, outbox, token };
}

describe("reviewer invitations", () => {
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
      env.AUTH_DB.prepare(`CREATE TABLE IF NOT EXISTS "reviewer_invitations" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "event_id" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "token_hash" TEXT NOT NULL UNIQUE,
        "track_ids_json" TEXT NOT NULL,
        "status" TEXT NOT NULL CHECK ("status" IN ('pending', 'accepted', 'revoked')),
        "outbox_id" TEXT NOT NULL,
        "expires_at" TEXT NOT NULL,
        "accepted_by_user_id" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
        "accepted_at" TEXT,
        "revoked_at" TEXT,
        "created_at" TEXT NOT NULL,
        "updated_at" TEXT NOT NULL
      )`),
    ]);
    const seeded = await app.request(
      `https://chartstead.test/api/events/${eventId}`,
      undefined,
      env,
    );
    expect(seeded.status).toBe(200);
  });

  it("queues an auditable track-scoped invitation before the reviewer has an account", async () => {
    const { email, response, body } = await createInvitation();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      invitation: {
        email,
        trackIds: ["platform", "community"],
        status: "pending",
        deliveryState: "queued",
      },
    });

    const outbox = await env.EVENT_STORE.getByName(eventId).listOutboxMessages();
    expect(outbox).toContainEqual(
      expect.objectContaining({
        kind: "reviewer_invitation",
        toEmail: email,
        status: "queued",
      }),
    );
    expect(
      await env.AUTH_DB.prepare(
        `SELECT role FROM event_memberships WHERE event_id = ?`,
      )
        .bind(eventId)
        .all(),
    ).toMatchObject({ results: [] });
  });

  it("binds the valid invitation to the intended authenticated identity idempotently", async () => {
    const { email, token } = await createInvitation();
    const reviewerId = `invited-${crypto.randomUUID()}`;
    const now = Date.now();
    await env.AUTH_DB.prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?, 'Invited Reviewer', ?, 1, ?, ?)`,
    )
      .bind(reviewerId, email, now, now)
      .run();

    const preview = await app.request(
      `https://chartstead.test/api/reviewer-invitations/${token}`,
      undefined,
      env,
    );
    expect(preview.status).toBe(200);
    await expect(preview.json()).resolves.toMatchObject({
      invitation: {
        eventId,
        eventName: "Pacific Open Data Summit 2026",
        status: "pending",
        tracks: [
          { id: "platform", name: "Platform" },
          { id: "community", name: "Community" },
        ],
      },
    });

    const mismatchedApp = createApp({
      resolvePrincipal: async () => null,
      resolveAuthenticatedUser: async () => ({
        id: "wrong-user",
        name: "Wrong User",
        email: "wrong@example.test",
      }),
    });
    const mismatched = await mismatchedApp.request(
      `https://chartstead.test/api/reviewer-invitations/${token}/accept`,
      { method: "POST" },
      env,
    );
    expect(mismatched.status).toBe(403);
    expect(JSON.stringify(await mismatched.json())).not.toMatch(/proposal|committee/i);

    const invitedApp = createApp({
      resolvePrincipal: async () => null,
      resolveAuthenticatedUser: async () => ({
        id: reviewerId,
        name: "Invited Reviewer",
        email,
      }),
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const accepted = await invitedApp.request(
        `https://chartstead.test/api/reviewer-invitations/${token}/accept`,
        { method: "POST" },
        env,
      );
      expect(accepted.status).toBe(200);
      await expect(accepted.json()).resolves.toEqual({
        accepted: true,
        queuePath: `/e/${eventId}/submissions`,
        trackIds: ["platform", "community"],
      });
    }

    const assignments = await env.AUTH_DB.prepare(
      `SELECT track_id FROM reviewer_track_assignments
       WHERE event_id = ? AND user_id = ? ORDER BY track_id`,
    )
      .bind(eventId, reviewerId)
      .all<{ track_id: string }>();
    expect(assignments.results.map((row) => row.track_id)).toEqual([
      "community",
      "platform",
    ]);
    await expect(
      loadPrincipalForUser(env.AUTH_DB, { id: reviewerId, name: "Invited Reviewer" }),
    ).resolves.toMatchObject({
      role: "reviewer",
      eventIds: [eventId],
      trackIdsByEvent: { [eventId]: ["community", "platform"] },
    });

    const reviewerPrincipal = await loadPrincipalForUser(env.AUTH_DB, {
      id: reviewerId,
      name: "Invited Reviewer",
    });
    const reviewerApp = createApp({ resolvePrincipal: async () => reviewerPrincipal });
    const queue = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      undefined,
      env,
    );
    const queueBody = await queue.json<{ proposals: Array<{ trackId: string }> }>();
    expect(new Set(queueBody.proposals.map((proposal) => proposal.trackId))).toEqual(
      new Set(["platform", "community"]),
    );
    const adminOnly = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/reviewers`,
      undefined,
      env,
    );
    expect(adminOnly.status).toBe(403);
  });

  it("fails revoked and expired invitations safely", async () => {
    const revoked = await createInvitation();
    const revokedResponse = await app.request(
      `https://chartstead.test/api/events/${eventId}/reviewer-invitations/${revoked.body.invitation.id}`,
      { method: "DELETE" },
      env,
    );
    expect(revokedResponse.status).toBe(200);
    const dueAfterRevoke = await env.EVENT_STORE.getByName(eventId).listDueOutboxMessageIds(
      new Date("2100-01-01T00:00:00.000Z").toISOString(),
      100,
    );
    expect(dueAfterRevoke).not.toContain(revoked.outbox.id);

    const identity = {
      id: `late-${crypto.randomUUID()}`,
      name: "Late Reviewer",
      email: revoked.email,
    };
    const expiredApp = createApp({
      resolvePrincipal: async () => null,
      resolveAuthenticatedUser: async () => identity,
    });
    const revokedAccept = await expiredApp.request(
      `https://chartstead.test/api/reviewer-invitations/${revoked.token}/accept`,
      { method: "POST" },
      env,
    );
    expect(revokedAccept.status).toBe(410);
    expect(JSON.stringify(await revokedAccept.json())).not.toMatch(/proposal|committee/i);

    const expired = await createInvitation();
    await env.AUTH_DB.prepare(
      `UPDATE reviewer_invitations SET expires_at = '2000-01-01T00:00:00.000Z'
       WHERE id = ?`,
    )
      .bind(expired.body.invitation.id)
      .run();
    const expiredIdentityApp = createApp({
      resolvePrincipal: async () => null,
      resolveAuthenticatedUser: async () => ({ ...identity, email: expired.email }),
    });
    const expiredAccept = await expiredIdentityApp.request(
      `https://chartstead.test/api/reviewer-invitations/${expired.token}/accept`,
      { method: "POST" },
      env,
    );
    expect(expiredAccept.status).toBe(410);
  });

  it("reports delivery failure truthfully and retries the same outbox message", async () => {
    const failed = await createInvitation({
      sender: { async send() { throw new Error("provider unavailable"); } },
    });
    expect(failed.body.invitation.deliveryState).toBe("retryable");
    const failingRetryApp = createApp({
      resolvePrincipal: async () => admin,
      emailSender: { async send() { throw new Error("still unavailable"); } },
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const retryFailure = await failingRetryApp.request(
        `https://chartstead.test/api/events/${eventId}/reviewer-invitations/${failed.body.invitation.id}/retry`,
        { method: "POST" },
        env,
      );
      expect(retryFailure.status).toBe(200);
      await expect(retryFailure.json()).resolves.toMatchObject({
        invitation: {
          deliveryState: attempt === 4 ? "failed" : "retryable",
        },
      });
    }
    const deliveries: string[] = [];
    const retryApp = createApp({
      resolvePrincipal: async () => admin,
      emailSender: {
        async send(message) {
          deliveries.push(message.to);
        },
      },
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const retried = await retryApp.request(
        `https://chartstead.test/api/events/${eventId}/reviewer-invitations/${failed.body.invitation.id}/retry`,
        { method: "POST" },
        env,
      );
      expect(retried.status).toBe(200);
      await expect(retried.json()).resolves.toMatchObject({
        invitation: { deliveryState: "delivered" },
      });
    }
    expect(deliveries).toEqual([failed.email]);
    const outbox = await env.EVENT_STORE.getByName(eventId).listOutboxMessages();
    expect(outbox.filter((message) => message.toEmail === failed.email)).toHaveLength(1);
  });
});
