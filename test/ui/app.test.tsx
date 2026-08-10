import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App, SubmissionsPage } from "../../src/App";
import { CfpPage } from "../../src/CfpPage";
import { ProposalDetailPage } from "../../src/ProposalDetailPage";

function renderAt(path: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: App,
  });
  const cfpRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/e/$eventId/cfp",
    component: CfpPage,
  });
  const proposalRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/e/$eventId/proposals/$proposalId",
    component: ProposalDetailPage,
  });
  const submissionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/e/$eventId/submissions",
    component: SubmissionsPage,
  });
  const submissionDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/e/$eventId/submissions/$proposalId",
    component: SubmissionsPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      cfpRoute,
      proposalRoute,
      submissionsRoute,
      submissionDetailRoute,
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const eventsPayload = {
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
};

describe("organizer application", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("shows the seeded event in the locked organizer shell", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(eventsPayload), {
        headers: { "content-type": "application/json" },
      }),
    );

    renderAt("/");

    expect(
      await screen.findByRole("heading", { name: "Pacific Open Data Summit 2026" }),
    ).toBeVisible();
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

    renderAt("/");

    expect(
      await screen.findByRole("heading", {
        name: "Conference programming and speaker management.",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Work email" })).toBeVisible();
  });

  it("keeps CFP values and shows field errors when validation fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/cfp")) {
        return new Response(
          JSON.stringify({
            event: {
              id: "pacific-open-data-summit-2026",
              name: "Pacific Open Data Summit 2026",
              startsOn: "2026-10-07",
              endsOn: "2026-10-08",
            },
            form: {
              status: "published",
              tracks: [{ id: "platform", name: "Platform" }],
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/proposals") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            values: {
              title: "",
              abstract: "Kept abstract",
              trackId: "platform",
              speakerName: "Kept speaker",
              speakerEmail: "bad",
              biography: "Kept bio",
              supportingLink: "",
            },
            errors: {
              title: "Enter a talk title.",
              speakerEmail: "Enter a valid email address.",
            },
          }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    renderAt("/e/pacific-open-data-summit-2026/cfp");

    expect(
      await screen.findByRole("heading", { name: "Pacific Open Data Summit 2026" }),
    ).toBeVisible();

    await userEvent.type(screen.getByLabelText("Abstract"), "Kept abstract");
    await userEvent.selectOptions(screen.getByLabelText("Track"), "platform");
    await userEvent.type(screen.getByLabelText("Speaker name"), "Kept speaker");
    await userEvent.type(screen.getByLabelText("Speaker email"), "bad");
    await userEvent.type(screen.getByLabelText("Biography"), "Kept bio");
    await userEvent.click(screen.getByRole("button", { name: "Submit proposal" }));

    expect(await screen.findByText("Enter a talk title.")).toBeVisible();
    expect(screen.getByText("Enter a valid email address.")).toBeVisible();
    expect(screen.getByLabelText("Abstract")).toHaveValue("Kept abstract");
    expect(screen.getByLabelText("Speaker name")).toHaveValue("Kept speaker");
  });

  it("renders organizer submissions master-detail with search", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/events")) {
        return new Response(JSON.stringify(eventsPayload), {
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/proposals")) {
        return new Response(
          JSON.stringify({
            proposals: [
              {
                id: "SUB-ABCD12",
                eventId: "pacific-open-data-summit-2026",
                title: "Open charts for harbor operations",
                abstract: "Abstract text",
                trackId: "platform",
                trackName: "Platform",
                speakerName: "Ada Harbor",
                speakerEmail: "ada@example.com",
                biography: "Bio",
                supportingLink: "https://example.com",
                status: "unreviewed",
                committeeNote: "Committee only",
                privateNote: "",
                submittedAt: "2026-08-10T12:00:00.000Z",
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    renderAt("/e/pacific-open-data-summit-2026/submissions");

    expect(await screen.findByRole("heading", { name: "Submissions" })).toBeVisible();
    expect(
      await screen.findAllByText("Open charts for harbor operations"),
    ).not.toHaveLength(0);
    expect(screen.getByLabelText("Proposal detail")).toBeVisible();
    expect(screen.getByText("Committee only")).toBeVisible();
    expect(screen.getByText("SUB-ABCD12")).toBeVisible();
    expect(
      screen.getByLabelText("Search title, speaker, or ID"),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /Submissions/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
