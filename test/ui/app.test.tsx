import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/App";

describe("organizer application", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the seeded event in the locked organizer shell", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          events: [
            {
              id: "pacific-open-data-summit-2026",
              name: "Pacific Open Data Summit 2026",
              startsOn: "2026-10-07",
              endsOn: "2026-10-08",
              submissionCount: 47,
              unreviewedCount: 18,
              tracks: [
                { id: "platform", name: "Platform", proposalCount: 14 },
                { id: "program-ops", name: "Program Ops", proposalCount: 12 },
                { id: "design-systems", name: "Design Systems", proposalCount: 11 },
                { id: "community", name: "Community", proposalCount: 10 },
              ],
              rooms: [
                { id: "harbor-hall", name: "Harbor Hall", readiness: "ready" },
                { id: "compass-room", name: "Compass Room", readiness: "ready" },
                { id: "chart-room", name: "Chart Room", readiness: "ready" },
              ],
            },
            {
              id: "ai-engineer-worlds-fair-2026",
              name: "AI Engineer World's Fair 2026",
              startsOn: "2026-06-25",
              endsOn: "2026-06-27",
              submissionCount: 32,
              unreviewedCount: 9,
              tracks: [{ id: "agents", name: "Agents", proposalCount: 12 }],
              rooms: [{ id: "main-stage", name: "Main Stage", readiness: "ready" }],
            },
          ],
          principal: { displayName: "Demo Administrator", role: "admin" },
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Pacific Open Data Summit 2026" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Organizer" })).toBeVisible();
    expect(screen.getByLabelText("4 tracks")).toBeVisible();
    expect(screen.getByLabelText("3 rooms")).toBeVisible();

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Event" }),
      "ai-engineer-worlds-fair-2026",
    );

    expect(
      await screen.findByRole("heading", { name: "AI Engineer World's Fair 2026" }),
    ).toBeVisible();
    expect(screen.getByLabelText("32 submissions")).toBeVisible();

    await userEvent.click(screen.getByRole("link", { name: "Agenda" }));
    expect(screen.getByRole("link", { name: "Agenda" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("offers Google and magic-link authentication when access is required", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", {
        name: "Conference programming and speaker management.",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Work email" })).toBeVisible();
  });
});
