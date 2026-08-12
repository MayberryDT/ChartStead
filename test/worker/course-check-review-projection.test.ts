import { env, evictDurableObject } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type {
  CourseCheckPlan,
  DecisionPlanBody,
} from "../../shared/course-check";
import type { OrganizerPrincipal } from "../../shared/events";
import { createApp } from "../../worker/app";
import { projectCourseCheckForViewer } from "../../worker/course-check/projection";

const eventId = "pacific-open-data-summit-2026";

const admin = {
  id: "cc14-admin",
  displayName: "Decision Review Admin",
  role: "admin",
  eventIds: [eventId],
} satisfies OrganizerPrincipal;

const reviewer = {
  id: "cc14-reviewer",
  displayName: "Decision Review Reviewer",
  role: "reviewer",
  eventIds: [eventId],
  trackIdsByEvent: { [eventId]: [] as string[] },
} as unknown as OrganizerPrincipal;

const adminApp = createApp({
  resolvePrincipal: async () => admin,
  signingSecret: "course-check-14-review-projection-secret",
});

const reviewerApp = createApp({
  resolvePrincipal: async () => reviewer,
  signingSecret: "course-check-14-review-projection-secret",
});

type DecisionReview = {
  kind: "decision_review";
  phase: "proposed" | "applied";
  title: string;
  courseCheckSummary: string;
  counts: {
    selected: number;
    ready: number;
    needsAction: number;
    warning: number;
    skipped: number;
  };
  issues: Array<{
    severity: "blocker" | "warning" | "info";
    summary: string;
    nextStep: string | null;
    affectedItemCount: number;
  }>;
  effectGroups: Array<{
    key: string;
    state: "pending" | "applied" | "unchanged";
    count: number;
    summary: string;
  }>;
  permittedCommits: Array<{ stageId: string; label: string; effectSummary: string }>;
  canDeferItems: boolean;
  canStartDraftPreparation: boolean;
  freshness: { state: string; label: string; checkedAt: string };
  preCommitBoundary: string | null;
  primaryActionLabel: string | null;
  result: null | {
    title: string;
    decisions: { accepted: number; declined: number; total: number };
    generatedRecords: { totalCreated: number };
    unchangedCount: number;
    drafts: { state: string; count: number; label: string };
    externalCommunication: { emailsSent: number; label: string };
    appliedAt: string;
    appliedBy: string;
  };
};

type ProjectedPlan = CourseCheckPlan & { decisionReview?: DecisionReview };

const fullAdminProjection = {
  role: "admin" as const,
  trackIds: [],
  canViewCommunicationEvidence: true,
  canViewFullDecisionEvidence: true,
  permittedStageIds: ["apply-decision"],
  canDeferItems: true,
  canStartDraftPreparation: true,
};

async function loadEvent() {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
}

async function createDecision(
  items: Array<{ proposalId: string; outcome: "accepted" | "declined" }>,
  key: string,
): Promise<ProjectedPlan> {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/decisions`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify({ items, idempotencyKey: key }),
    },
    env,
  );
  expect(response.status).toBe(201);
  return response.json<ProjectedPlan>();
}

async function getDecision(
  planId: string,
  app: typeof adminApp = adminApp,
): Promise<ProjectedPlan> {
  const response = await app.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/${planId}`,
    undefined,
    env,
  );
  expect(response.status).toBe(200);
  return response.json<ProjectedPlan>();
}

async function applyDecision(plan: CourseCheckPlan, key: string): Promise<ProjectedPlan> {
  const response = await adminApp.request(
    `https://chartstead.test/api/events/${eventId}/course-checks/${plan.id}/apply`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify({
        planVersion: plan.version,
        digest: plan.digest,
        stageId: "apply-decision",
        idempotencyKey: key,
      }),
    },
    env,
  );
  expect(response.status).toBe(200);
  return response.json<ProjectedPlan>();
}

