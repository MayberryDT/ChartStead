import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  CommunicationPlanBody,
  CourseCheckPlan,
  DecisionReviewProjection,
  DecisionPlanBody,
} from "../../shared/course-check";
import { CourseCheckPage } from "../../src/CourseCheckPage";

const warning = {
  id: "warning-unplaced",
  severity: "warning" as const,
  code: "session_unplaced",
  message: "The session will be created without a room or time.",
  recoveryGuidance: "Place the session after the decision is applied.",
};

const body: DecisionPlanBody = {
  actionType: "decision",
  proposalId: "SUB-PODS0001",
  outcome: "accepted",
  proposalRevision: 2,
  speakers: [],
  participations: [],
  session: null,
  tasks: [],
  portalAccess: [],
  deltas: [
    {
      entityType: "session",
      action: "create",
      proposalId: "SUB-PODS0001",
      summary: "Create one unplaced session.",
    },
  ],
  findings: [warning],
  stages: [
    { id: "apply-decision", label: "Apply decision", status: "ready", verb: "Apply decision" },
    { id: "write-airtable", label: "Write to Airtable", status: "pending", verb: "Write to Airtable", external: true },
  ],
  airtable: {
    configured: false,
    disposition: "active",
    summary: "1 mapped Airtable write requires separate approval.",
    effects: [
      {
        id: "air-plan-1-session-session-with-a-long-stable-identifier",
        planId: "plan-1",
        planVersion: 1,
        kind: "session",
        chartsteadId: "session-with-a-long-stable-identifier-that-must-not-collapse",
        tableName: "Sessions",
        operation: "create",
        fields: {
          "ChartStead Session ID": "session-with-a-long-stable-identifier-that-must-not-collapse",
          Title: "A complete speaker profile",
        },
        beforeFields: null,
        providerRecordId: null,
        state: "pending",
        attemptCount: 0,
        lastError: null,
        nextAttemptAt: null,
        compensatesEffectId: null,
      },
    ],
  },
  items: [
    {
      itemId: "item-1",
      proposalId: "SUB-PODS0001",
      outcome: "accepted",
      proposalRevision: 2,
      status: "active",
      speakers: [],
      participations: [],
      session: null,
      tasks: [],
      portalAccess: [],
      deltas: [],
      findings: [warning],
    },
  ],
  followUpQueue: [],
  evidenceSections: [
    {
      kind: "operational",
      title: "Operational warnings",
      defaultExpanded: true,
      summary: "One session needs later placement.",
      findingIds: [warning.id],
      deltaIndexes: [0],
    },
  ],
  softWarningOverrides: [],
  aggregateProgress: { total: 1, active: 1, deferred: 0, applied: 0 },
  linkedPlanIds: [],
  parentPlanId: null,
  batchGroupId: null,
  splitExplanation: null,
  ageWarningHours: 24,
  ageWarning: null,
};

const plan: CourseCheckPlan = {
  id: "plan-1",
  eventId: "pacific-open-data-summit-2026",
  actionType: "decision",
  state: "Ready",
  version: 1,
  digest: "digest-1",
  createdAt: "2026-08-11T12:00:00.000Z",
  updatedAt: "2026-08-11T12:00:00.000Z",
  createdBy: { id: "admin-1", displayName: "Demo Administrator" },
  body,
  approval: null,
  receipt: null,
  mutations: [],
};

const proposedDecisionReview = {
  kind: "decision_review",
  phase: "proposed",
  title: "Review 1 acceptance decision",
  courseCheckSummary: "Course Check found 1 warning.",
  counts: { selected: 1, ready: 1, eligible: 1, needsAction: 0, warning: 1, skipped: 0 },
  issues: [
    {
      severity: "warning",
      classification: "check",
      label: "Check",
      summary: warning.message,
      affectedObjectLabel: body.proposalId,
      consequence: warning.message,
      scope: "This does not block the decision commit.",
      nextStep: warning.recoveryGuidance,
      safeAlternativeLabel: "Accept without a draft",
      affectedItemCount: 1,
      affectedItems: [{ itemId: body.items[0]!.itemId, proposalId: body.proposalId }],
      actions: [
        {
          id: "warning-unplaced:deep-repair",
          label: "Change session placement",
          kind: "deep_repair",
          target: {
            type: "route",
            href: "/e/pacific-open-data-summit-2026/submissions/SUB-PODS0001?field=sessionPlacement",
            objectType: "proposal",
            objectId: "SUB-PODS0001",
            field: "sessionPlacement",
          },
          affectedEntityIds: ["SUB-PODS0001"],
          resultingEffectSummary: "The decision review will recheck this submission.",
        },
        {
          id: "warning-unplaced:acknowledge",
          label: "Keep session unplaced",
          kind: "acknowledge",
          target: { type: "command", command: "acknowledge_warning", itemIds: ["item-1"] },
          affectedEntityIds: ["SUB-PODS0001"],
          resultingEffectSummary: "The decision can proceed with placement still pending.",
        },
        {
          id: "warning-unplaced:exclude",
          label: "Skip this submission",
          kind: "exclude",
          target: { type: "command", command: "defer_items", itemIds: ["item-1"] },
          affectedEntityIds: ["SUB-PODS0001"],
          resultingEffectSummary: "This submission will stay unchanged and move to follow-up.",
        },
      ],
    },
  ],
  items: [
    {
      itemId: body.items[0]!.itemId,
      proposalId: body.proposalId,
      proposalLabel: body.proposalId,
      proposedDecision: "Will accept",
      speakerContext: "No speaker records will be created",
      decisionReadiness: "Ready",
      draftReadiness: "Check",
      batchOutcome: "Will process",
      filter: "check",
    },
  ],
  revalidation: {
    scope: "affected_dependencies",
    affectedItemIds: [] as string[],
    changedInputs: [] as Array<{
      label: string;
      affectedEntityIds: string[];
      target: null;
    }>,
    preservedStageIds: [] as string[],
  },
  effectGroups: [
    {
      key: "decisions",
      title: "Decisions",
      state: "pending",
      count: 1,
      summary: "1 submission will be accepted.",
    },
    {
      key: "records",
      title: "Generated records",
      state: "pending",
      count: 0,
      summary: "No related records will be created.",
    },
    {
      key: "drafts",
      title: "Drafts",
      state: "unchanged",
      count: 0,
      summary: "No drafts will be prepared.",
    },
    {
      key: "external_communication",
      title: "External communication",
      state: "unchanged",
      count: 0,
      summary: "No emails will be sent.",
    },
  ],
  permittedCommits: [
    {
      stageId: "apply-decision",
      label: "Accept 1 submission",
      effectSummary: "1 submission will be accepted.",
    },
  ],
  partialExecution: {
    eligibleCount: 1,
    skippedCount: 0,
    canExecute: true,
    requiredDeferredItemIds: [],
    primaryActionLabel: "Accept 1 submission",
    skippedOutcomeLabel: "Leave decision unchanged",
  },
  canDeferItems: true,
  canStartDraftPreparation: true,
  freshness: {
    state: "current",
    label: "Checked against current proposal information.",
    checkedAt: plan.updatedAt,
  },
  preCommitBoundary: "Nothing has changed. No external communication has been sent.",
  primaryActionLabel: "Accept 1 submission",
  result: null,
} as const;

