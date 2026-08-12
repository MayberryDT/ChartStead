import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CourseCheckPlan } from "../../shared/course-check";
import { MessagesWorkspace } from "../../src/MessagesWorkspace";

afterEach(() => vi.restoreAllMocks());

describe("Messages Outbox handoff", () => {
  it("opens the exact frozen draft set with source, inclusion, prior communication, and no implicit send", async () => {
    const plan = {
      id: "communication-1",
      eventId: "event-1",
      actionType: "communication",
      state: "Complete",
      version: 2,
      digest: "digest",
      createdAt: "2026-08-12T10:00:00.000Z",
      updatedAt: "2026-08-12T10:05:00.000Z",
      createdBy: { id: "admin", displayName: "Ada Admin" },
      approval: null,
      receipt: null,
      body: {
        actionType: "communication",
        subject: "Acceptance update",
        recipientGroups: [{ recipients: [{ selected: true }] }],
        drafts: [{}],
        effects: [],
        deliverySummary: { total: 0, queued: 0, sending: 0, succeeded: 0, retryScheduled: 0, failed: 0, unknown: 0 },
        stageVisibility: { decision: "complete", draft: "complete", send: "ready", delivery: "not_started" },
        compensation: null,
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
          title: "Draft prepared",
          counts: { prepared: 1, omitted: 1, failed: 0, unchanged: 1 },
          noEmailsSent: true,
          statement: "1 draft prepared, 1 recipient omitted, 0 failed, and 1 item unchanged. No emails were sent.",
          preparedAt: "2026-08-12T10:05:00.000Z",
        },
        handoffs: [
          { kind: "outbox", label: "Review 1 draft in Outbox", href: "/e/event-1/messages?planId=communication-1", count: 1 },
          { kind: "submissions", label: "Return to submissions", href: "/e/event-1/submissions", count: 2 },
        ],
        outbox: {
          exactDraftCount: 1,
          sourceLabel: "Prepared from applied decisions",
          groups: [{
            label: "Exact proposal",
            outcome: "accepted",
            draftCount: 1,
            proposalHref: "/e/event-1/submissions/proposal-1",
            sessionHref: "/e/event-1/agenda?sessionIds=session-1",
            recipients: [{
              name: "Exact Speaker",
              address: "exact@example.test",
              inclusion: "include",
              inclusionReason: "Exact Speaker is the primary speaker for this proposal.",
              selected: true,
              draftPrepared: true,
              priorCommunicationCount: 1,
              priorCommunications: [{ status: "sent", subject: "Earlier update", sentAt: "2026-08-01T10:00:00.000Z" }],
            }],
          }],
          draftlessGroups: [{ label: "Draftless proposal", reason: "No deliverable address is available.", proposalHref: "/e/event-1/submissions/proposal-2" }],
        },
        deliveryResult: null,
        sendAction: { stageId: "send-messages", label: "Send 1 message", effectSummary: "Approve and queue exactly 1 frozen message." },
        immutableBoundary: null,
      },
    } as unknown as CourseCheckPlan;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/onboarding")) {
        return new Response(JSON.stringify({ speakers: [], drafts: [] }), { headers: { "content-type": "application/json" } });
      }
      if (url.endsWith("/course-checks")) {
        return new Response(JSON.stringify({ plans: [plan] }), { headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    const open = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MessagesWorkspace eventId="event-1" eventName="Event One" focusedPlanId="communication-1" onOpenCourseCheck={open} />
      </QueryClientProvider>,
    );

    const outbox = await screen.findByRole("region", { name: "Exact Outbox draft set" });
    expect(within(outbox).getByText("Prepared from applied decisions")).toBeVisible();
    expect(within(outbox).getByText("Exact Speaker <exact@example.test>")).toBeVisible();
    expect(within(outbox).getByText(/primary speaker for this proposal/)).toBeVisible();
    expect(within(outbox).getByText(/Earlier update/)).toBeVisible();
    expect(within(outbox).getByRole("heading", { name: "Draftless items" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Send 1 message" })).toBeVisible();
    expect(open).not.toHaveBeenCalled();
  });
});
