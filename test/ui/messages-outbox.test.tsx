import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CourseCheckPlan } from "../../shared/course-check";
import { MessagesWorkspace } from "../../src/MessagesWorkspace";

afterEach(() => vi.restoreAllMocks());

describe("Messages history inspector", () => {
  it("opens focused communication history detail without Course Check chrome", async () => {
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
        bodyText: "Hello speaker,\n\nYour session is confirmed.",
        portalInvitation: false,
        compensation: null,
        recipientGroups: [
          {
            recipients: [
              {
                selected: true,
                deliverability: "ok",
                name: "Exact Speaker",
                email: "exact@example.test",
              },
            ],
          },
        ],
        drafts: [{}],
        effects: [],
        deliverySummary: {
          total: 1,
          queued: 0,
          sending: 0,
          succeeded: 1,
          retryScheduled: 0,
          failed: 0,
          unknown: 0,
        },
        stageVisibility: {
          decision: "complete",
          draft: "complete",
          send: "complete",
          delivery: "complete",
        },
      },
    } as unknown as CourseCheckPlan;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/onboarding")) {
        return new Response(
          JSON.stringify({
            speakers: [
              {
                speakerId: "spk-1",
                name: "Exact Speaker",
                email: "exact@example.test",
                biography: "",
                socialLinks: { linkedin: "", x: "", github: "", website: "" },
                headshotAssetId: null,
                headshotFileName: null,
                participationId: "prt-1",
                titleSnapshot: "Opening keynote",
                organizationSnapshot: "Lab",
                proposalId: null,
                proposalTitle: "Opening keynote",
                role: "confirmed",
                workflowStatus: "ready",
                travelPreferences: "",
                logistics: {},
                openTaskCount: 0,
                overdueCount: 0,
                nextDueAt: null,
                daysUntilNextDue: null,
                readinessFlags: [],
                taskAttachments: [],
                missingWork: [],
                lastContactAt: null,
                lastContactStatus: null,
                history: [],
              },
            ],
            drafts: [],
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (url.endsWith("/course-checks")) {
        return new Response(JSON.stringify({ plans: [plan] }), {
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected request ${url}`);
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MessagesWorkspace
          eventId="event-1"
          eventName="Event One"
          focusedPlanId="communication-1"
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Acceptance update" })).toBeVisible();
    expect(screen.getAllByText("Exact Speaker").length).toBeGreaterThan(0);
    expect(screen.getByText(/Your session is confirmed/)).toBeVisible();
    expect(screen.queryByRole("region", { name: "Exact Outbox draft set" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Send 1 message/i })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "History" })).toBeVisible();
    expect(screen.getByText("Acceptance update")).toBeVisible();
  });
});