const projectedPlan = {
  ...plan,
  decisionReview: proposedDecisionReview,
} as CourseCheckPlan & { decisionReview: typeof proposedDecisionReview };

const appliedPlan: CourseCheckPlan = {
  ...plan,
  state: "Complete",
  body: {
    ...body,
    items: body.items.map((item) => ({ ...item, status: "applied" as const })),
    aggregateProgress: { total: 1, active: 0, deferred: 0, applied: 1 },
  },
  approval: {
    stageId: "apply-decision",
    planVersion: 1,
    digest: plan.digest,
    actor: plan.createdBy,
    approvedAt: "2026-08-11T12:01:00.000Z",
  },
  receipt: {
    id: "receipt-1",
    planId: plan.id,
    planVersion: 1,
    digest: plan.digest,
    stageId: "apply-decision",
    appliedAt: "2026-08-11T12:01:00.000Z",
    actor: plan.createdBy,
  },
};

const projectedAppliedPlan = {
  ...appliedPlan,
  decisionReview: {
    ...proposedDecisionReview,
    phase: "applied",
    title: "Acceptance decision applied",
    effectGroups: [
      {
        key: "decisions",
        title: "Decisions",
        state: "applied",
        count: 1,
        summary: "1 submission was accepted.",
      },
      {
        key: "records",
        title: "Generated records",
        state: "applied",
        count: 0,
        summary: "No related records were created.",
      },
      {
        key: "drafts",
        title: "Drafts",
        state: "unchanged",
        count: 0,
        summary: "No drafts were prepared.",
      },
      {
        key: "external_communication",
        title: "External communication",
        state: "unchanged",
        count: 0,
        summary: "No emails were sent.",
      },
    ],
    permittedCommits: [],
    preCommitBoundary: null,
    primaryActionLabel: null,
    result: {
      title: "Acceptance decision applied",
      summary: "1 submission was accepted.",
      decisions: { accepted: 1, declined: 0, total: 1 },
      generatedRecords: {
        speakersCreated: 0,
        speakersReused: 0,
        participationsCreated: 0,
        sessionsCreated: 0,
        tasksCreated: 0,
        portalAccessCreated: 0,
        totalCreated: 0,
      },
      unchangedCount: 0,
      drafts: { state: "not_prepared", count: 0, label: "No drafts were prepared." },
      externalCommunication: { emailsSent: 0, label: "No emails were sent." },
      outcomeCounts: { processed: 1, failed: 0, warned: 1, skipped: 0, unchanged: 0 },
      appliedAt: appliedPlan.receipt!.appliedAt,
      appliedBy: appliedPlan.createdBy.displayName,
    },
  },
} as const;

const communicationBody: CommunicationPlanBody = {
  actionType: "communication",
  source: {
    kind: "linked_decision",
    decisionPlanId: plan.id,
    decisionPlanVersion: 1,
    decisionPlanDigest: plan.digest,
    selection: null,
  },
  purpose: "decision",
  templateKind: "acceptance",
  subject: "Your session has been accepted",
  bodyText: "Hello,\n\nWe are pleased to accept your session.",
  bodyHtml: "<p>Hello,</p><p>We are pleased to accept your session.</p>",
  recipientGroups: [],
  recipients: [],
  drafts: [],
  effects: [],
  deliverySummary: {
    total: 0,
    queued: 0,
    sending: 0,
    succeeded: 0,
    retryScheduled: 0,
    failed: 0,
    unknown: 0,
  },
  calendarOps: [],
  deltas: [],
  findings: [],
  stages: [
    { id: "create-drafts", label: "Create drafts", status: "ready", verb: "Create drafts" },
  ],
  airtable: { configured: false, disposition: "removed", summary: "No mapped Airtable writes.", effects: [] },
  evidenceSections: [],
  softWarningOverrides: [],
  stageVisibility: {
    decision: "complete",
    draft: "ready",
    send: "not_started",
    delivery: "not_started",
  },
  linkedPlanIds: [plan.id],
  parentPlanId: plan.id,
  compensation: null,
  batchGroupId: null,
  splitExplanation: null,
  relevantRevisions: {
    proposalIds: [body.proposalId],
    proposalRevisions: { [body.proposalId]: body.proposalRevision },
    speakerEmails: [],
    contentFingerprint: "content-1",
  },
  ageWarningHours: 24,
  ageWarning: null,
};

const communicationPlan: CourseCheckPlan = {
  ...plan,
  id: "communication-plan-1",
  actionType: "communication",
  state: "Ready",
  digest: "communication-digest-1",
  body: communicationBody,
  approval: null,
  receipt: null,
};

