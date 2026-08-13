import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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

describe("OverviewWorkspace", () => {
  it("makes unreviewed work and setup gaps actionable", () => {
    render(<OverviewWorkspace event={event} />);

    expect(screen.getByRole("link", { name: "18 unreviewed" })).toHaveAttribute(
      "href",
      "/e/pacific-open-data-summit-2026/submissions?status=unreviewed",
    );
    expect(
      screen.getByRole("link", { name: /18 proposals are still unreviewed/i }),
    ).toHaveAttribute("href", "/e/pacific-open-data-summit-2026/submissions?status=unreviewed");
    expect(screen.getByRole("link", { name: /1 room is still pending/i })).toHaveAttribute(
      "href",
      "/e/pacific-open-data-summit-2026/settings",
    );
    expect(screen.getByRole("link", { name: "Platform" })).toHaveAttribute(
      "href",
      "/e/pacific-open-data-summit-2026/submissions?track=platform",
    );
    expect(screen.getByText("Pending")).toHaveAttribute("data-tone", "attention");
  });

  it("explains an empty setup without inventing completeness", () => {
    render(
      <OverviewWorkspace
        event={{
          ...event,
          submissionCount: 0,
          unreviewedCount: 0,
          tracks: [],
          rooms: [],
        }}
      />,
    );

    expect(screen.getByText("No tracks configured yet")).toBeVisible();
    expect(screen.getByText("No rooms configured yet")).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Open Settings" })).toHaveLength(2);
    expect(screen.queryByText("Nothing blocking")).toBeNull();
  });
});
