import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CourseCheckPlan, DecisionItem } from "../../shared/course-check";
import { CourseCheckPage } from "../../src/CourseCheckPage";

const items: DecisionItem[] = [
  {
    itemId: "item-blocked",
    proposalId: "SUB-BLOCKED",
    outcome: "accepted" as const,
    proposalRevision: 1,
    status: "active" as const,
    speakers: [{ plannedId: "speaker-a", role: "primary" as const, name: "Jordan Lee", email: "jordan@example.test", biography: "", match: "create" as const, existingSpeakerId: null }],
    participations: [],
    session: { plannedId: "session-a", title: "Building Reliable Agents", format: "talk", trackId: "platform", roomId: null, startsAt: null, endsAt: null },
    tasks: [],
    portalAccess: [],
    deltas: [],
    findings: [{ id: "identity", severity: "blocker" as const, code: "identity_ambiguity", message: "Jordan's speaker identity is ambiguous.", recoveryGuidance: "Resolve the identity or leave this decision unchanged.", entityRef: "SUB-BLOCKED" }],
  },
  {
    itemId: "item-warning",
    proposalId: "SUB-WARNING",
    outcome: "accepted" as const,
    proposalRevision: 1,
    status: "active" as const,
    speakers: [{ plannedId: "speaker-b", role: "primary" as const, name: "Sam Rivera", email: "sam@example.test", biography: "", match: "create" as const, existingSpeakerId: null }],
    participations: [],
    session: { plannedId: "session-b", title: "Safer Data Imports", format: "talk", trackId: "platform", roomId: null, startsAt: null, endsAt: null },
    tasks: [],
    portalAccess: [],
    deltas: [],
    findings: [{ id: "readiness", severity: "warning" as const, code: "readiness_tasks", message: "Speaker onboarding details are incomplete.", recoveryGuidance: "Accept now and complete onboarding later.", entityRef: "SUB-WARNING" }],
  },
  {
    itemId: "item-ready",
    proposalId: "SUB-READY",
    outcome: "declined" as const,
    proposalRevision: 1,
    status: "active" as const,
    speakers: [],
    participations: [],
    session: null,
    tasks: [],
    portalAccess: [],
    deltas: [],
    findings: [],
  },
  {
    itemId: "item-skipped",
    proposalId: "SUB-SKIPPED",
    outcome: "declined" as const,
    proposalRevision: 1,
    status: "deferred" as const,
    deferralReason: "Chair review required",
    speakers: [],
    participations: [],
    session: null,
    tasks: [],
    portalAccess: [],
    deltas: [],
    findings: [],
  },
];

