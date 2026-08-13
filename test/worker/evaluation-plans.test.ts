import { env, evictDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import type { OrganizerPrincipal } from "../../shared/events";
import { createApp } from "../../worker/app";

const eventId = "pacific-open-data-summit-2026";
const admin = {
  id: "evaluation-plan-admin",
  displayName: "Evaluation Plan Administrator",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;
const reviewerOne = {
  id: "evaluation-plan-reviewer-one",
  displayName: "Round One Reviewer",
  role: "reviewer",
  eventIds: [eventId],
  trackIdsByEvent: { [eventId]: ["platform"] },
} satisfies OrganizerPrincipal;
const reviewerTwo = {
  id: "evaluation-plan-reviewer-two",
  displayName: "Round Two Reviewer",
  role: "reviewer",
  eventIds: [eventId],
  trackIdsByEvent: { [eventId]: ["platform"] },
} satisfies OrganizerPrincipal;

const adminApp = createApp({ resolvePrincipal: async () => admin });
const reviewerOneApp = createApp({ resolvePrincipal: async () => reviewerOne });
const reviewerTwoApp = createApp({ resolvePrincipal: async () => reviewerTwo });

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

async function savePlan(rounds: unknown[]) {
  return adminApp.request(
    `https://chartstead.test/api/events/${eventId}/evaluation-plan`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rounds }),
    },
    env,
  );
}

async function setAssignment(roundId: string, proposalId: string, reviewerId: string, assigned = true) {
  return adminApp.request(
    `https://chartstead.test/api/events/${eventId}/evaluation-rounds/${roundId}/assignments`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proposalId, reviewerId, assigned }),
    },
    env,
  );
}