const frozenCommunicationPlan: CourseCheckPlan = {
  ...communicationPlan,
  state: "Complete",
  body: {
    ...communicationBody,
    stages: [
      { id: "create-drafts", label: "Create drafts", status: "complete", verb: "Create drafts" },
      { id: "send-messages", label: "Send messages", status: "ready", verb: "Send messages", external: true },
    ],
    stageVisibility: { ...communicationBody.stageVisibility, draft: "complete", send: "ready" },
    drafts: [{
      draftId: "draft-1", groupId: "group-1", proposalId: body.proposalId,
      sessionId: "session-1", toEmail: "speaker@example.test", recipientName: "Example Speaker",
      subject: communicationBody.subject, bodyText: communicationBody.bodyText,
      bodyHtml: communicationBody.bodyHtml, attachmentRefs: [], calendarIntent: null,
      status: "frozen", frozenAt: "2026-08-11T12:02:00.000Z", frozenPlanVersion: 1,
    }],
  },
  communicationReview: {
    kind: "communication_review",
    currentStatus: { key: "ready_to_send", label: "Ready to send" },
    progress: [
      { key: "no_draft", label: "No draft", state: "complete" },
      { key: "draft_prepared", label: "Draft prepared", state: "complete" },
      { key: "ready_to_send", label: "Ready to send", state: "current" },
      { key: "sending", label: "Sending", state: "pending" },
    ],
    draftResult: {
      title: "Draft prepared", counts: { prepared: 1, omitted: 0, failed: 0, unchanged: 0 },
      noEmailsSent: true,
      statement: "1 draft prepared, 0 recipients omitted, 0 failed, and 0 items unchanged. No emails were sent.",
      preparedAt: "2026-08-11T12:02:00.000Z",
    },
    handoffs: [{ kind: "outbox", label: "Review 1 draft in Outbox", href: "/e/pacific-open-data-summit-2026/messages?planId=communication-plan-1", count: 1 }],
    outbox: { exactDraftCount: 1, sourceLabel: "Prepared from applied decisions", groups: [], draftlessGroups: [] },
    deliveryResult: null,
    sendAction: { stageId: "send-messages", action: "endorse", reasonRequired: true, label: "Endorse send of 1 message", effectSummary: "Approve exactly 1 frozen message." },
    immutableBoundary: null,
  },
  sharedApproval: {
    kind: "shared_approval",
    currentStage: {
      stageId: "send-messages", label: "Send messages", status: "ready", canExecute: false,
      canEndorse: true, canRequestApproval: false,
      availableCommit: { stageId: "send-messages", label: "Send messages", effectSummary: "Send messages" },
      requiredApproverCount: 2, requiredEndorsementCount: 1, endorsementCount: 0,
      distinctApproverRequired: true, reasonRequired: true,
      stateSummary: "Send messages is ready for your endorsement.",
      nextAction: "Endorse this exact review with a reason; a different authorized administrator can then execute it.",
    },
    resume: { selectionCount: 1, planVersion: 1, completedStageIds: ["create-drafts"], outstandingIssueCount: 0, activityCount: 0 },
    freshness: { state: "current", changedInputs: [], affectedStageIds: [], preservedStageIds: ["create-drafts"], nextAction: "Continue with send messages when the review is ready." },
  },
};

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderCourseCheck(initialEntry = "/e/pacific-open-data-summit-2026/course-checks/plan-1") {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const courseCheckRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/e/$eventId/course-checks/$planId",
    component: CourseCheckPage,
  });
  const submissionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/e/$eventId/submissions",
    component: () => null,
    validateSearch: (search: Record<string, unknown>) => search,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([courseCheckRoute, submissionsRoute]),
    history: createMemoryHistory({
      initialEntries: [initialEntry],
    }),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, router };
}

