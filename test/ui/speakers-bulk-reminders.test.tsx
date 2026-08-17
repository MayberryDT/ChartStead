import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OnboardingBoard, OnboardingBulkReminderResult } from "../../shared/events";
import { OnboardingWorkspace } from "../../src/OnboardingWorkspace";
import * as api from "../../src/api";

const eventId = "pacific-open-data-summit-2026";

function speaker(partial: Partial<OnboardingBoard["speakers"][number]> & { speakerId: string; name: string }) {
  return {
    email: `${partial.speakerId}@example.test`,
    biography: "",
    participationId: `prt-${partial.speakerId}`,
    titleSnapshot: "Speaker",
    organizationSnapshot: "Org",
    proposalId: null,
    proposalTitle: null,
    role: "primary" as const,
    workflowStatus: "preparing" as const,
    travelPreferences: "",
    logistics: {},
    openTaskCount: 1,
    overdueCount: 0,
    nextDueAt: "2026-09-01T00:00:00.000Z",
    daysUntilNextDue: 14,
    readinessFlags: [],
    missingWork: [
      {
        taskId: `task-${partial.speakerId}`,
        title: "Confirm profile",
        dueAt: "2026-09-01T00:00:00.000Z",
        daysUntilDue: 14,
        readinessFlag: null,
      },
    ],
    lastContactAt: null,
    lastContactStatus: null,
    history: [],
    socialLinks: { linkedin: "", x: "", github: "", website: "" },
    headshotAssetId: null,
    headshotFileName: null,
    ...partial,
  };
}

const board: OnboardingBoard = {
  eventId,
  drafts: [],
  speakers: [
    speaker({ speakerId: "sp-1", name: "Speaker One" }),
    speaker({ speakerId: "sp-2", name: "Speaker Two" }),
    speaker({ speakerId: "sp-3", name: "Speaker Three" }),
    speaker({ speakerId: "sp-4", name: "Speaker Four" }),
  ],
};

const bulkOk: OnboardingBulkReminderResult = {
  idempotencyKey: "bulk-ok",
  mode: "draft",
  processedAt: "2026-08-17T00:00:00.000Z",
  counts: {
    selected: 4,
    prepared: 4,
    queued: 0,
    sent: 0,
    failed: 0,
    retryScheduled: 0,
    skipped: 0,
  },
  recipients: board.speakers.map((row) => ({
    speakerId: row.speakerId,
    speakerName: row.name,
    email: row.email,
    status: "prepared",
    reason: "test",
    taskIds: row.missingWork.map((task) => task.taskId),
    taskSummaries: row.missingWork.map((task) => ({
      taskId: task.taskId,
      title: task.title,
      dueAt: task.dueAt,
    })),
    draftId: `draft-${row.speakerId}`,
    outboxId: null,
    lastError: null,
  })),
};

function renderSpeakers() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OnboardingWorkspace eventId={eventId} />
    </QueryClientProvider>,
  );
}

describe("Speakers bulk task reminders", () => {
  const originalRandomUUID = globalThis.crypto?.randomUUID;

  beforeEach(() => {
    vi.restoreAllMocks();
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
  });

  afterEach(() => {
    if (originalRandomUUID) {
      Object.defineProperty(globalThis.crypto, "randomUUID", {
        configurable: true,
        value: originalRandomUUID,
      });
    }
  });

  it("prepares drafts for a few selected speakers when crypto.randomUUID is missing", async () => {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      configurable: true,
      value: undefined,
    });
    expect(typeof globalThis.crypto.randomUUID).not.toBe("function");

    const prepare = vi.spyOn(api, "prepareBulkOnboardingReminders").mockResolvedValue(bulkOk);
    const user = userEvent.setup();
    renderSpeakers();

    await screen.findAllByText("Speaker One");
    const checkboxes = screen.getAllByRole("checkbox").filter((box) => {
      const row = box.closest("tr");
      return Boolean(row?.closest("tbody"));
    });
    expect(checkboxes.length).toBeGreaterThanOrEqual(4);
    for (const box of checkboxes.slice(0, 4)) {
      await user.click(box);
    }

    await user.click(screen.getByRole("button", { name: /prepare drafts/i }));

    await waitFor(() => {
      expect(prepare).toHaveBeenCalledTimes(1);
    });
    expect(prepare).toHaveBeenCalledWith(
      eventId,
      expect.objectContaining({
        mode: "draft",
        speakerIds: expect.arrayContaining(["sp-1", "sp-2", "sp-3", "sp-4"]),
        idempotencyKey: expect.stringMatching(/^bulk-onboarding-reminder-/),
      }),
    );
    expect(screen.queryByText(/randomUUID is not a function/i)).not.toBeInTheDocument();
    expect(await screen.findByText(/task reminders drafted/i)).toBeInTheDocument();
    expect(screen.queryByText(/last task-reminder batch/i)).not.toBeInTheDocument();
  });
});
