import { env, evictDurableObject } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { OrganizerPrincipal } from "../../shared/events";
import { createApp } from "../../worker/app";

const eventId = "pacific-open-data-summit-2026";
const admin = {
  id: "review-progress-admin",
  displayName: "Review Progress Admin",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

function currentRound(name: string, reviewerPool: string[], overrides: Record<string, unknown> = {}) {
  const date = new Date().toISOString().slice(0, 10);
  return {
    name,
    state: "open",
    startsOn: date,
    endsOn: date,
    scorecardRef: `${name.toLowerCase().replaceAll(" ", "-")}-scorecard`,
    anonymization: "none",
    reviewerPool,
    ...overrides,
  };
}

async function createReviewer(reviewerId: string, email: string) {
  const now = Date.now();
  await env.AUTH_DB.batch([
    env.AUTH_DB.prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email`,
    ).bind(reviewerId, "Progress Reviewer", email, now, now),
    env.AUTH_DB.prepare(
      `INSERT INTO event_memberships (event_id, user_id, role)
       VALUES (?, ?, 'reviewer')
       ON CONFLICT(event_id, user_id) DO UPDATE SET role = 'reviewer'`,
    ).bind(eventId, reviewerId),
    env.AUTH_DB.prepare(
      `INSERT INTO reviewer_track_assignments (event_id, user_id, track_id)
       VALUES (?, ?, 'platform')
       ON CONFLICT(event_id, user_id, track_id) DO NOTHING`,
    ).bind(eventId, reviewerId),
  ]);
}


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
});
describe("review progress and reviewer reminders", () => {
  it("tracks exact round progress, protects reviewer visibility, and queues idempotent reminders", async () => {
    const reviewerId = `progress-reviewer-${crypto.randomUUID()}`;
    const reviewerEmail = `${reviewerId}@example.test`;
    await createReviewer(reviewerId, reviewerEmail);

    const sentMessages: Array<{ to: string; subject: string; text: string }> = [];
    const adminApp = createApp({ resolvePrincipal: async () => admin, emailSender: null });
    const reviewerApp = createApp({
      resolvePrincipal: async () => ({
        id: reviewerId,
        displayName: "Progress Reviewer",
        role: "reviewer",
        eventIds: [eventId],
        trackIdsByEvent: { [eventId]: ["platform"] },
      }),
      emailSender: null,
    });
    const failingMailApp = createApp({
      resolvePrincipal: async () => admin,
      emailSender: { send: async () => { throw new Error("smtp down"); } },
    });
    const sendingMailApp = createApp({
      resolvePrincipal: async () => admin,
      emailSender: {
        send: async (message) => {
          sentMessages.push({ to: message.to, subject: message.subject, text: message.text });
        },
      },
    });

    const proposalsResponse = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals?track=platform`,
      undefined,
      env,
    );
    expect(proposalsResponse.status).toBe(200);
    const { proposals } = await proposalsResponse.json<{ proposals: Array<{ id: string; reviewVersion: number }> }>();
    expect(proposals.length).toBeGreaterThanOrEqual(2);

    const saved = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/evaluation-plan`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rounds: [
            currentRound("Progress review", [reviewerId]),
            currentRound("Final review", [reviewerId], { state: "draft" }),
          ],
        }),
      },
      env,
    );
    expect(saved.status).toBe(200);
    const { plan } = await saved.json<{ plan: { rounds: Array<{ id: string }> } }>();
    const roundId = plan.rounds[0]!.id;

    for (const proposal of proposals.slice(0, 2)) {
      const assigned = await adminApp.request(
        `https://chartstead.test/api/events/${eventId}/evaluation-rounds/${roundId}/assignments`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ proposalId: proposal.id, reviewerId, assigned: true }),
        },
        env,
      );
      expect(assigned.status).toBe(200);
    }

    const forbidden = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/review-progress?roundId=${roundId}`,
      undefined,
      env,
    );
    expect(forbidden.status).toBe(403);

    const initial = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/review-progress?roundId=${roundId}`,
      undefined,
      env,
    );
    expect(initial.status).toBe(200);
    await expect(initial.json()).resolves.toMatchObject({
      round: { assignedCount: 2, completedCount: 0, outstandingCount: 2 },
      incompleteReviewers: [expect.objectContaining({ reviewerId, outstandingCount: 2 })],
    });

    const detail = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/${proposals[0]!.id}?roundId=${roundId}`,
      undefined,
      env,
    );
    const detailBody = await detail.json<{ proposal: { reviewVersion: number } }>();
    const review = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/${proposals[0]!.id}/review`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "approve", expectedVersion: detailBody.proposal.reviewVersion, roundId }),
      },
      env,
    );
    expect(review.status).toBe(200);

    const overduePlan = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/evaluation-plan`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rounds: [
            currentRound("Progress review", [reviewerId], { id: roundId, startsOn: "2026-01-01", endsOn: "2026-01-02" }),
            currentRound("Final review", [reviewerId], { id: plan.rounds[1]!.id, state: "draft" }),
          ],
        }),
      },
      env,
    );
    expect(overduePlan.status).toBe(200);

    const afterReview = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/review-progress?roundId=${roundId}`,
      undefined,
      env,
    );
    expect(afterReview.status).toBe(200);
    await expect(afterReview.json()).resolves.toMatchObject({
      round: { assignedCount: 2, completedCount: 1, outstandingCount: 1, overdueReviewerCount: 1 },
      overdueReviewers: [expect.objectContaining({ reviewerId, outstandingCount: 1, overdue: true })],
    });

    const preview = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/review-progress/reminders/preview`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roundId, reviewerIds: [reviewerId] }),
      },
      env,
    );
    expect(preview.status).toBe(200);
    const previewBody = await preview.json<{ drafts: Array<{ reviewerId: string; subject: string; bodyText: string; pendingCount: number }> }>();
    expect(previewBody.drafts).toHaveLength(1);
    expect(previewBody.drafts[0]).toMatchObject({ reviewerId, pendingCount: 1 });
    expect(previewBody.drafts[0]!.bodyText).not.toContain("Progress Admin");

    const failedSend = await failingMailApp.request(
      `https://chartstead.test/api/events/${eventId}/review-progress/reminders/send`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roundId,
          idempotencyKey: `progress-reminder-${reviewerId}`,
          drafts: previewBody.drafts.map((draft) => ({
            reviewerId: draft.reviewerId,
            subject: `${draft.subject} (edited)`,
            bodyText: `${draft.bodyText}\n\nEdited by organizer.`,
          })),
        }),
      },
      env,
    );
    expect(failedSend.status).toBe(202);
    const failedBody = await failedSend.json<{ results: Array<{ outboxId: string; status: string; error: string | null }> }>();
    expect(failedBody.results[0]).toMatchObject({ status: "retryable", error: "smtp down" });

    const retry = await sendingMailApp.request(
      `https://chartstead.test/api/events/${eventId}/review-progress/reminders/${failedBody.results[0]!.outboxId}/retry`,
      { method: "POST" },
      env,
    );
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({ status: "sent", error: null });
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]).toMatchObject({ to: reviewerEmail });
    expect(sentMessages[0]!.text).toContain("Edited by organizer.");

    const duplicate = await sendingMailApp.request(
      `https://chartstead.test/api/events/${eventId}/review-progress/reminders/send`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roundId,
          idempotencyKey: `progress-reminder-${reviewerId}`,
          drafts: previewBody.drafts,
        }),
      },
      env,
    );
    expect(duplicate.status).toBe(202);
    await expect(duplicate.json()).resolves.toMatchObject({
      results: [expect.objectContaining({ outboxId: failedBody.results[0]!.outboxId, status: "sent" })],
    });
    expect(sentMessages).toHaveLength(1);

    await evictDurableObject(env.EVENT_STORE.getByName(eventId));
  });
});
