import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CourseCheckPlan, DecisionPlanBody } from "../../shared/course-check";
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
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
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
});