const proposed = {
  id: "plan-exceptions",
  eventId: "pacific-open-data-summit-2026",
  actionType: "decision",
  state: "Needs attention",
  version: 2,
  digest: "digest-exceptions",
  createdAt: "2026-08-12T10:00:00.000Z",
  updatedAt: "2026-08-12T10:00:00.000Z",
  createdBy: { id: "admin", displayName: "Demo Administrator" },
  approval: null,
  receipt: null,
  body: {
    actionType: "decision",
    proposalId: "SUB-BLOCKED",
    outcome: "accepted",
    proposalRevision: 1,
    speakers: items.flatMap((item) => item.speakers),
    participations: [],
    session: null,
    tasks: [],
    portalAccess: [],
    deltas: [],
    findings: items.flatMap((item) => item.findings),
    stages: [{ id: "apply-decision", label: "Apply decision", status: "blocked", verb: "Apply decision" }],
    airtable: { configured: false, disposition: "removed", summary: "No mapped Airtable writes.", effects: [] },
    items,
    followUpQueue: [],
    evidenceSections: [],
    softWarningOverrides: [],
    aggregateProgress: { total: 4, active: 3, deferred: 1, applied: 0 },
    linkedPlanIds: [],
    parentPlanId: null,
    batchGroupId: "plan-exceptions",
    splitExplanation: null,
    ageWarningHours: 24,
    ageWarning: null,
  },
  decisionReview: {
    kind: "decision_review",
    phase: "proposed",
    title: "Review 4 decisions",
    courseCheckSummary: "Course Check found 1 item that needs attention and 1 warning.",
    counts: { selected: 4, ready: 2, eligible: 2, needsAction: 1, warning: 1, skipped: 1 },
    issues: [
      {
        severity: "blocker",
        classification: "needs_action",
        label: "Needs action",
        summary: "Jordan's speaker identity is ambiguous.",
        affectedObjectLabel: "Building Reliable Agents — Jordan Lee",
        consequence: "The acceptance decision will stay unchanged until the identity is resolved.",
        scope: "Blocks SUB-BLOCKED only; 2 other submissions can proceed.",
        nextStep: "Resolve the speaker identity.",
        safeAlternativeLabel: "Leave decision unchanged",
        affectedItemCount: 1,
        affectedItems: [{ itemId: "item-blocked", proposalId: "SUB-BLOCKED" }],
      },
      {
        severity: "warning",
        classification: "check",
        label: "Check",
        summary: "Speaker onboarding details are incomplete.",
        affectedObjectLabel: "Safer Data Imports — Sam Rivera",
        consequence: "The decision can proceed, but no draft is part of this commit.",
        scope: "This does not block the decision commit.",
        nextStep: "Complete onboarding later.",
        safeAlternativeLabel: "Accept without a draft",
        affectedItemCount: 1,
        affectedItems: [{ itemId: "item-warning", proposalId: "SUB-WARNING" }],
      },
      {
        severity: "warning",
        classification: "could_not_check",
        label: "Could not check",
        summary: "Delivery suppression status could not be checked.",
        affectedObjectLabel: "Safer Data Imports — Sam Rivera",
        consequence: "Delivery suppression status remains unknown.",
        scope: "This does not block the decision commit.",
        nextStep: "Retry the check later.",
        safeAlternativeLabel: "Review later",
        affectedItemCount: 1,
        affectedItems: [{ itemId: "item-warning", proposalId: "SUB-WARNING" }],
      },
      {
        severity: "info",
        classification: "details",
        label: "Details",
        summary: "No email will be sent.",
        affectedObjectLabel: "This decision batch",
        consequence: "No email will be sent.",
        scope: "This does not block the decision commit.",
        nextStep: null,
        safeAlternativeLabel: null,
        affectedItemCount: 1,
        affectedItems: [],
      },
    ],
    items: [
      { itemId: "item-blocked", proposalId: "SUB-BLOCKED", proposalLabel: "Building Reliable Agents", proposedDecision: "Will accept", speakerContext: "Jordan Lee", decisionReadiness: "Needs action", draftReadiness: "Check", batchOutcome: "Will stay unchanged", filter: "needs_action" },
      { itemId: "item-warning", proposalId: "SUB-WARNING", proposalLabel: "Safer Data Imports", proposedDecision: "Will accept", speakerContext: "Sam Rivera", decisionReadiness: "Ready", draftReadiness: "Could not check", batchOutcome: "Will process", filter: "check" },
      { itemId: "item-ready", proposalId: "SUB-READY", proposalLabel: "Community Mapping", proposedDecision: "Will decline", speakerContext: "No speaker records will be created", decisionReadiness: "Ready", draftReadiness: "Not prepared", batchOutcome: "Will process", filter: "ready" },
      { itemId: "item-skipped", proposalId: "SUB-SKIPPED", proposalLabel: "Archive Formats", proposedDecision: "Will decline", speakerContext: "No speaker records will be created", decisionReadiness: "Skipped", draftReadiness: "Skipped", batchOutcome: "Will stay unchanged", filter: "skipped" },
    ],
    effectGroups: [
      { key: "decisions", title: "Decisions", state: "pending", count: 2, summary: "1 submission will be accepted and 1 submission will be declined." },
      { key: "unchanged", title: "Unchanged", state: "unchanged", count: 2, summary: "2 submissions will stay unchanged." },
      { key: "drafts", title: "Drafts", state: "unchanged", count: 0, summary: "No drafts will be prepared." },
      { key: "external_communication", title: "External communication", state: "unchanged", count: 0, summary: "No emails will be sent." },
    ],
    permittedCommits: [{ stageId: "apply-decision", label: "Accept 1 submission and decline 1 submission; leave 2 unchanged", effectSummary: "Two decisions will be applied.", requiresDeferredItemIds: ["item-blocked"] }],
    partialExecution: { eligibleCount: 2, skippedCount: 2, canExecute: true, requiredDeferredItemIds: ["item-blocked"], primaryActionLabel: "Accept 1 submission and decline 1 submission; leave 2 unchanged", skippedOutcomeLabel: "Leave decision unchanged" },
    canDeferItems: true,
    canStartDraftPreparation: true,
    freshness: { state: "current", label: "Checked against current proposal information.", checkedAt: "2026-08-12T10:00:00.000Z" },
    preCommitBoundary: "Nothing has changed. No external communication has been sent.",
    primaryActionLabel: "Accept 1 submission and decline 1 submission; leave 2 unchanged",
    result: null,
  },
} as unknown as CourseCheckPlan;

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
}

