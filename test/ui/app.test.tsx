import { fireEvent, render, screen } from "@testing-library/react";
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
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, router };
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
    const user = userEvent.setup();
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
              id: "main-cfp",
              status: "published",
              definitionVersion: 1,
              definition: {
                showQuestionNumbers: "off",
                completeText: "Submit proposal",
                textUpdateMode: "onTyping",
                elements: [
                  {
                    type: "text",
                    name: "title",
                    title: "Talk title",
                    isRequired: true,
                    requiredErrorText: "Enter a talk title.",
                  },
                  {
                    type: "comment",
                    name: "abstract",
                    title: "Abstract",
                    isRequired: true,
                  },
                  {
                    type: "dropdown",
                    name: "trackId",
                    title: "Track",
                    isRequired: true,
                    choices: [{ value: "platform", text: "Platform" }],
                  },
                  {
                    type: "text",
                    name: "speakerName",
                    title: "Speaker name",
                    isRequired: true,
                  },
                  {
                    type: "text",
                    name: "speakerEmail",
                    title: "Speaker email",
                    isRequired: true,
                    validators: [
                      {
                        type: "email",
                        text: "Enter a valid email address.",
                      },
                    ],
                  },
                  {
                    type: "comment",
                    name: "biography",
                    title: "Biography",
                    isRequired: true,
                  },
                  {
                    type: "text",
                    name: "supportingLink",
                    title: "Supporting link",
                  },
                ],
              },
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

    await user.type(
      screen.getByRole("textbox", { name: /Abstract/ }),
      "Kept abstract",
    );
    await user.click(screen.getByRole("combobox", { name: /Track/ }));
    await user.click(screen.getByRole("option", { name: "Platform" }));
    await user.type(
      screen.getByRole("textbox", { name: /Speaker name/ }),
      "Kept speaker",
    );
    await user.type(
      screen.getByRole("textbox", { name: /Speaker email/ }),
      "bad",
    );
    await user.type(
      screen.getByRole("textbox", { name: /Biography/ }),
      "Kept bio",
    );
    await user.click(screen.getByRole("button", { name: "Submit proposal" }));

    expect(await screen.findByText("Enter a talk title.")).toBeVisible();
    expect(screen.getByText("Enter a valid email address.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: /Abstract/ })).toHaveValue(
      "Kept abstract",
    );
    expect(screen.getByRole("textbox", { name: /Speaker name/ })).toHaveValue(
      "Kept speaker",
    );
  });

  it("renders the server-published form definition", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          event: {
            id: "pacific-open-data-summit-2026",
            name: "Pacific Open Data Summit 2026",
            startsOn: "2026-10-07",
            endsOn: "2026-10-08",
          },
          form: {
            id: "main-cfp",
            status: "published",
            definitionVersion: 1,
            definition: {
              showQuestionNumbers: "off",
              elements: [
                {
                  type: "text",
                  name: "title",
                  title: "Published title from snapshot",
                  isRequired: true,
                },
              ],
            },
          },
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );

    renderAt("/e/pacific-open-data-summit-2026/cfp");

    expect(
      await screen.findByLabelText(/Published title from snapshot/),
    ).toBeVisible();
    expect(screen.queryByLabelText("Talk title")).not.toBeInTheDocument();
  });

  it("recreates the published form when the CFP route changes events", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const eventId = String(input).includes("ai-engineer-worlds-fair-2026")
        ? "ai-engineer-worlds-fair-2026"
        : "pacific-open-data-summit-2026";
      const isAiEvent = eventId === "ai-engineer-worlds-fair-2026";
      return new Response(
        JSON.stringify({
          event: {
            id: eventId,
            name: isAiEvent
              ? "AI Engineer World's Fair 2026"
              : "Pacific Open Data Summit 2026",
            startsOn: "2026-10-07",
            endsOn: "2026-10-08",
          },
          form: {
            id: "main-cfp",
            status: "published",
            definitionVersion: 1,
            definition: {
              showQuestionNumbers: "off",
              elements: [
                {
                  type: "text",
                  name: "title",
                  title: isAiEvent ? "AI talk title" : "Pacific talk title",
                  isRequired: true,
                },
              ],
            },
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    });

    const { router } = renderAt("/e/pacific-open-data-summit-2026/cfp");
    expect(await screen.findByLabelText(/Pacific talk title/)).toBeVisible();

    await router.navigate({
      to: "/e/$eventId/cfp",
      params: { eventId: "ai-engineer-worlds-fair-2026" },
    });

    expect(await screen.findByLabelText(/AI talk title/)).toBeVisible();
    expect(screen.queryByLabelText(/Pacific talk title/)).not.toBeInTheDocument();

    await router.navigate({
      to: "/e/$eventId/cfp",
      params: { eventId: "pacific-open-data-summit-2026" },
    });

    expect(await screen.findByLabelText(/Pacific talk title/)).toBeVisible();
    expect(screen.queryByLabelText(/AI talk title/)).not.toBeInTheDocument();
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
    expect(screen.getAllByText("SUB-ABCD12")).toHaveLength(2);
    expect(
      screen.getByLabelText("Search title, speaker, or ID"),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /Submissions/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Open charts for harbor operations" }),
    ).toHaveAttribute(
      "href",
      "/e/pacific-open-data-summit-2026/submissions/SUB-ABCD12",
    );
    expect(screen.getByRole("link", { name: "SUB-ABCD12" })).toHaveAttribute(
      "href",
      "/e/pacific-open-data-summit-2026/submissions/SUB-ABCD12",
    );
    expect(
      screen.getByRole("row", {
        name: /Open charts for harbor operations/,
      }),
    ).not.toHaveAttribute("tabindex");
    const proposalLink = screen.getByRole("link", {
      name: "Open charts for harbor operations",
    });
    let defaultPreventedByComponent: boolean | undefined;
    proposalLink.closest(".app")?.parentElement?.addEventListener(
      "click",
      (event) => {
        defaultPreventedByComponent = event.defaultPrevented;
        event.preventDefault();
      },
      { once: true },
    );
    fireEvent.click(proposalLink, { ctrlKey: true });
    expect(defaultPreventedByComponent).toBe(false);
  });

  it("shows a recoverable submissions error instead of an empty result", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/events")) {
        return new Response(JSON.stringify(eventsPayload), {
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/proposals")) {
        return new Response(JSON.stringify({ error: "Unavailable" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    renderAt("/e/pacific-open-data-summit-2026/submissions");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load submissions",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.queryByText(/No proposals match/)).not.toBeInTheDocument();
  });
});
