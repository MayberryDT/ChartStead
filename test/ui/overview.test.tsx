import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import type { EventRecord } from "../../shared/events";
import { OverviewWorkspace } from "../../src/OverviewWorkspace";

const event: EventRecord = {
  id: "pacific-open-data-summit-2026",
  name: "Pacific Open Data Summit 2026",
  startsOn: "2026-10-07",
  endsOn: "2026-10-08",
  timezone: "America/Los_Angeles",
  submissionCount: 48,
  unreviewedCount: 18,
  tracks: [
    { id: "platform", name: "Platform", proposalCount: 12 },
    { id: "community", name: "Community", proposalCount: 1 },
  ],
  rooms: [
    { id: "harbor", name: "Harbor Hall", readiness: "ready" },
    { id: "chart", name: "Chart Room", readiness: "pending" },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderOverview(
  record: EventRecord = event,
  payload: {
    unplaced?: number;
    partial?: number;
    conflicts?: number;
    speakers?: Array<{ openTaskCount: number; overdueCount: number }>;
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/sessions")) {
      return jsonResponse({
        eventId: record.id,
        sessions: [],
        unplacedSessions: [],
        conflicts: [],
        counts: {
          unplaced: payload.unplaced ?? 3,
          partial: payload.partial ?? 1,
          placed: 2,
          conflicts: payload.conflicts ?? 1,
        },
        calendarIntents: [],
      });
    }
    if (url.includes("/onboarding")) {
      return jsonResponse({
        eventId: record.id,
        speakers: payload.speakers ?? [
          { openTaskCount: 2, overdueCount: 1 },
          { openTaskCount: 1, overdueCount: 0 },
        ],
        drafts: [],
      });
    }
    if (url.includes("/forms")) {
      return jsonResponse({ forms: [{ id: "main-cfp", lifecycleStatus: "published" }] });
    }
    return jsonResponse({ error: "unused" }, 404);
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OverviewWorkspace event={record} />
    </QueryClientProvider>,
  );
}

describe("OverviewWorkspace", () => {
  it("makes unreviewed, unplaced, and speaker chase actionable", async () => {
    renderOverview();

    expect(await screen.findByRole("link", { name: "4 unplaced" })).toHaveAttribute(
      "href",
      "/e/pacific-open-data-summit-2026/agenda",
    );
    expect(
      await screen.findByRole("link", { name: "2 speakers with open work" }),
    ).toHaveAttribute("href", "/e/pacific-open-data-summit-2026/speakers");
    expect(screen.getByRole("link", { name: /4 sessions are still unplaced/i })).toHaveAttribute(
      "href",
      "/e/pacific-open-data-summit-2026/agenda",
    );
    expect(screen.getByRole("link", { name: /1 speaker is overdue/i })).toHaveAttribute(
      "href",
      "/e/pacific-open-data-summit-2026/speakers",
    );
    expect(screen.getByRole("link", { name: "Platform" })).toHaveAttribute(
      "href",
      "/e/pacific-open-data-summit-2026/submissions?track=platform",
    );
  });

  it("explains an empty setup without inventing completeness", () => {
    renderOverview(
      {
        ...event,
        submissionCount: 0,
        unreviewedCount: 0,
        tracks: [],
        rooms: [],
      },
      { unplaced: 0, partial: 0, conflicts: 0, speakers: [] },
    );

    expect(screen.getAllByText(/No tracks configured yet/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/No rooms configured yet/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Nothing waiting")).toBeNull();
  });
});
