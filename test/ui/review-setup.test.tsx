import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EvaluationPlan } from "../../shared/events";
import * as api from "../../src/api";
import {
  SubmissionsCommandBar,
  type ProposalQueueState,
  type ReviewChrome,
} from "../../src/SubmissionsWorkspace";
import { ReviewSetupDialog } from "../../src/ReviewSetupDialog";

const event = {
  id: "pacific-open-data-summit-2026",
  name: "Pacific Open Data Summit 2026",
  startsOn: "2026-10-07",
  endsOn: "2026-10-09",
  timezone: "America/Los_Angeles",
  submissionCount: 12,
  unreviewedCount: 4,
  tracks: [{ id: "platform", name: "Platform", proposalCount: 12 }],
  rooms: [],
};

const principal = {
  id: "admin-1",
  displayName: "Ada Admin",
  email: "ada@example.com",
  role: "admin" as const,
  eventIds: ["pacific-open-data-summit-2026"],
  rolesByEvent: { "pacific-open-data-summit-2026": "admin" as const },
};

const queue: ProposalQueueState = {
  query: "ocean",
  status: "unreviewed",
  track: "platform",
  roundId: "",
  sort: "newest",
};

function planFixture(overrides?: Partial<EvaluationPlan>): EvaluationPlan {
  return {
    eventId: "pacific-open-data-summit-2026",
    enabled: true,
    version: 3,
    updatedAt: "2026-08-14T12:00:00.000Z",
    rounds: [
      {
        id: "round-1",
        name: "Initial review",
        order: 0,
        state: "open",
        startsOn: "2026-08-01",
        endsOn: "2026-08-20",
        scorecardRef: "initial-scorecard",
        reviewerPool: ["rev-1"],
        anonymization: "none",
        anonymized: false,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        scorecard: {
          criteria: [
            {
              id: "overall",
              type: "numeric",
              label: "Overall score",
              guidance: "Rate it",
              required: true,
              weight: 1,
              maxScore: 5,
              options: [],
            },
          ],
          calculationDescription: "Weighted aggregate.",
        },
      },
      {
        id: "round-2",
        name: "Final review",
        order: 1,
        state: "draft",
        startsOn: "2026-08-21",
        endsOn: "2026-09-01",
        scorecardRef: "final-scorecard",
        reviewerPool: [],
        anonymization: "blind",
        anonymized: true,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        scorecard: {
          criteria: [
            {
              id: "fit",
              type: "dropdown",
              label: "Program fit",
              guidance: "",
              required: false,
              weight: 1,
              maxScore: 5,
              options: [{ id: "fit-yes", label: "Yes", score: 5 }],
            },
          ],
          calculationDescription: "Weighted aggregate.",
        },
      },
    ],
    ...overrides,
  };
}

function renderDialog(open = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ReviewSetupDialog eventId={event.id} open={open} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose, client };
}

