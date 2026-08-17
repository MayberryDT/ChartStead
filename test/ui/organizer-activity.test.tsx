import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EventRecord, OnboardingBoard } from "../../shared/events";
import { OnboardingWorkspace } from "../../src/OnboardingWorkspace";
import { SettingsWorkspace } from "../../src/SettingsWorkspace";
import * as api from "../../src/api";

const eventId = "pacific-open-data-summit-2026";

const event: EventRecord = {
  id: eventId,
  name: "Pacific Open Data Summit 2026",
  startsOn: "2026-09-10",
  endsOn: "2026-09-12",
  timezone: "America/Los_Angeles",
  submissionCount: 1,
  unreviewedCount: 1,
  rooms: [{ id: "hall-a", name: "Hall A", readiness: "ready" }],
  tracks: [{ id: "platform", name: "Platform", proposalCount: 1 }],
};

function renderSettings() {
  const rootRoute = createRootRoute({ component: Outlet });
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/e/$eventId/settings",
    component: () => <SettingsWorkspace event={event} />,
  });
  const submissionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/e/$eventId/submissions/$proposalId",
    component: () => <div>Proposal</div>,
  });
  const speakersRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/e/$eventId/speakers",
    component: () => <div>Speakers</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([settingsRoute, submissionsRoute, speakersRoute]),
    history: createMemoryHistory({
      initialEntries: [`/e/${eventId}/settings`],
    }),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const board: OnboardingBoard = {
  eventId,
  drafts: [],
  speakers: [
    {
      speakerId: "sp-history",
      name: "Ada History",
      email: "ada.history@example.test",
      biography: "History biography",
      participationId: "prt-history",
      titleSnapshot: "Staff Engineer",
      organizationSnapshot: "Analytical Engines",
      proposalId: null,
      proposalTitle: null,
      role: "invited",
      workflowStatus: "confirmed",
      travelPreferences: "",
      logistics: {},
      openTaskCount: 0,
      overdueCount: 0,
      nextDueAt: null,
      daysUntilNextDue: null,
      readinessFlags: [],
      missingWork: [],
      lastContactAt: null,
      lastContactStatus: null,
      history: [
        {
          id: "hist-1",
          speakerId: "sp-history",
          taskId: "task-1",
          assetId: null,
          type: "task_completed",
          summary: "Marked employer approval done",
          actorId: "admin-1",
          actorName: "Ada Admin",
          createdAt: "2026-08-17T12:00:00.000Z",
        },
      ],
    },
  ],
};

