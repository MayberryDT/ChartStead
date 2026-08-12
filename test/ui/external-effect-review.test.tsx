import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExternalEffectReviewProjection } from "../../shared/course-check";
import { ExternalEffectReviewPanel } from "../../src/CourseCheckPage";

afterEach(() => cleanup());

const review: ExternalEffectReviewProjection = {
  kind: "external_effect_review",
  family: "publication",
  phase: "proposed",
  title: "Publish 12 sessions to the attendee program",
  summary: "12 sessions will be attendee-facing; 2 will stay internal.",
  attentionCount: 2,
  issues: [
    {
      classification: "check",
      label: "Check",
      summary: "Two sessions overlap for one speaker.",
      affectedObjectLabel: "Building Reliable Agents and Safer Imports",
      consequence: "Publishing unchanged makes this overlap attendee-facing.",
      actions: [
        {
          id: "open-session",
          label: "Open affected session",
          kind: "repair",
          target: { type: "route", href: "/e/event-1/agenda?session=session-1" },
          resultingEffectSummary: "Open the working session.",
        },
        {
          id: "override-conflict",
          label: "Record reasoned override",
          kind: "override",
          target: {
            type: "command",
            command: "record_reasoned_override",
            entityIds: ["conflict-1"],
          },
          resultingEffectSummary: "Keep the warning on the receipt.",
        },
      ],
    },
    {
      classification: "could_not_check",
      label: "Could not check",
      summary: "The Airtable provider outcome is unknown.",
      affectedObjectLabel: "Session session-1",
      consequence: "Internal work remains committed; only the mirror is uncertain.",
      actions: [],
    },
  ],
  effectGroups: [
    {
      key: "publication",
      title: "Attendee program",
      state: "pending",
      count: 12,
      summary: "Publish 12 sessions to the attendee program",
      details: ["Building Reliable Agents: add", "Safer Imports: time, room"],
      providerDetails: [],
    },
    {
      key: "calendar",
      title: "Calendar follow-up",
      state: "pending",
      count: 3,
      summary: "3 calendar operations open separately; nothing is sent by publication.",
      details: ["Update Building Reliable Agents · Auditorium"],
      providerDetails: ["UID stable-1@example.test · sequence 3"],
    },
    {
      key: "airtable",
      title: "Airtable records",
      state: "unknown",
      count: 1,
      summary: "One optional mirror outcome is unknown.",
      details: ["Update session session-1 in Sessions"],
      providerDetails: ["update Sessions/rec-1 · unknown"],
    },
  ],
  permittedActions: [
    {
      stageId: "publish-program",
      label: "Publish 12 sessions to the attendee program",
      effectSummary: "12 attendee-facing sessions; communication remains separate.",
    },
  ],
  integrationActions: [
    {
      action: "reconcile",
      label: "Reconcile unknown writes",
      effectSummary: "Check the provider before retrying.",
    },
    {
      action: "deferred",
      label: "Defer Airtable",
      effectSummary: "Internal work stays committed.",
    },
  ],
  primaryActionLabel: "Publish 12 sessions to the attendee program",
  result: null,
};

describe("ExternalEffectReviewPanel", () => {
  it("shows business consequences and keeps provider detail behind disclosure", async () => {
    const user = userEvent.setup();
    render(<ExternalEffectReviewPanel review={review} />);

    expect(
      screen.getByRole("heading", {
        name: "Publish 12 sessions to the attendee program",
      }),
    ).toBeVisible();
    expect(screen.getByText("2 need attention")).toBeVisible();
    expect(screen.getByText("Publishing unchanged makes this overlap attendee-facing.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open affected session" })).toHaveAttribute(
      "href",
      "/e/event-1/agenda?session=session-1",
    );
    expect(screen.queryByText(/UID stable-1/)).not.toBeVisible();

    const calendar = screen.getByText("Calendar follow-up").closest("details");
    expect(calendar).not.toBeNull();
    await user.click(within(calendar!).getByText("Calendar follow-up"));
    await user.click(within(calendar!).getByText("Provider details"));
    expect(within(calendar!).getByText(/UID stable-1/)).toBeVisible();
  });

  it("dispatches only declared issue and integration actions and preserves qualified results", async () => {
    const user = userEvent.setup();
    const onIssueAction = vi.fn();
    const onIntegrationAction = vi.fn();
    const completed: ExternalEffectReviewProjection = {
      ...review,
      family: "communication",
      phase: "needs_attention",
      title: "Recover delivery for 2 people",
      result: {
        state: "needs_attention",
        summary: "8 of 10 deliveries succeeded; 1 failed and 1 has an unknown outcome.",
        processed: 10,
        succeeded: 8,
        failed: 1,
        unknown: 1,
        compensated: 0,
      },
    };
    render(
      <ExternalEffectReviewPanel
        review={completed}
        onIssueAction={onIssueAction}
        onIntegrationAction={onIntegrationAction}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Record reasoned override" }));
    await user.click(screen.getByRole("button", { name: "Reconcile unknown writes" }));

    expect(onIssueAction).toHaveBeenCalledWith(review.issues[0]!.actions[1]);
    expect(onIntegrationAction).toHaveBeenCalledWith("reconcile");
    expect(
      screen.getByText(
        "8 of 10 deliveries succeeded; 1 failed and 1 has an unknown outcome.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/^Done$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Complete$/)).not.toBeInTheDocument();
  });
});