describe("Review Setup from Submissions", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps Setup review permanent and places Review ledger to its right", async () => {
    const user = userEvent.setup();
    const review: ReviewChrome = {
      open: false,
      onOpen: vi.fn(),
      onSetup: vi.fn(),
    };
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.spyOn(api, "fetchEvaluationPlan").mockResolvedValue({
      plan: null,
      auditEvents: [],
    });

    render(
      <QueryClientProvider client={client}>
        <SubmissionsCommandBar
          event={event}
          principal={principal}
          queue={queue}
          onQueueChange={vi.fn()}
          review={review}
        />
      </QueryClientProvider>,
    );

    const setup = screen.getByRole("button", { name: "Setup review" });
    const ledger = screen.getByRole("button", { name: "Review ledger" });
    expect(setup).toBeVisible();
    expect(ledger).toBeVisible();
    expect(
      setup.compareDocumentPosition(ledger) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.click(setup);
    expect(review.onSetup).toHaveBeenCalled();
  });

  it("keeps the shared track queue as the default and can enable advanced review", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchEvaluationPlan").mockResolvedValue({
      plan: null,
      auditEvents: [],
    });
    vi.spyOn(api, "fetchReviewerAssignments").mockResolvedValue({
      reviewers: [],
      invitations: [],
    });
    const save = vi.spyOn(api, "saveEvaluationPlan").mockResolvedValue({
      plan: planFixture({ version: 1 }),
      auditEvents: [],
    });

    const { onClose } = renderDialog();

    expect(await screen.findByRole("dialog", { name: "Review Setup" })).toBeVisible();
    expect(await screen.findByText("Shared track queue")).toBeVisible();
    expect(screen.queryByRole("tablist", { name: "Evaluation rounds" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Enable advanced review" }));
    expect(await screen.findByRole("tablist", { name: "Evaluation rounds" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Initial review" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Final review" })).toHaveAttribute(
      "aria-selected",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "Save setup" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]?.[1]).toMatchObject({
      enabled: true,
      rounds: expect.arrayContaining([
        expect.objectContaining({ name: "Initial review" }),
        expect.objectContaining({ name: "Final review" }),
      ]),
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("edits one round at a time, expands compact criteria, and saves without queue props", async () => {
    const user = userEvent.setup();
    const plan = planFixture();
    vi.spyOn(api, "fetchEvaluationPlan").mockResolvedValue({
      plan,
      auditEvents: [],
    });
    vi.spyOn(api, "fetchReviewerAssignments").mockResolvedValue({
      reviewers: [
        {
          id: "rev-1",
          name: "Riley Reviewer",
          email: "riley@example.com",
          trackIds: ["platform"],
        },
      ],
      invitations: [],
    });
    const save = vi.spyOn(api, "saveEvaluationPlan").mockImplementation(async (_eventId, input) => ({
      plan: {
        ...plan,
        version: plan.version + 1,
        rounds: input.rounds.map((round, index) => ({
          ...plan.rounds[index]!,
          ...round,
          id: round.id ?? plan.rounds[index]?.id ?? `round-${index + 1}`,
          scorecard: round.scorecard ?? plan.rounds[index]!.scorecard,
        })),
      },
      auditEvents: [],
    }));

    const { onClose } = renderDialog();
    const dialog = await screen.findByRole("dialog", { name: "Review Setup" });
    expect(await within(dialog).findByRole("tab", { name: "Initial review" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(dialog).queryByDisplayValue("Final review")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("tab", { name: "Final review" }));
    expect(within(dialog).getByRole("tab", { name: "Final review" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(dialog).getByDisplayValue("Final review")).toBeVisible();

    const criterionButton = within(dialog).getByRole("button", {
      name: /Program fit/i,
    });
    expect(within(dialog).queryByLabelText("Guidance")).not.toBeInTheDocument();
    await user.click(criterionButton);
    expect(await within(dialog).findByLabelText("Guidance")).toBeVisible();

    await user.clear(within(dialog).getByLabelText("Name"));
    await user.type(within(dialog).getByLabelText("Name"), "Committee pass");
    await user.click(within(dialog).getByRole("button", { name: "Save setup" }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]?.[1].rounds[1]).toMatchObject({
      name: "Committee pass",
      anonymization: "blind",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes without save and leaves the surrounding workspace controls untouched", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchEvaluationPlan").mockResolvedValue({
      plan: planFixture(),
      auditEvents: [],
    });
    vi.spyOn(api, "fetchReviewerAssignments").mockResolvedValue({
      reviewers: [],
      invitations: [],
    });
    const save = vi.spyOn(api, "saveEvaluationPlan");
    const onQueueChange = vi.fn();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const onClose = vi.fn();
    const review: ReviewChrome = { open: true, onOpen: vi.fn(), onSetup: vi.fn() };

    const { rerender } = render(
      <QueryClientProvider client={client}>
        <SubmissionsCommandBar
          event={event}
          principal={principal}
          queue={queue}
          onQueueChange={onQueueChange}
          review={review}
        />
        <ReviewSetupDialog eventId={event.id} open onClose={onClose} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("dialog", { name: "Review Setup" })).toBeVisible();
    expect(await screen.findByRole("tab", { name: "Initial review" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Close review setup" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(save).not.toHaveBeenCalled();
    expect(onQueueChange).not.toHaveBeenCalled();

    rerender(
      <QueryClientProvider client={client}>
        <SubmissionsCommandBar
          event={event}
          principal={principal}
          queue={queue}
          onQueueChange={onQueueChange}
          review={review}
        />
        <ReviewSetupDialog eventId={event.id} open={false} onClose={onClose} />
      </QueryClientProvider>,
    );

    expect(screen.queryByRole("dialog", { name: "Review Setup" })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("ocean")).toBeVisible();
    expect(screen.getByRole("button", { name: "Unreviewed" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Setup review" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Review ledger" })).toBeVisible();
  });

  it("avoids horizontal overflow at a narrow viewport", async () => {
    vi.spyOn(api, "fetchEvaluationPlan").mockResolvedValue({
      plan: planFixture(),
      auditEvents: [],
    });
    vi.spyOn(api, "fetchReviewerAssignments").mockResolvedValue({
      reviewers: [],
      invitations: [],
    });

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    renderDialog();
    const dialog = await screen.findByRole("dialog", { name: "Review Setup" });
    expect(dialog.className).toContain("review-setup-dialog");
    expect(getComputedStyle(dialog).maxHeight).not.toBe("");
  });
});
