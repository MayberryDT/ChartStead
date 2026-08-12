import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OnboardingBoard } from "../../shared/events";
import { OnboardingWorkspace } from "../../src/OnboardingWorkspace";
import * as api from "../../src/api";

const eventId = "pacific-open-data-summit-2026";
const board: OnboardingBoard = {
  eventId,
  drafts: [],
  speakers: [
    {
      speakerId: "sp-ready",
      name: "Ada Ready",
      email: "ada.ready@example.test",
      biography: "Ready biography",
      participationId: "prt-ready",
      titleSnapshot: "Staff Engineer",
      organizationSnapshot: "Analytical Engines",
      proposalId: null,
      proposalTitle: null,
      role: "invited",
      openTaskCount: 0,
      overdueCount: 0,
      nextDueAt: null,
      daysUntilNextDue: null,
      readinessFlags: [],
      missingWork: [],
      lastContactAt: null,
      lastContactStatus: null,
      history: [],
    },
    {
      speakerId: "sp-open",
      name: "Grace Outstanding",
      email: "grace.outstanding@example.test",
      biography: "Outstanding biography",
      participationId: "prt-open",
      titleSnapshot: "Rear Admiral",
      organizationSnapshot: "Navy",
      proposalId: "SUB-1",
      proposalTitle: "Compiler Operations",
      role: "primary",
      openTaskCount: 2,
      overdueCount: 1,
      nextDueAt: "2026-08-01T00:00:00.000Z",
      daysUntilNextDue: -11,
      readinessFlags: ["employer_approval"],
      missingWork: [
        {
          taskId: "task-1",
          title: "Employer approval",
          dueAt: "2026-08-01T00:00:00.000Z",
          daysUntilDue: -11,
          readinessFlag: "employer_approval",
        },
      ],
      lastContactAt: null,
      lastContactStatus: null,
      history: [],
    },
  ],
};

function renderDirectory() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OnboardingWorkspace eventId={eventId} />
    </QueryClientProvider>,
  );
}

describe("Ticket 24 speaker directory UI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "fetchOnboardingBoard").mockResolvedValue(board);
  });

  it("searches by name or email and filters readiness without losing exact counts", async () => {
    const user = userEvent.setup();
    renderDirectory();

    const search = await screen.findByRole("searchbox", { name: /search speakers/i });
    expect(screen.getByText("2 speakers")).toBeInTheDocument();
    await user.type(search, "grace.outstanding@");
    expect(screen.queryByText("Ada Ready")).not.toBeInTheDocument();
    expect(screen.getAllByText("Grace Outstanding")).not.toHaveLength(0);
    expect(screen.getByText("1 of 2 speakers")).toBeInTheDocument();

    await user.clear(search);
    await user.selectOptions(
      screen.getByRole("combobox", { name: /readiness filter/i }),
      "ready",
    );
    expect(screen.getAllByText("Ada Ready")).not.toHaveLength(0);
    expect(screen.queryByText("Grace Outstanding")).not.toBeInTheDocument();
  });

  it("keeps add and edit explicit, including identity-choice recovery", async () => {
    const user = userEvent.setup();
    const conflict = new api.ApiError("Choose how to use the matching identity.", 409, {
      code: "identity_choice_required",
      matches: [
        {
          speakerId: "sp-ready",
          name: "Ada Ready",
          email: "ada.ready@example.test",
          signal: "email",
        },
      ],
    });
    vi.spyOn(api, "createDirectorySpeaker")
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({
        reused: true,
        sessionLinkage: "course_check_required",
        speaker: board.speakers[0]!,
      });
    vi.spyOn(api, "updateDirectorySpeaker").mockResolvedValue({
      ...board.speakers[0]!,
      name: "Ada Corrected",
    });
    renderDirectory();

    await user.click(await screen.findByRole("button", { name: /add speaker/i }));
    const addForm = screen.getByRole("form", { name: /add speaker/i });
    await user.type(within(addForm).getByLabelText(/^name$/i), "Ada Ready");
    await user.type(within(addForm).getByLabelText(/^email$/i), "ada.ready@example.test");
    await user.type(within(addForm).getByLabelText(/^title at this event$/i), "Engineer");
    await user.type(within(addForm).getByLabelText(/^organization at this event$/i), "Engines");
    await user.click(within(addForm).getByRole("button", { name: /^check and add$/i }));

    expect(await screen.findByText(/matching speaker identity/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /reuse Ada Ready/i }));
    await waitFor(() => {
      expect(api.createDirectorySpeaker).toHaveBeenLastCalledWith(
        eventId,
        expect.objectContaining({ reuseSpeakerId: "sp-ready" }),
      );
    });

    await user.click(screen.getByRole("button", { name: /Ada Ready/i }));
    await user.click(screen.getByRole("button", { name: /edit current profile/i }));
    const editForm = screen.getByRole("form", { name: /edit current profile/i });
    await user.clear(within(editForm).getByLabelText(/^name$/i));
    await user.type(within(editForm).getByLabelText(/^name$/i), "Ada Corrected");
    expect(within(editForm).getByText(/Staff Engineer · Analytical Engines/)).toBeVisible();
    await user.click(within(editForm).getByRole("button", { name: /save profile/i }));
    await waitFor(() => {
      expect(api.updateDirectorySpeaker).toHaveBeenCalledWith(
        eventId,
        "sp-ready",
        expect.objectContaining({ name: "Ada Corrected" }),
      );
    });
  });
});
