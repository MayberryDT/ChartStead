import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CommunicationReviewProjection } from "../../shared/course-check";
import { CommunicationResultPanel } from "../../src/course-check/CommunicationResultPanel";

const review: CommunicationReviewProjection = {
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
    statement:
      "1 draft prepared, 1 recipient omitted, 0 failed, and 1 item unchanged. No emails were sent.",
    preparedAt: "2026-08-12T10:09:00.000Z",
  },
  handoffs: [
    { kind: "outbox", label: "Review 1 draft in Outbox", href: "/e/event-1/messages?planId=communication-1", count: 1 },
    { kind: "submissions", label: "Return to submissions", href: "/e/event-1/submissions", count: 2 },
    { kind: "sessions", label: "View 1 affected session", href: "/e/event-1/agenda?sessionIds=session-1", count: 1 },
    { kind: "draftless", label: "View 1 draftless item", href: "/e/event-1/messages?planId=communication-1#draftless-items", count: 1 },
  ],
  outbox: {
    exactDraftCount: 1,
    sourceLabel: "Prepared from applied decisions",
    groups: [
      {
        label: "Ready proposal",
        outcome: "accepted",
        draftCount: 1,
        proposalHref: "/e/event-1/submissions/proposal-1",
        sessionHref: "/e/event-1/agenda?sessionIds=session-1",
        recipients: [
          {
            name: "Ready Speaker",
            address: "ready@example.test",
            inclusion: "include",
            inclusionReason: "Primary speaker for Ready proposal.",
            selected: true,
            draftPrepared: true,
            priorCommunicationCount: 1,
            priorCommunications: [
              { status: "sent", subject: "Earlier update", sentAt: "2026-08-01T10:01:00.000Z" },
            ],
          },
        ],
      },
    ],
    draftlessGroups: [
      {
        label: "Draftless proposal",
        reason: "No deliverable address is available.",
        proposalHref: "/e/event-1/submissions/proposal-2",
      },
    ],
  },
  deliveryResult: null,
  sendAction: {
    stageId: "send-messages",
    action: "execute",
    reasonRequired: false,
    label: "Send 1 message",
    effectSummary: "Approve and queue exactly 1 frozen message.",
  },
  immutableBoundary: null,
};

describe("truthful communication result and Outbox handoff", () => {
  it("shows exact durable draft results, progression, routes, and a separate send action", () => {
    const onSend = vi.fn();
    render(
      <CommunicationResultPanel review={review} showOutboxDetails onSend={onSend} />,
    );

    expect(screen.getByRole("heading", { name: "Ready to send" })).toBeVisible();
    expect(screen.getByText(review.draftResult!.statement)).toBeVisible();
    expect(screen.getByText("No emails were sent.", { exact: true })).toBeVisible();
    for (const handoff of review.handoffs) {
      expect(screen.getByRole("link", { name: handoff.label })).toHaveAttribute(
        "href",
        handoff.href,
      );
    }
    const outbox = screen.getByRole("region", { name: "Exact Outbox draft set" });
    expect(within(outbox).getByText("Prepared from applied decisions")).toBeVisible();
    expect(within(outbox).getByText("Primary speaker for Ready proposal.")).toBeVisible();
    expect(within(outbox).getByText(/Earlier update/)).toBeVisible();
    expect(within(outbox).getByRole("heading", { name: "Draftless items" })).toBeVisible();

    screen.getByRole("button", { name: "Send 1 message" }).click();
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("reports exact partial delivery and immutable sent effects", () => {
    render(
      <CommunicationResultPanel
        review={{
          ...review,
          currentStatus: { key: "failed", label: "Failed" },
          progress: [
            ...review.progress.map((step) => ({ ...step, state: "complete" as const })),
            { key: "failed", label: "Failed", state: "attention" },
          ],
          sendAction: null,
          deliveryResult: {
            counts: { succeeded: 2, retrying: 1, failed: 1, unknown: 1, reconciled: 1, corrected: 1 },
            statement: "2 succeeded, 1 retrying, 1 failed, 1 unknown, 1 reconciled, and 1 corrected.",
            effects: [
              { address: "sent@example.test", outcome: "sent", label: "Sent; the frozen message is immutable", attemptCount: 1, corrected: true },
              { address: "unknown@example.test", outcome: "unknown", label: "Provider outcome unknown; reconcile before retrying", attemptCount: 1, corrected: false },
            ],
          },
          immutableBoundary:
            "Sent messages cannot be edited, recalled, or undone. Create a new reviewed correction when follow-up is needed.",
        }}
      />,
    );

    expect(screen.getByText("2 succeeded, 1 retrying, 1 failed, 1 unknown, 1 reconciled, and 1 corrected.")).toBeVisible();
    expect(screen.getByText(/Sent messages cannot be edited, recalled, or undone/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /undo|recall|edit sent/i })).not.toBeInTheDocument();
  });
});