describe("Course Check 24 — activity by actor and onboarding attribution", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "listEventApiKeys").mockResolvedValue({ apiKeys: [] });
    vi.spyOn(api, "fetchCourseCheckPolicy").mockResolvedValue({
      requireTwoPersonApproval: false,
      requireDistinctApprover: false,
      requireReasonOnApprove: false,
      maxAgentMode: "propose_only",
    } as Awaited<ReturnType<typeof api.fetchCourseCheckPolicy>>);
    vi.spyOn(api, "fetchAirtableSync").mockResolvedValue({
      sync: {
        health: "unconfigured",
        configured: false,
        hasAccessToken: false,
        lastPullAt: null,
        lastSuccessAt: null,
        lastError: null,
        guidance: "Connect Airtable in Settings.",
        pendingChangeCount: 0,
        baseId: null,
      },
    });
    vi.spyOn(api, "fetchReviewerAssignments").mockResolvedValue({
      reviewers: [],
      invitations: [],
    });
    vi.spyOn(api, "fetchEvaluationPlan").mockResolvedValue({
      plan: null,
      auditEvents: [],
    } as Awaited<ReturnType<typeof api.fetchEvaluationPlan>>);
  });

  it("shows team activity for a chosen member in Settings → Activity", async () => {
    const user = userEvent.setup();
    const actors = [
      {
        id: "admin-1",
        name: "Ada Admin",
        email: "ada@example.test",
        role: "admin" as const,
      },
      {
        id: "rev-1",
        name: "Grace Reviewer",
        email: "grace@example.test",
        role: "reviewer" as const,
      },
    ];
    const activity = vi.spyOn(api, "fetchOrganizerActivityByActor").mockImplementation(
      async (_id, actorId) => ({
        actorId: actorId ?? null,
        actor: actorId ? (actors.find((member) => member.id === actorId) ?? null) : null,
        actors,
        limit: 50,
        hasMore: false,
        entries:
          actorId === "admin-1"
            ? [
                {
                  id: "audit_events:audit-1",
                  source: "audit_events" as const,
                  domain: "proposal" as const,
                  type: "proposal.review.changed",
                  label: "Recommend",
                  summary: "Harbor charts",
                  proposalId: "SUB-1",
                  proposalTitle: "Harbor charts",
                  actorId: "admin-1",
                  actorName: "Ada Admin",
                  fromStatus: "unreviewed",
                  toStatus: "approve",
                  committeeNoteChanged: false,
                  createdAt: "2026-08-17T12:00:00.000Z",
                },
                {
                  id: "onboarding_history:hist-1",
                  source: "onboarding_history" as const,
                  domain: "onboarding" as const,
                  type: "task_completed",
                  label: "Task completed",
                  summary: "Completed onboarding task for Nora",
                  speakerId: "sp-1",
                  speakerName: "Nora",
                  actorId: "admin-1",
                  actorName: "Ada Admin",
                  createdAt: "2026-08-17T12:30:00.000Z",
                },
                {
                  id: "audit_events:audit-2",
                  source: "audit_events" as const,
                  domain: "course_check" as const,
                  type: "course_check.decision.applied",
                  label: "Accepted",
                  summary: "Compiler ops",
                  proposalId: "SUB-2",
                  proposalTitle: "Compiler ops",
                  actorId: "admin-1",
                  actorName: "Ada Admin",
                  fromStatus: "approve",
                  toStatus: "accepted",
                  committeeNoteChanged: false,
                  createdAt: "2026-08-17T13:00:00.000Z",
                },
              ]
            : [],
      }),
    );

    renderSettings();

    await user.click(await screen.findByRole("button", { name: /^Activity$/i }));
    expect(await screen.findByRole("heading", { name: "Activity" })).toBeVisible();

    await waitFor(() => {
      expect(activity).toHaveBeenCalled();
    });

    expect(await screen.findByRole("link", { name: "Harbor charts" })).toHaveAttribute(
      "href",
      `/e/${eventId}/submissions/SUB-1`,
    );
    expect(screen.getByText("Recommend")).toBeVisible();
    expect(screen.getByRole("link", { name: "Compiler ops" })).toHaveAttribute(
      "href",
      `/e/${eventId}/submissions/SUB-2`,
    );
    expect(screen.getByText("Accepted")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Completed onboarding task for Nora" }),
    ).toHaveAttribute("href", `/e/${eventId}/speakers`);
    expect(screen.getByText("Task completed")).toBeVisible();

    await user.click(screen.getByRole("combobox", { name: "Team member" }));
    await user.click(await screen.findByRole("option", { name: "Grace Reviewer" }));
    expect(await screen.findByRole("status")).toHaveTextContent("No activity.");
  });

  it("surfaces actor names on speaker onboarding history", async () => {
    vi.spyOn(api, "fetchOnboardingBoard").mockResolvedValue(board);
    vi.spyOn(api, "fetchOnboardingReminderPolicy").mockResolvedValue({
      enabled: false,
      mode: "draft",
      dueWindowDays: 0,
      suppressWithinHours: 72,
      unattendedSendAuthorized: false,
      updatedAt: null,
      updatedById: null,
      updatedByName: null,
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <OnboardingWorkspace eventId={eventId} />
      </QueryClientProvider>,
    );

    expect((await screen.findAllByText("Ada History")).length).toBeGreaterThan(0);
    const historySummary = await screen.findByText("History");
    const details = historySummary.closest("details");
    expect(details).toBeTruthy();
    const panel = within(details as HTMLElement);
    expect(await panel.findByText("Marked employer approval done")).toBeVisible();
    expect(panel.getByText("by Ada Admin")).toBeVisible();
  });
});