describe("Course Check 14 decision review projection", () => {
  beforeAll(loadEvent);

  it("supplies a stable authenticated single-decision review and persistent truthful receipt", async () => {
    const created = await createDecision(
      [{ proposalId: "SUB-PODS0021", outcome: "declined" }],
      "cc14-single-decline",
    );

    expect(created.decisionReview).toMatchObject({
      kind: "decision_review",
      phase: "proposed",
      title: "Review 1 decline decision",
      counts: { selected: 1, ready: 1, needsAction: 0, skipped: 0 },
      primaryActionLabel: "Decline 1 submission",
      preCommitBoundary: "Nothing has changed. No external communication has been sent.",
      permittedCommits: [
        {
          stageId: "apply-decision",
          label: "Decline 1 submission",
        },
      ],
      freshness: { state: "current" },
      result: null,
    });
    expect(created.decisionReview?.effectGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "decisions",
          state: "pending",
          summary: "1 submission will be declined.",
        }),
        expect.objectContaining({
          key: "drafts",
          state: "unchanged",
          summary: "No drafts will be prepared.",
        }),
        expect.objectContaining({
          key: "external_communication",
          state: "unchanged",
          summary: "No emails will be sent.",
        }),
      ]),
    );

    const outboxBefore = (await env.EVENT_STORE.getByName(eventId).listOutboxMessages()).length;
    const applied = await applyDecision(created, "cc14-single-decline-apply");
    expect(applied.decisionReview).toMatchObject({
      phase: "applied",
      title: "Decline decision applied",
      primaryActionLabel: null,
      preCommitBoundary: null,
      permittedCommits: [],
      result: {
        title: "Decline decision applied",
        decisions: { accepted: 0, declined: 1, total: 1 },
        generatedRecords: { totalCreated: 0 },
        unchangedCount: 0,
        drafts: { state: "not_prepared", count: 0, label: "No drafts were prepared." },
        externalCommunication: { emailsSent: 0, label: "No emails were sent." },
        appliedBy: "Decision Review Admin",
      },
    });
    expect((await env.EVENT_STORE.getByName(eventId).listOutboxMessages()).length).toBe(
      outboxBefore,
    );

    await evictDurableObject(env.EVENT_STORE.getByName(eventId));
    const reloaded = await getDecision(created.id);
    expect(reloaded.decisionReview?.result).toEqual(applied.decisionReview?.result);
  });

  it("uses the same live projection for mixed batches and role-aware permitted commits", async () => {
    const created = await createDecision(
      [
        { proposalId: "SUB-PODS0022", outcome: "accepted" },
        { proposalId: "SUB-PODS0023", outcome: "declined" },
      ],
      "cc14-mixed-batch",
    );
    expect(created.decisionReview).toMatchObject({
      phase: "proposed",
      title: "Review 2 decisions",
      counts: { selected: 2, ready: 2, needsAction: 0, skipped: 0 },
      primaryActionLabel:
        "Accept 1 submission, decline 1 submission, and create 7 related records",
    });
    expect(created.decisionReview?.effectGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "decisions",
          state: "pending",
          summary: "1 submission will be accepted and 1 submission will be declined.",
        }),
        expect.objectContaining({
          key: "records",
          state: "pending",
          count: 7,
        }),
      ]),
    );

    if (created.body.actionType !== "decision") throw new Error("expected decision plan");
    reviewer.trackIdsByEvent = {
      [eventId]: [created.body.items[0]?.session?.trackId ?? "platform"],
    };
    const reviewerView = await getDecision(created.id, reviewerApp);
    expect(reviewerView.decisionReview?.permittedCommits).toEqual([]);
    expect(reviewerView.decisionReview?.primaryActionLabel).toBeNull();
    expect(reviewerView.decisionReview?.canDeferItems).toBe(false);
    expect(reviewerView.decisionReview?.canStartDraftPreparation).toBe(false);

    const ordinaryCopy = [
      created.decisionReview?.title,
      created.decisionReview?.courseCheckSummary,
      created.decisionReview?.primaryActionLabel,
      ...(created.decisionReview?.issues.flatMap((issue) => [issue.summary, issue.nextStep]) ?? []),
      ...(created.decisionReview?.effectGroups.map((group) => group.summary) ?? []),
      ...(created.decisionReview?.permittedCommits.flatMap((commit) => [commit.label, commit.effectSummary]) ?? []),
      created.decisionReview?.freshness.label,
      created.decisionReview?.preCommitBoundary,
    ]
      .filter(Boolean)
      .join(" ");
    expect(ordinaryCopy).not.toMatch(
      /plan(?: id| reference)?|digest|revision|manifest|mutation|compensat/i,
    );

    const applied = await applyDecision(created, "cc14-mixed-batch-apply");
    expect(applied.decisionReview).toMatchObject({
      phase: "applied",
      title: "Decision results",
      primaryActionLabel: null,
      result: {
        decisions: { accepted: 1, declined: 1, total: 2 },
        generatedRecords: { totalCreated: 7 },
        unchangedCount: 0,
        drafts: { state: "not_prepared", count: 0, label: "No drafts were prepared." },
        externalCommunication: { emailsSent: 0, label: "No emails were sent." },
      },
    });
  });

  it("classifies and groups exception-first issues without hiding their affected submissions", async () => {
    const created = await createDecision(
      [
        { proposalId: "SUB-PODS0033", outcome: "accepted" },
        { proposalId: "SUB-PODS0034", outcome: "accepted" },
        { proposalId: "SUB-PODS0035", outcome: "declined" },
      ],
      "cc16-grouped-exceptions",
    );
    if (created.body.actionType !== "decision") throw new Error("expected decision plan");
    const [first, second, third] = created.body.items;
    if (!first || !second || !third) throw new Error("expected three decision items");
    const unavailable = {
      id: "suppression-check-unavailable",
      severity: "warning" as const,
      code: "checker_unavailable",
      message: "Delivery suppression status could not be checked.",
      recoveryGuidance: "Review later or continue with the decision only.",
      entityRef: first.proposalId,
    };
    const groupedWarning = {
      id: "readiness-group",
      severity: "warning" as const,
      code: "readiness_tasks",
      message: "Speaker onboarding details are incomplete.",
      recoveryGuidance: "Accept now and complete onboarding later.",
    };
    const detail = {
      id: "decision-only-detail",
      severity: "info" as const,
      code: "decline_no_speakers",
      message: "The declined submission changes only the program decision.",
      entityRef: third.proposalId,
    };
    const body: DecisionPlanBody = {
      ...created.body,
      findings: [
        ...created.body.findings,
        unavailable,
        groupedWarning,
        detail,
      ],
      items: [
        { ...first, findings: [...first.findings, unavailable, groupedWarning] },
        { ...second, findings: [...second.findings, groupedWarning] },
        { ...third, findings: [...third.findings, detail] },
      ],
    };
    const projected = projectCourseCheckForViewer(
      { ...created, body },
      fullAdminProjection,
    )!;

    expect(projected.decisionReview?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          classification: "could_not_check",
          label: "Could not check",
          affectedObjectLabel: expect.stringContaining(first.proposalId),
          consequence: "The check remains unknown; the decision can proceed where policy permits.",
          scope: "This does not block the decision commit.",
          safeAlternativeLabel: "Review later",
          affectedItems: [{ itemId: first.itemId, proposalId: first.proposalId }],
        }),
        expect.objectContaining({
          classification: "check",
          label: "Check",
          affectedItemCount: 2,
          safeAlternativeLabel: "Accept without a draft",
          affectedItems: [
            { itemId: first.itemId, proposalId: first.proposalId },
            { itemId: second.itemId, proposalId: second.proposalId },
          ],
        }),
        expect.objectContaining({
          classification: "details",
          label: "Details",
          affectedObjectLabel: expect.stringContaining(third.proposalId),
        }),
      ]),
    );
    expect(projected.decisionReview?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: first.itemId,
          proposalId: first.proposalId,
          proposedDecision: "Will accept",
          speakerContext: expect.stringContaining(first.speakers[0]!.name),
          decisionReadiness: "Ready",
          draftReadiness: "Could not check",
          batchOutcome: "Will process",
          filter: "check",
        }),
        expect.objectContaining({
          itemId: third.itemId,
          proposalId: third.proposalId,
          proposedDecision: "Will decline",
          decisionReadiness: "Ready",
          batchOutcome: "Will process",
          filter: "ready",
        }),
      ]),
    );
  });

  it("permits safe partial execution but never bypasses blockers within their affected scope", async () => {
    const created = await createDecision(
      [
        { proposalId: "SUB-PODS0036", outcome: "accepted" },
        { proposalId: "SUB-PODS0037", outcome: "declined" },
      ],
      "cc16-safe-partial",
    );
    if (created.body.actionType !== "decision") throw new Error("expected decision plan");
    const [blockedItem, readyItem] = created.body.items;
    if (!blockedItem || !readyItem) throw new Error("expected two decision items");
    const identityBlocker = {
      id: "identity-scope-blocker",
      severity: "blocker" as const,
      code: "identity_ambiguity",
      message: `${blockedItem.proposalId} has an ambiguous speaker identity.`,
      recoveryGuidance: "Resolve the speaker identity or remove this submission from the batch.",
      entityRef: blockedItem.proposalId,
    };
    const body: DecisionPlanBody = {
      ...created.body,
      findings: [identityBlocker],
      items: [
        { ...blockedItem, findings: [identityBlocker] },
        { ...readyItem, findings: [] },
      ],
      stages: created.body.stages.map((stage) =>
        stage.id === "apply-decision" ? { ...stage, status: "blocked" as const } : stage,
      ),
    };
    const projected = projectCourseCheckForViewer(
      { ...created, state: "Needs attention", body },
      fullAdminProjection,
    )!;

    expect(projected.decisionReview).toMatchObject({
      counts: { selected: 2, eligible: 1, needsAction: 1, skipped: 0 },
      partialExecution: {
        eligibleCount: 1,
        skippedCount: 1,
        canExecute: true,
        requiredDeferredItemIds: [blockedItem.itemId],
        primaryActionLabel: "Decline 1 submission; leave 1 unchanged",
        skippedOutcomeLabel: "Leave decision unchanged",
      },
    });
    expect(projected.decisionReview?.permittedCommits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stageId: "apply-decision",
          requiresDeferredItemIds: [blockedItem.itemId],
          label: "Decline 1 submission; leave 1 unchanged",
        }),
      ]),
    );
    expect(projected.decisionReview?.issues[0]).toMatchObject({
      classification: "needs_action",
      scope: `Blocks ${blockedItem.proposalId} only; 1 other submission can proceed.`,
      safeAlternativeLabel: "Leave decision unchanged",
    });

    const secondBlocker = {
      ...identityBlocker,
      id: "integrity-scope-blocker",
      code: "durable_integrity",
      message: `${readyItem.proposalId} has invalid durable scope.`,
      entityRef: readyItem.proposalId,
    };
    const allBlocked = projectCourseCheckForViewer(
      {
        ...created,
        state: "Needs attention",
        body: {
          ...body,
          findings: [identityBlocker, secondBlocker],
          items: [
            body.items[0]!,
            { ...readyItem, findings: [secondBlocker] },
          ],
        },
      },
      fullAdminProjection,
    )!;
    expect(allBlocked.decisionReview).toMatchObject({
      partialExecution: { eligibleCount: 0, canExecute: false },
      primaryActionLabel: null,
    });
    expect(
      allBlocked.decisionReview?.effectGroups.find(
        (group) => group.key === "decisions",
      )?.summary,
    ).toBe("No decisions will be applied.");
  });
});