describe("Course Check review workspace", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not nest the organizer shell grid inside the page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(plan), {
        headers: { "content-type": "application/json" },
      }),
    );
    const { container } = renderCourseCheck();

    await screen.findByRole("heading", { name: "Shared decision workspace" });
    const main = container.querySelector("main.course-check-page");
    expect(main).not.toHaveClass("app");
  });

  it("uses the business review projection and keeps internal plan machinery out of ordinary copy", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(projectedPlan));
    const { container } = renderCourseCheck();

    expect(
      await screen.findByRole("heading", { name: "Review 1 acceptance decision" }),
    ).toBeVisible();
    expect(screen.getByText("Nothing has changed. No external communication has been sent.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Accept 1 submission" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: /Will accept/ })).toBeVisible();
    expect(container).not.toHaveTextContent("Plan reference");
    expect(container).not.toHaveTextContent("Version");
    expect(container).not.toHaveTextContent("Mutation history");
    expect(container).not.toHaveTextContent(plan.id.slice(0, 8));
    expect(container).not.toHaveTextContent(plan.digest);
  });

  it("keeps shared approval and exact stale recovery visible without exposing technical evidence in task copy", async () => {
    const policyPlan = {
      ...projectedPlan,
      state: "Out of date" as const,
      sharedApproval: {
        kind: "shared_approval" as const,
        currentStage: {
          stageId: "apply-decision",
          label: "Apply decision",
          status: "out_of_date" as const,
          canExecute: false,
          canEndorse: false,
          canRequestApproval: true,
          availableCommit: { stageId: "apply-decision", label: "Accept 1 submission", effectSummary: "Accept the selected submission." },
          requiredApproverCount: 2,
          requiredEndorsementCount: 1,
          endorsementCount: 0,
          distinctApproverRequired: true,
          reasonRequired: true,
          stateSummary: "This stage needs review because proposal evidence changed.",
          nextAction: "Refresh this decision stage, then ask another authorized administrator to endorse it with a reason.",
        },
        resume: {
          selectionCount: 1,
          planVersion: 2,
          completedStageIds: ["create-drafts"],
          outstandingIssueCount: 1,
          activityCount: 2,
        },
        freshness: {
          state: "out_of_date" as const,
          changedInputs: ["Review decision for SUB-PODS0001 changed"],
          affectedStageIds: ["apply-decision"],
          preservedStageIds: ["create-drafts"],
          nextAction: "Refresh the decision review before approving apply-decision.",
        },
        technicalDetails: {
          planId: plan.id,
          planVersion: 2,
          digest: plan.digest,
          sourceRevisions: ["SUB-PODS0001 revision 2"],
          policyRules: ["Two authorized people", "Different approver", "Approval reason required"],
        },
      },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(policyPlan));
    const { container } = renderCourseCheck();

    const approval = await screen.findByRole("region", { name: "Stage approval" });
    expect(approval).toBeVisible();
    expect(screen.getByText("0 of 1 endorsements recorded")).toBeVisible();
    expect(screen.getByText("A different approver is required")).toBeVisible();
    expect(screen.getByText("An approval reason is required")).toBeVisible();
    expect(screen.getByText("Review decision for SUB-PODS0001 changed")).toBeVisible();
    expect(screen.getByText("create-drafts remains complete")).toBeVisible();
    expect(within(approval).getByRole("status")).toHaveTextContent(
      "Refresh the decision review before approving apply-decision.",
    );
    expect(screen.getByRole("button", { name: "Accept 1 submission" })).toBeDisabled();
    const technical = screen.getByText("Technical details").closest("details");
    expect(technical).not.toBeNull();
    expect(technical).not.toHaveAttribute("open");
    expect(technical).toHaveTextContent("digest-1");
    expect(container.querySelector(".course-check-stage-task-copy")).not.toHaveTextContent(
      "digest-1",
    );
    const announcementText = Array.from(
      container.querySelectorAll<HTMLElement>("[role='status'], [aria-live]"),
    )
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    expect(new Set(announcementText).size).toBe(announcementText.length);
  });

  it.each([
    {
      name: "accepted",
      outcomes: ["accepted"] as const,
      title: "Review 1 acceptance decision",
      action: "Accept 1 submission, create 1 session, link 1 speaker record, and create 2 onboarding tasks",
      decisionText: "1 accepted · 0 denied",
    },
    {
      name: "declined",
      outcomes: ["declined"] as const,
      title: "Review 1 denial decision",
      action: "Deny 1 submission",
      decisionText: "0 accepted · 1 denied",
    },
    {
      name: "mixed",
      outcomes: ["accepted", "declined"] as const,
      title: "Review 2 decisions",
      action: "Accept 1 submission, deny 1 submission, create 1 session, link 1 speaker record, and create 2 onboarding tasks",
      decisionText: "1 accepted · 1 denied",
    },
  ])("uses the compact clean fast path for a $name decision batch", async ({ outcomes, title, action, decisionText }) => {
    const speaker = {
      plannedId: "speaker-1",
      role: "primary" as const,
      name: "Alex Rivera",
      email: "alex@example.test",
      biography: "Data practitioner",
      match: "reuse" as const,
      existingSpeakerId: "speaker-existing-1",
    };
    const session = {
      plannedId: "session-1",
      title: "Open data in practice",
      format: "talk",
      trackId: "platform",
      roomId: null,
      startsAt: null,
      endsAt: null,
    };
    const acceptedItem = {
      ...body.items[0]!,
      itemId: "item-accepted",
      proposalId: "SUB-ACCEPTED",
      outcome: "accepted" as const,
      speakers: [speaker],
      session,
      tasks: [
        { plannedId: "task-1", title: "Add biography", kind: "biography", speakerPlannedId: speaker.plannedId },
        { plannedId: "task-2", title: "Add headshot", kind: "headshot", speakerPlannedId: speaker.plannedId },
      ],
      findings: [],
    };
    const declinedItem = {
      ...body.items[0]!,
      itemId: "item-declined",
      proposalId: "SUB-DECLINED",
      outcome: "declined" as const,
      speakers: [],
      session: null,
      tasks: [],
      findings: [],
    };
    const items = outcomes.map((outcome) =>
      outcome === "accepted" ? acceptedItem : declinedItem,
    );
    const accepted = outcomes.filter((outcome) => outcome === "accepted").length;
    const declined = outcomes.length - accepted;
    const cleanPlan = {
      ...plan,
      body: {
        ...body,
        outcome: outcomes[0],
        speakers: accepted ? [speaker] : [],
        session: accepted ? session : null,
        tasks: accepted ? acceptedItem.tasks : [],
        findings: [],
        items,
        evidenceSections: [],
        aggregateProgress: { total: items.length, active: items.length, deferred: 0, applied: 0 },
        airtable: { configured: false, disposition: "removed", summary: "No mapped Airtable writes.", effects: [] },
      },
      decisionReview: {
        ...proposedDecisionReview,
        items: [...proposedDecisionReview.items],
        partialExecution: {
          ...proposedDecisionReview.partialExecution,
          requiredDeferredItemIds: [...proposedDecisionReview.partialExecution.requiredDeferredItemIds],
        },
        title,
        courseCheckSummary: "Course Check found no issues.",
        counts: { selected: items.length, ready: items.length, eligible: items.length, needsAction: 0, warning: 0, skipped: 0 },
        issues: [],
        effectGroups: proposedDecisionReview.effectGroups.map((group) =>
          group.key === "decisions"
            ? { ...group, count: items.length, summary: `${accepted} accepted and ${declined} denied.` }
            : group.key === "records"
              ? { ...group, count: accepted ? 5 : 0 }
              : group,
        ),
        primaryActionLabel: action,
        permittedCommits: [{ stageId: "apply-decision", label: action, effectSummary: "Exact decision effects." }],
      },
    } satisfies CourseCheckPlan;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(cleanPlan));
    const { container } = renderCourseCheck();

    expect(await screen.findByRole("heading", { name: title })).toBeVisible();
    expect(screen.getByRole("dialog", { name: title })).toBeVisible();
    expect(screen.getByText(decisionText)).toBeVisible();
    expect(screen.getByText(`${accepted} ${accepted === 1 ? "session" : "sessions"}`)).toBeVisible();
    expect(screen.getByText(`${accepted} ${accepted === 1 ? "speaker record or link" : "speaker records or links"}`)).toBeVisible();
    expect(screen.getByText(`${accepted * 2} onboarding tasks`)).toBeVisible();
    expect(screen.getByText("0 communication drafts")).toBeVisible();
    expect(screen.getByText("0 external effects")).toBeVisible();
    expect(screen.getAllByText("Course Check found no issues.")).toHaveLength(1);
    expect(screen.getByRole("button", { name: action })).toBeEnabled();
    expect(screen.getByRole("heading", { name: title })).toHaveFocus();
    expect(container.querySelectorAll("details")).toHaveLength(0);
    expect(container).not.toHaveTextContent("Selected decisions");
    expect(container).not.toHaveTextContent("Prioritized issues");
  });

  it("keeps issue-free but interaction-complex decision work in the full workspace", async () => {
    const cleanButComplex = {
      ...projectedPlan,
      body: { ...body, findings: [], items: body.items.map((item) => ({ ...item, findings: [] })) },
      decisionReview: {
        ...proposedDecisionReview,
        items: [...proposedDecisionReview.items],
        partialExecution: {
          ...proposedDecisionReview.partialExecution,
          requiredDeferredItemIds: [...proposedDecisionReview.partialExecution.requiredDeferredItemIds],
        },
        courseCheckSummary: "Course Check found no issues.",
        counts: { selected: 1, ready: 1, eligible: 1, needsAction: 0, warning: 0, skipped: 0 },
        issues: [],
        effectGroups: [...proposedDecisionReview.effectGroups],
        permittedCommits: [...proposedDecisionReview.permittedCommits],
      } as DecisionReviewProjection,
    } satisfies CourseCheckPlan;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(cleanButComplex));
    renderCourseCheck();

    await screen.findByRole("heading", { name: "Review 1 acceptance decision" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Review summary" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Write to Airtable" })).toBeVisible();
  });

  it("cancels to the originating submissions filters without applying anything", async () => {
    const cleanPlan = {
      ...projectedPlan,
      body: {
        ...body,
        findings: [],
        items: body.items.map((item) => ({ ...item, findings: [] })),
        airtable: { configured: false, disposition: "removed", summary: "No mapped Airtable writes.", effects: [] },
      },
      decisionReview: {
        ...proposedDecisionReview,
        items: [...proposedDecisionReview.items],
        partialExecution: {
          ...proposedDecisionReview.partialExecution,
          requiredDeferredItemIds: [...proposedDecisionReview.partialExecution.requiredDeferredItemIds],
        },
        courseCheckSummary: "Course Check found no issues.",
        counts: { selected: 1, ready: 1, eligible: 1, needsAction: 0, warning: 0, skipped: 0 },
        issues: [],
        effectGroups: [...proposedDecisionReview.effectGroups],
        permittedCommits: [...proposedDecisionReview.permittedCommits],
      } as DecisionReviewProjection,
    } satisfies CourseCheckPlan;
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      requests.push(`${init?.method ?? "GET"} ${String(input)}`);
      return jsonResponse(cleanPlan);
    });
    const user = userEvent.setup();
    const { router } = renderCourseCheck(
      "/e/pacific-open-data-summit-2026/course-checks/plan-1?q=data&status=unreviewed&track=platform&sort=oldest",
    );

    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(router.state.location.pathname).toBe("/e/pacific-open-data-summit-2026/submissions");
    expect(router.state.location.search).toMatchObject({
      q: "data",
      status: "unreviewed",
      track: "platform",
      sort: "oldest",
    });
    expect(
      requests.filter(
        (request) => request.startsWith("POST ") && !request.endsWith("/ux-events"),
      ),
    ).toHaveLength(0);
  });

  it("expands warning evidence by default and surfaces risk in the summary", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(plan), {
        headers: { "content-type": "application/json" },
      }),
    );
    const { container } = renderCourseCheck();

    await screen.findByRole("heading", { name: "Shared decision workspace" });
    const evidence = container.querySelector<HTMLDetailsElement>(
      'details.course-check-evidence[data-kind="operational"]',
    );
    // Spec: warnings/unknowns expand automatically; clean sections stay collapsed.
    expect(evidence?.open).toBe(true);
    expect(evidence?.querySelector("summary")).toHaveTextContent("1 warning");
  });

  it("renders Airtable writes as collapsed disclosures with intact stable IDs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(plan), {
        headers: { "content-type": "application/json" },
      }),
    );
    const { container } = renderCourseCheck();

    await screen.findByRole("heading", { name: "Write to Airtable" });
    const effect = container.querySelector<HTMLDetailsElement>(
      "details.course-check-airtable-effect",
    );
    expect(effect?.open).toBe(false);
    expect(effect).toHaveTextContent(
      "session-with-a-long-stable-identifier-that-must-not-collapse",
    );
  });

  it("keeps the truthful decision receipt visible and leaves draft creation separate", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.endsWith("/course-checks/plan-1")) {
        return jsonResponse(projectedPlan);
      }
      if (method === "POST" && url.endsWith("/course-checks/plan-1/apply")) {
        return jsonResponse(projectedAppliedPlan);
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    const { router } = renderCourseCheck();

    await user.click(await screen.findByRole("button", { name: "Accept 1 submission" }));

    expect(await screen.findByRole("heading", { name: "Acceptance decision applied" })).toBeVisible();
    expect(screen.getByText("1 submission was accepted.")).toBeVisible();
    expect(screen.getByText("No drafts were prepared.")).toBeVisible();
    expect(screen.getByText("No emails were sent.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Prepare communication drafts" })).toBeEnabled();
    expect(router.state.location.pathname).toBe(
      "/e/pacific-open-data-summit-2026/course-checks/plan-1",
    );
  });

  it("advances from an applied decision into editable message preparation in the same workspace", async () => {
    const user = userEvent.setup();
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push(`${method} ${url}`);
      if (method === "GET" && url.endsWith("/course-checks/plan-1")) {
        return jsonResponse(projectedAppliedPlan);
      }
      if (method === "POST" && url.endsWith("/course-checks/communications")) {
        return jsonResponse(communicationPlan, 201);
      }
      if (method === "GET" && url.endsWith("/course-checks/communication-plan-1")) {
        return jsonResponse(communicationPlan);
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    const { router } = renderCourseCheck();

    await user.click(
      await screen.findByRole("button", { name: "Prepare communication drafts" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Prepare acceptance messages" }),
    ).toBeVisible();
    expect(screen.getByText("Decision applied")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Subject" })).toHaveValue(
      communicationBody.subject,
    );
    expect(screen.getByRole("button", { name: "Create drafts" })).toBeEnabled();
    expect(router.state.location.pathname).toBe(
      "/e/pacific-open-data-summit-2026/course-checks/plan-1",
    );
    expect(
      requests.filter(
        (request) => request.startsWith("POST ") && !request.endsWith("/ux-events"),
      ),
    ).toEqual([
      "POST /api/events/pacific-open-data-summit-2026/course-checks/communications",
    ]);
  });

  it("reloads and shares the exact connected stage without changing the root workspace", async () => {
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push(`${method} ${url}`);
      if (method === "GET" && url.endsWith("/course-checks/communication-plan-1")) {
        return jsonResponse(communicationPlan);
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    const { router } = renderCourseCheck(
      "/e/pacific-open-data-summit-2026/course-checks/plan-1?stage=communication-plan-1",
    );

    expect(
      await screen.findByRole("heading", { name: "Prepare acceptance messages" }),
    ).toBeVisible();
    expect(screen.getByText("Decision applied")).toBeVisible();
    expect(router.state.location.pathname).toBe(
      "/e/pacific-open-data-summit-2026/course-checks/plan-1",
    );
    expect(router.state.location.search).toMatchObject({
      stage: "communication-plan-1",
    });
    expect(requests.filter((request) => !request.endsWith("/ux-events"))).toEqual([
      "GET /api/events/pacific-open-data-summit-2026/course-checks/communication-plan-1",
    ]);
  });

  it("keeps communication exceptions inside the connected review and limits them to drafts", async () => {
    const missingFinding = {
      id: "finding-missing",
      severity: "warning" as const,
      code: "recipient_missing_address",
      message: "Example Speaker has no email address.",
      recoveryGuidance: "Add a deliverable address or exclude this recipient before creating drafts.",
      entityRef: "recipient-missing",
    };
    const issuePlan: CourseCheckPlan = {
      ...communicationPlan,
      state: "Needs attention",
      body: {
        ...communicationBody,
        findings: [missingFinding],
        recipientGroups: [
          {
            groupId: "group-missing",
            proposalId: body.proposalId,
            sessionId: null,
            label: "A complete speaker profile",
            outcome: "accepted",
            recipients: [
              {
                recipientId: "recipient-missing",
                address: "",
                name: "Example Speaker",
                role: "primary",
                speakerId: null,
                inclusion: "missing",
                inclusionReason: "No deliverable address is available.",
                deliverability: "missing",
                selected: false,
                priorCommunications: [],
              },
            ],
          },
        ],
      },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(issuePlan));
    renderCourseCheck(
      "/e/pacific-open-data-summit-2026/course-checks/plan-1?stage=communication-plan-1",
    );

    expect(await screen.findByRole("heading", { name: "Message issues" })).toBeVisible();
    expect(screen.getByText(/Applied decisions and internal records stay committed/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Correct speaker email" })).toHaveAttribute(
      "href",
      expect.stringContaining("field=speakerEmail"),
    );
    expect(screen.getByText("No draft will be created for this recipient.")).toBeVisible();
  });

  it("keeps a clean fast-path receipt persistent without implicitly drafting or sending", async () => {
    const cleanBody: DecisionPlanBody = {
      ...body,
      findings: [],
      items: body.items.map((item) => ({ ...item, findings: [] })),
      evidenceSections: [],
      airtable: { configured: false, disposition: "removed", summary: "No mapped Airtable writes.", effects: [] },
    };
    const cleanProposed: CourseCheckPlan = {
      ...plan,
      body: cleanBody,
      decisionReview: {
        ...proposedDecisionReview,
        items: [...proposedDecisionReview.items],
        partialExecution: {
          ...proposedDecisionReview.partialExecution,
          requiredDeferredItemIds: [...proposedDecisionReview.partialExecution.requiredDeferredItemIds],
        },
        courseCheckSummary: "Course Check found no issues.",
        counts: { selected: 1, ready: 1, eligible: 1, needsAction: 0, warning: 0, skipped: 0 },
        issues: [],
        effectGroups: [...proposedDecisionReview.effectGroups],
        permittedCommits: [...proposedDecisionReview.permittedCommits],
      },
    };
    const cleanApplied: CourseCheckPlan = {
      ...appliedPlan,
      body: {
        ...cleanBody,
        items: cleanBody.items.map((item) => ({ ...item, status: "applied" as const })),
        aggregateProgress: { total: 1, active: 0, deferred: 0, applied: 1 },
      },
      decisionReview: {
        ...projectedAppliedPlan.decisionReview,
        items: [...projectedAppliedPlan.decisionReview.items],
        partialExecution: {
          ...projectedAppliedPlan.decisionReview.partialExecution,
          requiredDeferredItemIds: [...projectedAppliedPlan.decisionReview.partialExecution.requiredDeferredItemIds],
        },
        courseCheckSummary: "Course Check found no issues.",
        counts: { selected: 1, ready: 0, eligible: 0, needsAction: 0, warning: 0, skipped: 0 },
        issues: [],
        effectGroups: [...projectedAppliedPlan.decisionReview.effectGroups],
        permittedCommits: [],
      },
    };
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push(`${method} ${url}`);
      if (method === "GET") return jsonResponse(cleanProposed);
      if (method === "POST" && url.endsWith("/course-checks/plan-1/apply")) {
        return jsonResponse(cleanApplied);
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    const user = userEvent.setup();
    renderCourseCheck();

    await user.click(await screen.findByRole("button", { name: "Accept 1 submission" }));

    expect(await screen.findByRole("heading", { name: "Acceptance decision applied" })).toBeVisible();
    expect(screen.getByText("1 submission was accepted.")).toBeVisible();
    expect(screen.getByText(/No drafts were prepared\. No emails were sent\./)).toBeVisible();
    expect(screen.getByRole("button", { name: "Return to submissions" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Prepare communication drafts" })).toBeEnabled();
    expect(
      requests.filter(
        (request) => request.startsWith("POST ") && !request.endsWith("/ux-events"),
      ),
    ).toEqual([
      "POST /api/events/pacific-open-data-summit-2026/course-checks/plan-1/apply",
    ]);
  });

  it("renders only declared issue actions and completes safe repair choices inline", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(projectedPlan));
    renderCourseCheck();

    const deepRepair = await screen.findByRole("link", { name: "Fix" });
    expect(deepRepair).toHaveAttribute(
      "href",
      expect.stringContaining("/submissions/SUB-PODS0001?field=sessionPlacement"),
    );
    expect(screen.queryByRole("button", { name: /fix|resolve|manage/i })).not.toBeInTheDocument();

    await user.click(
      document.querySelector(
        '[data-issue-action-id="warning-unplaced:acknowledge"]',
      ) as HTMLButtonElement,
    );
    const acknowledgement = screen.getByText(
      "Acknowledged: The decision can proceed with placement still pending.",
    );
    expect(acknowledgement).toBeVisible();
    expect(acknowledgement).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByRole("checkbox", { name: /SUB-PODS0001/ })).toBeChecked();
    expect(screen.getByPlaceholderText("Why defer these items?")).toHaveFocus();
  });

  it("defers blocked batch items and keeps the partial result truthful", async () => {
    const user = userEvent.setup();
    const blocker = {
      id: "missing-authority",
      severity: "blocker" as const,
      code: "missing_authority",
      message: "One decision needs follow-up.",
      recoveryGuidance: "Defer it and continue with the remaining decision.",
    };
    const blockedBody: DecisionPlanBody = {
      ...body,
      proposalId: "SUB-BLOCKED",
      findings: [blocker, warning],
      items: [
        { ...body.items[0]!, itemId: "blocked-item", proposalId: "SUB-BLOCKED", findings: [blocker] },
        { ...body.items[0]!, itemId: "ready-item", proposalId: "SUB-READY", findings: [warning] },
      ],
      aggregateProgress: { total: 2, active: 2, deferred: 0, applied: 0 },
    };
    const blockedPlan: CourseCheckPlan = {
      ...plan,
      state: "Needs attention",
      body: blockedBody,
    };
    const projectedBlockedPlan = {
      ...blockedPlan,
      decisionReview: {
        ...proposedDecisionReview,
        title: "Review 2 acceptance decisions",
        counts: { selected: 2, ready: 1, eligible: 1, needsAction: 1, warning: 1, skipped: 0 },
        issues: [
          {
            severity: "blocker",
            classification: "needs_action",
            label: "Needs action",
            summary: blocker.message,
            affectedObjectLabel: "SUB-BLOCKED",
            consequence: "The decision will stay unchanged.",
            scope: "Blocks SUB-BLOCKED only; 1 other submission can proceed.",
            nextStep: blocker.recoveryGuidance,
            safeAlternativeLabel: "Leave decision unchanged",
            affectedItemCount: 1,
            affectedItems: [{ itemId: "blocked-item", proposalId: "SUB-BLOCKED" }],
          },
        ],
        items: [
          { ...proposedDecisionReview.items[0], itemId: "blocked-item", proposalId: "SUB-BLOCKED", proposalLabel: "SUB-BLOCKED", decisionReadiness: "Needs action", batchOutcome: "Will stay unchanged", filter: "needs_action" },
          { ...proposedDecisionReview.items[0], itemId: "ready-item", proposalId: "SUB-READY", proposalLabel: "SUB-READY" },
        ],
        permittedCommits: [{
          stageId: "apply-decision",
          label: "Accept 1 submission; leave 1 unchanged",
          effectSummary: "1 submission will be accepted. 1 submission will stay unchanged.",
          requiresDeferredItemIds: ["blocked-item"],
        }],
        partialExecution: {
          eligibleCount: 1,
          skippedCount: 1,
          canExecute: true,
          requiredDeferredItemIds: ["blocked-item"],
          primaryActionLabel: "Accept 1 submission; leave 1 unchanged",
          skippedOutcomeLabel: "Leave decision unchanged",
        },
        canDeferItems: true,
        primaryActionLabel: "Accept 1 submission; leave 1 unchanged",
        effectGroups: proposedDecisionReview.effectGroups.map((group) =>
          group.key === "decisions"
            ? { ...group, count: 2, summary: "2 submissions will be accepted." }
            : group,
        ),
      },
    } as const;
    const deferredBody: DecisionPlanBody = {
      ...blockedBody,
      findings: [warning],
      items: [
        { ...blockedBody.items[0]!, status: "deferred", deferralReason: "Needs follow-up" },
        blockedBody.items[1]!,
      ],
      aggregateProgress: { total: 2, active: 1, deferred: 1, applied: 0 },
    };
    const deferredPlan: CourseCheckPlan = {
      ...blockedPlan,
      state: "Ready",
      version: 2,
      digest: "digest-2",
      body: deferredBody,
    };
    const partiallyCompletePlan: CourseCheckPlan = {
      ...appliedPlan,
      state: "Partially complete",
      version: 2,
      digest: "digest-2",
      body: {
        ...deferredBody,
        items: deferredBody.items.map((item) =>
          item.status === "active" ? { ...item, status: "applied" as const } : item,
        ),
        aggregateProgress: { total: 2, active: 0, deferred: 1, applied: 1 },
      },
    };
    const projectedPartiallyCompletePlan = {
      ...partiallyCompletePlan,
      decisionReview: {
        ...projectedAppliedPlan.decisionReview,
        title: "Acceptance decision applied",
        counts: { selected: 2, ready: 0, eligible: 0, needsAction: 0, warning: 0, skipped: 1 },
        result: {
          ...projectedAppliedPlan.decisionReview.result,
          summary: "1 submission was accepted. 1 submission was unchanged.",
          decisions: { accepted: 1, declined: 0, total: 1 },
          unchangedCount: 1,
          outcomeCounts: { processed: 1, failed: 0, warned: 1, skipped: 1, unchanged: 1 },
        },
      },
    } as const;
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push(`${method} ${url}`);
      if (method === "GET" && url.endsWith("/course-checks/plan-1")) {
        return jsonResponse(projectedBlockedPlan);
      }
      if (method === "POST" && url.endsWith("/course-checks/plan-1/defer")) {
        return jsonResponse(deferredPlan);
      }
      if (method === "POST" && url.endsWith("/course-checks/plan-1/apply")) {
        return jsonResponse(projectedPartiallyCompletePlan);
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    const { router } = renderCourseCheck();

    expect(
      await screen.findByRole("heading", { name: "Review 2 acceptance decisions" }),
    ).toBeVisible();
    expect(screen.getByText("2 submissions will be accepted.")).toBeVisible();
    await user.click(
      screen.getByRole("button", {
        name: "Accept 1 submission; leave 1 unchanged",
      }),
    );

    expect(await screen.findByText("1 submission was accepted. 1 submission was unchanged.")).toBeVisible();
    expect(screen.getByText("No emails were sent.")).toBeVisible();
    expect(router.state.location.pathname).toBe(
      "/e/pacific-open-data-summit-2026/course-checks/plan-1",
    );
    expect(
      requests.filter(
        (request) => request.startsWith("POST ") && !request.endsWith("/ux-events"),
      ),
    ).toEqual([
      "POST /api/events/pacific-open-data-summit-2026/course-checks/plan-1/defer",
      "POST /api/events/pacific-open-data-summit-2026/course-checks/plan-1/apply",
    ]);
  });

  it("continues directly to the send stage after freezing communication drafts", async () => {
    const user = userEvent.setup();
    const frozenPlan: CourseCheckPlan = {
      ...communicationPlan,
      state: "Complete",
      body: {
        ...communicationBody,
        stageVisibility: { ...communicationBody.stageVisibility, draft: "complete" },
        drafts: [
          {
            draftId: "draft-1",
            groupId: "group-1",
            proposalId: body.proposalId,
            sessionId: null,
            toEmail: "speaker@example.test",
            recipientName: "Example Speaker",
            subject: communicationBody.subject,
            bodyText: communicationBody.bodyText,
            bodyHtml: communicationBody.bodyHtml,
            attachmentRefs: [],
            calendarIntent: null,
            status: "frozen",
            frozenAt: "2026-08-11T12:02:00.000Z",
            frozenPlanVersion: 1,
          },
        ],
      },
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.endsWith("/course-checks/plan-1")) {
        return jsonResponse(communicationPlan);
      }
      if (method === "POST" && url.endsWith("/course-checks/communication-plan-1/create-drafts")) {
        return jsonResponse(frozenPlan);
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    const { router } = renderCourseCheck();

    await user.click(await screen.findByRole("button", { name: "Create drafts" }));

    expect(await screen.findByRole("button", { name: "Send messages" })).toBeEnabled();
    expect(router.state.location.pathname).toBe(
      "/e/pacific-open-data-summit-2026/course-checks/plan-1",
    );
  });

  it("keeps the exact draft result and Outbox handoff visible after draft creation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(frozenCommunicationPlan));
    renderCourseCheck(
      "/e/pacific-open-data-summit-2026/course-checks/plan-1?stage=communication-plan-1",
    );

    expect(await screen.findByRole("heading", { name: "Ready to send" })).toBeVisible();
    expect(screen.getByText(frozenCommunicationPlan.communicationReview!.draftResult!.statement)).toBeVisible();
    expect(screen.getByRole("link", { name: "Review 1 draft in Outbox" })).toHaveAttribute(
      "href",
      "/e/pacific-open-data-summit-2026/messages?planId=communication-plan-1",
    );
    expect(screen.getAllByText("No emails were sent.", { exact: true }).length).toBeGreaterThan(0);
  });

  it("requires an approval reason and reports endorsement without claiming delivery started", async () => {
    const endorsedPlan: CourseCheckPlan = {
      ...frozenCommunicationPlan,
      state: "Needs review",
      sharedApproval: {
        ...frozenCommunicationPlan.sharedApproval!,
        currentStage: {
          ...frozenCommunicationPlan.sharedApproval!.currentStage,
          canEndorse: false,
          canRequestApproval: true,
          endorsementCount: 1,
          stateSummary: "Send messages is waiting for a different authorized administrator.",
        },
      },
      communicationReview: {
        ...frozenCommunicationPlan.communicationReview!,
        sendAction: null,
      },
    };
    let postedBody: Record<string, unknown> | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if ((init?.method ?? "GET") === "POST" && String(input).endsWith("/send")) {
        postedBody = JSON.parse(String(init?.body));
        return jsonResponse(endorsedPlan);
      }
      if ((init?.method ?? "GET") === "POST") return jsonResponse({ ok: true }, 202);
      return jsonResponse(frozenCommunicationPlan);
    });
    const user = userEvent.setup();
    renderCourseCheck("/e/pacific-open-data-summit-2026/course-checks/communication-plan-1");

    const send = await screen.findByRole("button", { name: "Endorse send of 1 message" });
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText("Approval reason"), "Reviewed frozen recipients");
    expect(send).toBeEnabled();
    await user.click(send);

    expect(await screen.findByText(/Endorsement recorded/)).toBeVisible();
    expect(screen.queryByText(/Delivery intent is durable/)).not.toBeInTheDocument();
    expect(postedBody).toMatchObject({ reason: "Reviewed frozen recipients" });
  });
});
