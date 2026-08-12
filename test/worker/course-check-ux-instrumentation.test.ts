import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { OrganizerPrincipal } from "../../shared/events";
import { createApp } from "../../worker/app";

const eventId = "pacific-open-data-summit-2026";
const admin = {
  id: "cc22-admin",
  displayName: "Validation Admin",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;
const reviewer = {
  id: "cc22-reviewer",
  displayName: "Validation Reviewer",
  role: "reviewer",
  eventIds: [eventId],
  trackIdsByEvent: { [eventId]: ["platform"] },
} satisfies OrganizerPrincipal;
const adminApp = createApp({
  resolvePrincipal: async () => admin,
  signingSecret: "course-check-22-instrumentation-secret",
});
const reviewerApp = createApp({
  resolvePrincipal: async () => reviewer,
  signingSecret: "course-check-22-instrumentation-secret",
});

async function emit(
  id: string,
  input: Record<string, unknown>,
  app = adminApp,
) {
  return app.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/ux-events`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": id },
      body: JSON.stringify({ id, ...input }),
    },
    env,
  );
}

describe("Course Check privacy-safe UX instrumentation", () => {
  beforeAll(async () => {
    const response = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}`,
      undefined,
      env,
    );
    expect(response.status).toBe(200);
  });

  it("records allowlisted classifications and counts idempotently", async () => {
    const event = {
      journeyId: "journey-clean-20",
      planId: "plan-clean-20",
      eventType: "stage_outcome",
      actionType: "decision",
      stage: "decision",
      issueClass: null,
      issueAction: null,
      issueCount: 0,
      affectedCount: 20,
      routeChanges: 0,
      durationMs: 24_500,
      outcome: "succeeded",
    };
    expect((await emit("ux-event-1", event)).status).toBe(202);
    expect((await emit("ux-event-1", event)).status).toBe(200);

    const exportResponse = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/ux-evidence`,
      undefined,
      env,
    );
    expect(exportResponse.status).toBe(200);
    const evidence = await exportResponse.json<{
      eventCount: number;
      uniqueJourneyCount: number;
      byEventType: Record<string, number>;
      durations: { actionToCommitMs: number[] };
      records: Array<Record<string, unknown>>;
      evidenceClass: string;
    }>();
    expect(evidence.eventCount).toBe(1);
    expect(evidence.uniqueJourneyCount).toBe(1);
    expect(evidence.byEventType.stage_outcome).toBe(1);
    expect(evidence.durations.actionToCommitMs).toContain(24_500);
    expect(evidence.evidenceClass).toBe("seeded_or_product_behavior_not_human_usability");
    expect(evidence.records[0]).not.toHaveProperty("actorId");
    expect(evidence.records[0]).not.toHaveProperty("email");
  });

  it("captures issue choices, route changes, abandonment, resume, stale recheck, Outbox, correction, and compensation", async () => {
    const events = [
      ["issues_shown", { issueClass: "needs_action", issueCount: 1 }],
      ["issue_action", { issueClass: "needs_action", issueAction: "fix" }],
      ["route_changed", { routeChanges: 1, outcome: "repair" }],
      ["journey_abandoned", { durationMs: 8_000, outcome: "abandoned" }],
      ["journey_resumed", { durationMs: 12_000, outcome: "resumed" }],
      ["stale_recheck", { affectedCount: 1, outcome: "rechecked" }],
      ["outbox_continuation", { affectedCount: 10, outcome: "continued" }],
      ["message_correction", { affectedCount: 1, outcome: "corrected" }],
      ["compensation_started", { affectedCount: 1, outcome: "compensating" }],
    ] as const;
    for (const [index, [eventType, values]] of events.entries()) {
      const response = await emit(`ux-coverage-${index}`, {
        journeyId: "journey-exception",
        planId: "plan-exception",
        eventType,
        actionType: "communication",
        stage: "delivery",
        issueClass: null,
        issueAction: null,
        issueCount: 0,
        affectedCount: 0,
        routeChanges: 0,
        durationMs: null,
        outcome: null,
        ...values,
      });
      expect(response.status).toBe(202);
    }
    const evidence = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/ux-evidence`,
      undefined,
      env,
    );
    const body = await evidence.json<{ byEventType: Record<string, number> }>();
    for (const [eventType] of events) expect(body.byEventType[eventType]).toBe(1);
  });

  it("rejects personal or free-form payloads and limits evidence export to administrators", async () => {
    const privateFields = [
      { email: "speaker@example.test" },
      { messageBody: "private content" },
      { speakerName: "Private Person" },
      { signedLink: "https://example.test/token" },
      { credentials: "secret" },
    ];
    for (const [index, extra] of privateFields.entries()) {
      const response = await emit(`ux-private-${index}`, {
        journeyId: "journey-private",
        planId: "plan-private",
        eventType: "journey_started",
        actionType: "decision",
        stage: "decision",
        issueClass: null,
        issueAction: null,
        issueCount: 0,
        affectedCount: 0,
        routeChanges: 0,
        durationMs: null,
        outcome: null,
        ...extra,
      });
      expect(response.status).toBe(400);
    }

    const reviewerExport = await reviewerApp.request(
      `https://chartstead.test/api/events/${eventId}/course-checks/ux-evidence`,
      undefined,
      env,
    );
    expect(reviewerExport.status).toBe(403);
  });

  it("rejects invalid classifications without affecting Course Check reads", async () => {
    const response = await emit("ux-invalid", {
      journeyId: "journey-invalid",
      planId: "plan-invalid",
      eventType: "free_form_tracking",
      actionType: "decision",
      stage: "decision",
      issueClass: null,
      issueAction: null,
      issueCount: 0,
      affectedCount: 0,
      routeChanges: 0,
      durationMs: null,
      outcome: "anything",
    });
    expect(response.status).toBe(400);

    const plans = await adminApp.request(
      `https://chartstead.test/api/events/${eventId}/course-checks`,
      undefined,
      env,
    );
    expect(plans.status).toBe(200);
  });
});