function renderReview() {
  const root = createRootRoute({ component: () => <Outlet /> });
  const review = createRoute({ getParentRoute: () => root, path: "/e/$eventId/course-checks/$planId", component: CourseCheckPage });
  const submissions = createRoute({ getParentRoute: () => root, path: "/e/$eventId/submissions", component: () => null, validateSearch: (search: Record<string, unknown>) => search });
  const router = createRouter({ routeTree: root.addChildren([review, submissions]), history: createMemoryHistory({ initialEntries: ["/e/pacific-open-data-summit-2026/course-checks/plan-exceptions"] }) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}

describe("decision exception review", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("prioritizes classified exceptions, keeps consequences visible, and filters selected submissions", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(proposed));
    const { container } = renderReview();

    await screen.findByRole("heading", { name: "Review 4 decisions" });
    const needsAction = screen.getByRole("heading", { name: "Needs action" });
    expect(needsAction.querySelector("[aria-hidden='true']")).toHaveClass(
      "course-check-classification-icon",
    );
    const whatWillHappen = screen.getByRole("heading", { name: "What will happen" });
    expect(needsAction.compareDocumentPosition(whatWillHappen) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Building Reliable Agents — Jordan Lee")).toBeVisible();
    expect(screen.getByText("The acceptance decision will stay unchanged until the identity is resolved.")).toBeVisible();
    expect(screen.getByText("Blocks SUB-BLOCKED only; 2 other submissions can proceed.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Leave decision unchanged" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "Check" }).querySelector("[aria-hidden='true']"))
      .toHaveClass("course-check-classification-icon");
    expect(screen.getByRole("heading", { name: "Could not check" }).querySelector("[aria-hidden='true']"))
      .toHaveClass("course-check-classification-icon");
    const details = screen.getByText("Details");
    expect(details).toBeVisible();
    expect(details.querySelector("[aria-hidden='true']")).toHaveClass(
      "course-check-classification-icon",
    );

    const selected = screen.getByRole("region", { name: "Selected submissions" });
    expect(within(selected).getByRole("columnheader", { name: "Proposed decision" })).toBeVisible();
    expect(within(selected).getByText("Sam Rivera")).toBeVisible();
    await user.click(within(selected).getByRole("button", { name: "Ready" }));
    expect(within(selected).getByText("Community Mapping")).toBeVisible();
    expect(within(selected).queryByText("Building Reliable Agents")).not.toBeInTheDocument();
    await user.click(within(selected).getByRole("button", { name: "Skipped" }));
    expect(within(selected).getByText("Archive Formats")).toBeVisible();
    expect(container).not.toHaveTextContent("Defer");
  });

  it("offers one exact partial action and persistently reports every outcome class", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(proposed));
    renderReview();

    expect(await screen.findByRole("button", { name: "Accept 1 submission and decline 1 submission; leave 2 unchanged" })).toBeEnabled();
    expect(screen.getByText("2 eligible · 2 will stay unchanged")).toBeVisible();

    const applied = structuredClone(proposed) as unknown as CourseCheckPlan & { decisionReview: NonNullable<CourseCheckPlan["decisionReview"]> };
    applied.state = "Partially complete";
    applied.decisionReview.phase = "applied";
    applied.decisionReview.result = {
      title: "Decision results",
      summary: "2 submissions were processed. 2 submissions were unchanged.",
      decisions: { accepted: 1, declined: 1, total: 2 },
      generatedRecords: { speakersCreated: 0, speakersReused: 0, participationsCreated: 0, sessionsCreated: 0, tasksCreated: 0, portalAccessCreated: 0, totalCreated: 0 },
      unchangedCount: 2,
      drafts: { state: "not_prepared", count: 0, label: "No drafts were prepared." },
      externalCommunication: { emailsSent: 0, label: "No emails were sent." },
      outcomeCounts: { processed: 2, failed: 1, warned: 1, skipped: 2, unchanged: 2 },
      appliedAt: "2026-08-12T10:05:00.000Z",
      appliedBy: "Demo Administrator",
    };
    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(applied));
    cleanup();
    renderReview();

    const results = await screen.findByRole("region", { name: "Decision results" });
    expect(within(results).getByRole("heading", { name: "Results" })).toHaveFocus();
    expect(within(results).getByText("2 processed")).toBeVisible();
    expect(within(results).getByText("1 failed")).toBeVisible();
    expect(within(results).getByText("1 warned")).toBeVisible();
    expect(within(results).getByText("2 skipped")).toBeVisible();
    expect(within(results).getByText("2 unchanged")).toBeVisible();
  });

  it("keeps a long shared activity history exact and responsive", async () => {
    const user = userEvent.setup();
    const withHistory = structuredClone(proposed) as CourseCheckPlan;
    withHistory.activity = Array.from({ length: 120 }, (_, index) => ({
      id: `activity-${index + 1}`,
      at: new Date(Date.UTC(2026, 7, 12, 10, index)).toISOString(),
      role: index % 2 === 0 ? "approver" as const : "executor" as const,
      kind: "volume_acceptance",
      summary: `Recorded exact activity ${index + 1} of 120`,
      actor: { id: "admin", displayName: "Demo Administrator" },
      planId: withHistory.id,
      planVersion: index + 1,
      outcome: index % 2 === 0 ? "approved" : "applied",
    }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(withHistory));

    const startedAt = performance.now();
    renderReview();
    await user.click(await screen.findByText("History and audit details"));
    const activity = await screen.findByRole("region", { name: "Shared activity" });
    expect(performance.now() - startedAt).toBeLessThan(2_000);
    expect(within(activity).getAllByRole("listitem")).toHaveLength(120);
    expect(within(activity).getByText(/Recorded exact activity 1 of 120/)).toBeVisible();
    expect(within(activity).getByText(/Recorded exact activity 120 of 120/)).toBeVisible();
  });
});