describe("advanced evaluation plans", () => {
  it("keeps the shared track queue unchanged until an advanced plan exists", async () => {
    const store = env.EVENT_STORE.getByName(eventId);
    await store.seedIfEmpty({
      id: eventId,
      name: "Pacific Open Data Summit 2026",
      startsOn: "2026-09-14",
      endsOn: "2026-09-16",
      timezone: "America/Los_Angeles",
      submissionCount: 0,
      unreviewedCount: 0,
      tracks: [{ id: "platform", name: "Platform", proposalCount: 0 }],
      rooms: [],
    });
    const response = await reviewerOneApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals`,
      undefined,
      env,
    );
    expect(response.status).toBe(200);
    expect(await store.getEvaluationPlan()).toBeNull();
  });

  it("persists ordered round configuration, audit history, and event isolation", async () => {
    const saved = await savePlan([
      currentRound("Initial review", [reviewerOne.id], { anonymization: "blind" }),
      currentRound("Final review", [reviewerTwo.id], { scorecardRef: "final-scorecard" }),
    ]);
    expect(saved.status).toBe(200);
    const body = await saved.json<{
      plan: { version: number; rounds: Array<{ id: string; order: number; anonymization: string; reviewerPool: string[] }> };
      auditEvents: Array<{ action: string }>;
    }>();
    expect(body.plan).toMatchObject({ version: 1, enabled: true });
    expect(body.plan.rounds).toHaveLength(2);
    expect(body.plan.rounds[0]).toMatchObject({
      order: 0,
      anonymization: "blind",
      reviewerPool: [reviewerOne.id],
    });
    expect(body.plan.rounds[1]).toMatchObject({
      order: 1,
      reviewerPool: [reviewerTwo.id],
    });
    expect(body.auditEvents[0]).toMatchObject({ action: "evaluation_plan.saved" });

    const store = env.EVENT_STORE.getByName(eventId);
    await evictDurableObject(store);
    const persisted = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/evaluation-plan`,
      undefined,
      env,
    );
    await expect(persisted.json()).resolves.toMatchObject({
      plan: { version: 1, rounds: [{ order: 0 }, { order: 1 }] },
    });
    expect(
      await env.EVENT_STORE.getByName("ai-engineer-worlds-fair-2026").getEvaluationPlan(),
    ).toBeNull();

    const reordered = await savePlan([
      { ...currentRound("Final review", [reviewerTwo.id]), id: body.plan.rounds[1].id },
      { ...currentRound("Initial review", [reviewerOne.id]), id: body.plan.rounds[0].id },
    ]);
    expect(reordered.status).toBe(200);
    const reorderedBody = await reordered.json<{
      plan: { rounds: Array<{ id: string; order: number }> };
    }>();
    expect(reorderedBody.plan.rounds[0]).toMatchObject({
      id: body.plan.rounds[1].id,
      order: 0,
    });
  });

  it("does not grant access across reviewer pools and enforces open date windows", async () => {
    const store = env.EVENT_STORE.getByName(eventId);
    const currentPlan = await store.getEvaluationPlan();
    const reviewerOneRound = currentPlan!.rounds.find((round) =>
      round.reviewerPool.includes(reviewerOne.id),
    )!;
    const reviewerTwoRound = currentPlan!.rounds.find((round) =>
      round.reviewerPool.includes(reviewerTwo.id),
    )!;

    const ownRound = await reviewerOneApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals?roundId=${reviewerOneRound.id}`,
      undefined,
      env,
    );
    expect(ownRound.status).toBe(200);

    const otherRound = await reviewerOneApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals?roundId=${reviewerTwoRound.id}`,
      undefined,
      env,
    );
    expect(otherRound.status).toBe(403);
    await expect(otherRound.json()).resolves.toMatchObject({ code: "reviewer_not_assigned" });

    const closed = await savePlan([
      { ...currentRound("Initial review", [reviewerOne.id]), id: reviewerOneRound.id, state: "closed" },
      { ...currentRound("Final review", [reviewerTwo.id]), id: reviewerTwoRound.id, startsOn: "2099-01-01", endsOn: "2099-01-02" },
    ]);
    expect(closed.status).toBe(200);
    const closedRound = await reviewerOneApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals?roundId=${reviewerOneRound.id}`,
      undefined,
      env,
    );
    expect(closedRound.status).toBe(403);
    await expect(closedRound.json()).resolves.toMatchObject({ code: "round_not_open" });
    const futureRound = await reviewerTwoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals?roundId=${reviewerTwoRound.id}`,
      undefined,
      env,
    );
    expect(futureRound.status).toBe(403);
    await expect(futureRound.json()).resolves.toMatchObject({ code: "outside_date_window" });
  });

  it("isolates advanced reviewer queues to exact assignments and applies capped bulk distribution idempotently", async () => {
    const saved = await savePlan([
      currentRound("Assignment review", [reviewerOne.id, reviewerTwo.id]),
      currentRound("Final review", [reviewerTwo.id]),
    ]);
    const { plan } = await saved.json<{ plan: { rounds: Array<{ id: string }> } }>();
    const roundId = plan.rounds[0]!.id;

    const preview = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/evaluation-rounds/${roundId}/assignments/preview`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trackIds: ["platform"],
          reviewerIds: [reviewerOne.id, reviewerTwo.id],
          maxAssignmentsPerReviewer: 2,
        }),
      },
      env,
    );
    expect(preview.status).toBe(200);
    const previewBody = await preview.json<{
      preview: {
        totalCandidates: number;
        assignments: Array<{ reviewerId: string; proposalIds: string[]; count: number }>;
        unassignedProposalIds: string[];
      };
    }>();
    expect(previewBody.preview.totalCandidates).toBe(14);
    expect(previewBody.preview.assignments.map((assignment) => assignment.count)).toEqual([2, 2]);
    expect(previewBody.preview.unassignedProposalIds).toHaveLength(10);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const applied = await adminApp.request(
        `https://chartstead.test/api/events/${eventId}/evaluation-rounds/${roundId}/assignments/distribute`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            trackIds: ["platform"],
            reviewerIds: [reviewerOne.id, reviewerTwo.id],
            maxAssignmentsPerReviewer: 2,
          }),
        },
        env,
      );
      expect(applied.status).toBe(200);
      await expect(applied.json()).resolves.toMatchObject({
        preview: { totalCandidates: 14, unassignedProposalIds: expect.any(Array) },
        assignments: expect.arrayContaining([
          expect.objectContaining({ reviewerId: reviewerOne.id }),
          expect.objectContaining({ reviewerId: reviewerTwo.id }),
        ]),
      });
    }

    const reviewerOneQueue = await reviewerOneApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals?roundId=${roundId}`,
      undefined,
      env,
    );
    const reviewerOneBody = await reviewerOneQueue.json<{ proposals: Array<{ id: string }> }>();
    const reviewerOneAssigned = previewBody.preview.assignments.find(
      (assignment) => assignment.reviewerId === reviewerOne.id,
    )!.proposalIds;
    expect(reviewerOneBody.proposals.map((proposal) => proposal.id).sort()).toEqual(
      [...reviewerOneAssigned].sort(),
    );

    const reviewerTwoQueue = await reviewerTwoApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals?roundId=${roundId}`,
      undefined,
      env,
    );
    const reviewerTwoBody = await reviewerTwoQueue.json<{ proposals: Array<{ id: string }> }>();
    const reviewerTwoAssigned = previewBody.preview.assignments.find(
      (assignment) => assignment.reviewerId === reviewerTwo.id,
    )!.proposalIds;
    expect(reviewerTwoBody.proposals.map((proposal) => proposal.id).sort()).toEqual(
      [...reviewerTwoAssigned].sort(),
    );
    expect(new Set([...reviewerOneAssigned, ...reviewerTwoAssigned]).size).toBe(4);

    const unassigned = await setAssignment(roundId, reviewerOneAssigned[0]!, reviewerOne.id, false);
    expect(unassigned.status).toBe(200);
    const afterUnassign = await reviewerOneApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals?roundId=${roundId}`,
      undefined,
      env,
    );
    await expect(afterUnassign.json()).resolves.toMatchObject({ proposals: expect.any(Array) });
    const forbiddenPreview = await reviewerOneApp.request(
      `https://chartstead.test/api/events/${eventId}/evaluation-rounds/${roundId}/assignments/preview`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      env,
    );
    expect(forbiddenPreview.status).toBe(403);
  });

  it("requires organizer authority to configure plans and records round review audit linkage", async () => {
    const forbidden = await reviewerOneApp.request(
      `https://chartstead.test/api/events/${eventId}/evaluation-plan`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rounds: [currentRound("No", []), currentRound("No two", [])] }),
      },
      env,
    );
    expect(forbidden.status).toBe(403);

    const reopened = await savePlan([
      currentRound("Initial review", [reviewerOne.id]),
      currentRound("Final review", [reviewerTwo.id]),
    ]);
    const { plan } = await reopened.json<{ plan: { rounds: Array<{ id: string }> } }>();
    const roundId = plan.rounds[0].id;
    expect((await setAssignment(roundId, "SUB-PODS0001", reviewerOne.id)).status).toBe(200);
    const review = await reviewerOneApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/SUB-PODS0001/review`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "approve", expectedVersion: 0, roundId }),
      },
      env,
    );
    expect(review.status).toBe(200);
    await expect(review.json()).resolves.toMatchObject({
      auditEvents: [expect.objectContaining({ roundId })],
    });
  });

  it("applies blind-round identity protection to browser and v1 reviewer APIs", async () => {
    const saved = await savePlan([
      currentRound("Blind review", [reviewerOne.id], { anonymization: "blind" }),
      currentRound("Final review", [reviewerTwo.id]),
    ]);
    const { plan } = await saved.json<{ plan: { rounds: Array<{ id: string }> } }>();
    const roundId = plan.rounds[0]!.id;
    await env.EVENT_STORE.getByName(eventId).setEvaluationRoundAssignment({
      roundId,
      proposalId: "SUB-PODS0001",
      reviewerId: reviewerOne.id,
      assigned: true,
      actorId: admin.id,
      actorName: admin.displayName,
    });
    const paths = [
      `https://chartstead.test/api/events/${eventId}/proposals?roundId=${roundId}`,
      `https://chartstead.test/api/v1/events/${eventId}/submissions?roundId=${roundId}`,
    ];

    for (const path of paths) {
      const response = await reviewerOneApp.request(path, undefined, env);
      expect(response.status).toBe(200);
      const body = await response.json<{ proposals?: Array<{ speakerName: string; speakerEmail: string; biography: string; coSpeakers: unknown[]; supportingFile: unknown; answers: Record<string, unknown> }>; submissions?: Array<{ speakerName: string; speakerEmail: string; biography: string; coSpeakers: unknown[]; supportingFile: unknown; answers: Record<string, unknown> }> }>();
      const projected = body.proposals?.[0] ?? body.submissions?.[0];
      expect(projected).toMatchObject({
        speakerName: "Anonymous submission",
        speakerEmail: "",
        biography: "",
        coSpeakers: [],
        supportingFile: null,
      });
      expect(projected?.answers.speakers).toBeUndefined();
    }

    const detailPaths = [
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/SUB-PODS0001?roundId=${roundId}`,
      `https://chartstead.test/api/v1/events/${eventId}/submissions/SUB-PODS0001?roundId=${roundId}`,
    ];
    for (const path of detailPaths) {
      const response = await reviewerOneApp.request(path, undefined, env);
      expect(response.status).toBe(200);
      const body = await response.json<{ proposal?: { speakerName: string; speakerEmail: string }; submission?: { speakerName: string; speakerEmail: string } }>();
      expect(body.proposal ?? body.submission).toMatchObject({
        speakerName: "Anonymous submission",
        speakerEmail: "",
      });
    }
  });

  it("records reviewer recusal, blocks further review, and keeps other reviewers isolated", async () => {
    const saved = await savePlan([
      currentRound("Blind conflicts", [reviewerOne.id], { anonymization: "blind" }),
      currentRound("Second reviewer", [reviewerTwo.id]),
    ]);
    const { plan } = await saved.json<{ plan: { rounds: Array<{ id: string }> } }>();
    const blindRoundId = plan.rounds[0]!.id;
    const secondRoundId = plan.rounds[1]!.id;
    const store = env.EVENT_STORE.getByName(eventId);
    await store.setEvaluationRoundAssignment({
      roundId: blindRoundId,
      proposalId: "SUB-PODS0001",
      reviewerId: reviewerOne.id,
      assigned: true,
      actorId: admin.id,
      actorName: admin.displayName,
    });
    await store.setEvaluationRoundAssignment({
      roundId: secondRoundId,
      proposalId: "SUB-PODS0001",
      reviewerId: reviewerTwo.id,
      assigned: true,
      actorId: admin.id,
      actorName: admin.displayName,
    });

    const recusal = await reviewerOneApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/SUB-PODS0001/recusal`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roundId: blindRoundId,
          reason: "Institutional conflict",
        }),
      },
      env,
    );
    expect(recusal.status).toBe(200);
    const recusalBody = await recusal.json<{
      proposal: {
        speakerName: string;
        reviewerRecusal: { roundId: string; reviewerId: string; reason: string };
        reviewerRecusals: unknown[];
      };
      auditEvents: Array<{ type: string; actorId: string; roundId: string | null }>;
    }>();
    expect(recusalBody.proposal).toMatchObject({
      speakerName: "Anonymous submission",
      reviewerRecusal: {
        roundId: blindRoundId,
        reviewerId: reviewerOne.id,
        reason: "Institutional conflict",
      },
      reviewerRecusals: [],
    });
    expect(recusalBody.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "proposal.review.recused",
          actorId: reviewerOne.id,
          roundId: blindRoundId,
        }),
      ]),
    );

    const blockedReview = await reviewerOneApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/SUB-PODS0001/review`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "approve",
          expectedVersion: 999,
          roundId: blindRoundId,
        }),
      },
      env,
    );
    expect(blockedReview.status).toBe(409);
    await expect(blockedReview.json()).resolves.toMatchObject({ code: "reviewer_recused" });

    const adminDetail = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/SUB-PODS0001`,
      undefined,
      env,
    );
    expect(adminDetail.status).toBe(200);
    const adminBody = await adminDetail.json<{
      proposal: {
        speakerName: string;
        reviewerRecusals: Array<{ reviewerId: string; reason: string }>;
      };
    }>();
    expect(adminBody.proposal.reviewerRecusals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reviewerId: reviewerOne.id,
          reason: "Institutional conflict",
        }),
      ]),
    );

    const otherReviewer = await reviewerTwoApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/SUB-PODS0001?roundId=${secondRoundId}`,
      undefined,
      env,
    );
    expect(otherReviewer.status).toBe(200);
    await expect(otherReviewer.json()).resolves.toMatchObject({
      proposal: {
        reviewerRecusal: null,
        reviewerRecusals: [],
      },
      auditEvents: [],
    });
  });

  it("persists configurable weighted scorecards and sorts organizer results by aggregate", async () => {
    const scorecard = {
      criteria: [
        {
          id: "impact",
          type: "numeric",
          label: "Impact",
          guidance: "Expected attendee value.",
          required: true,
          weight: 2,
          maxScore: 5,
          options: [],
        },
        {
          id: "fit",
          type: "dropdown",
          label: "Program fit",
          guidance: "Track and audience fit.",
          required: true,
          weight: 1,
          maxScore: 5,
          options: [
            { id: "strong", label: "Strong", score: 5 },
            { id: "weak", label: "Weak", score: 1 },
          ],
        },
        {
          id: "notes",
          type: "text",
          label: "Notes",
          guidance: "Reviewer rationale.",
          required: false,
          weight: null,
          maxScore: null,
          options: [],
        },
      ],
      calculationDescription: "Impact counts twice; fit counts once.",
    };
    const saved = await savePlan([
      currentRound("Weighted review", [reviewerOne.id], { scorecard }),
      currentRound("Final review", [reviewerTwo.id]),
    ]);
    expect(saved.status).toBe(200);
    const { plan } = await saved.json<{ plan: { rounds: Array<{ id: string; scorecard: typeof scorecard }> } }>();
    const roundId = plan.rounds[0]!.id;
    expect(plan.rounds[0]!.scorecard.criteria.map((criterion) => criterion.type)).toEqual([
      "numeric",
      "dropdown",
      "text",
    ]);
    expect((await setAssignment(roundId, "SUB-PODS0001", reviewerOne.id)).status).toBe(200);
    expect((await setAssignment(roundId, "SUB-PODS0002", reviewerOne.id)).status).toBe(200);

    const detail = await reviewerOneApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/SUB-PODS0001?roundId=${roundId}`,
      undefined,
      env,
    );
    expect(detail.status).toBe(200);
    const detailBody = await detail.json<{
      proposal: { reviewVersion: number };
      scorecard: { round: { id: string }; reviewerResponse: null };
    }>();
    expect(detailBody).toMatchObject({
      scorecard: {
        round: { id: roundId },
        reviewerResponse: null,
      },
    });

    const review = await reviewerOneApp.request(
      `https://chartstead.test/api/events/${eventId}/organizer/proposals/SUB-PODS0001/review`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: detailBody.proposal.reviewVersion,
          roundId,
          scorecardValues: { impact: 4, fit: "strong", notes: "Clear evidence." },
        }),
      },
      env,
    );
    expect(review.status).toBe(200);
    const reviewBody = await review.json<{
      scorecard: {
        reviewerResponse: { values: Record<string, unknown>; aggregateScore: number };
        aggregate: { aggregateScore: number; responseCount: number };
      };
    }>();
    expect(reviewBody.scorecard.reviewerResponse.values).toMatchObject({
      impact: 4,
      fit: "strong",
      notes: "Clear evidence.",
    });
    expect(reviewBody.scorecard.reviewerResponse.aggregateScore).toBe(86.67);
    expect(reviewBody.scorecard.aggregate).toMatchObject({
      aggregateScore: 86.67,
      responseCount: 1,
    });

    const sorted = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/proposals?roundId=${roundId}&sort=aggregate-desc`,
      undefined,
      env,
    );
    expect(sorted.status).toBe(200);
    const sortedBody = await sorted.json<{ proposals: Array<{ id: string; scorecardAggregate: { aggregateScore: number | null } | null }> }>();
    expect(sortedBody.proposals[0]).toMatchObject({
      id: "SUB-PODS0001",
      scorecardAggregate: { aggregateScore: 86.67 },
    });
    expect(sortedBody.proposals.some((proposal) => proposal.id === "SUB-PODS0002")).toBe(true);
  });
});
