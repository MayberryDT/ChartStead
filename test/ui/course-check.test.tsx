import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  CommunicationPlanBody,
  CourseCheckPlan,
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

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderCourseCheck() {
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
      initialEntries: [
        "/e/pacific-open-data-summit-2026/course-checks/plan-1",
      ],
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

  it("keeps warning evidence collapsed while exposing its risk in the summary", async () => {
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
    expect(evidence?.open).toBe(false);
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

  it("opens the linked communication workspace immediately after applying a decision", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.endsWith("/course-checks/plan-1")) {
        return jsonResponse(plan);
      }
      if (method === "POST" && url.endsWith("/course-checks/plan-1/apply")) {
        return jsonResponse(appliedPlan);
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

    await user.click(await screen.findByRole("button", { name: "Apply decision" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        "/e/pacific-open-data-summit-2026/course-checks/communication-plan-1",
      );
    });
  });

  it("defers blocked items, applies the remainder, and advances to communication", async () => {
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
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push(`${method} ${url}`);
      if (method === "GET" && url.endsWith("/course-checks/plan-1")) {
        return jsonResponse(blockedPlan);
      }
      if (method === "POST" && url.endsWith("/course-checks/plan-1/defer")) {
        return jsonResponse(deferredPlan);
      }
      if (method === "POST" && url.endsWith("/course-checks/plan-1/apply")) {
        return jsonResponse(partiallyCompletePlan);
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

    await user.click(await screen.findByRole("checkbox", { name: /SUB-BLOCKED/ }));
    await user.type(screen.getByPlaceholderText("Why defer these items?"), "Needs follow-up");
    await user.click(screen.getByRole("button", { name: "Defer to follow-up" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        "/e/pacific-open-data-summit-2026/course-checks/communication-plan-1",
      );
    });
    expect(requests.filter((request) => request.startsWith("POST "))).toEqual([
      "POST /api/events/pacific-open-data-summit-2026/course-checks/plan-1/defer",
      "POST /api/events/pacific-open-data-summit-2026/course-checks/plan-1/apply",
      "POST /api/events/pacific-open-data-summit-2026/course-checks/communications",
    ]);
  });

  it("returns to the submissions queue after freezing communication drafts", async () => {
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

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        "/e/pacific-open-data-summit-2026/submissions",
      );
    });
  });
});
