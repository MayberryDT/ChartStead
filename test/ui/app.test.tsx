import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultCfpDefinition } from "../../shared/cfp-definition";
import type { OrganizerCfpForm } from "../../shared/events";
import { AgendaPage, App, SubmissionsPage } from "../../src/App";
import { CfpBuilderPage, CfpFormsPage } from "../../src/CfpBuilderPage";
import { CfpPage } from "../../src/CfpPage";
import { ProposalDetailPage } from "../../src/ProposalDetailPage";
import { SpeakerPortalPage } from "../../src/SpeakerPortalPage";
import { SubmitterEditPage } from "../../src/SubmitterEditPage";

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
    validateSearch: (search: Record<string, unknown>) => ({
      formId: typeof search.formId === "string" ? search.formId : undefined,
    }),
  });
  const proposalRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/e/$eventId/proposals/$proposalId",
    component: ProposalDetailPage,
  });
  const editRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/e/$eventId/edit/$token",
    component: SubmitterEditPage,
  });
  const portalRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/e/$eventId/portal/$token",
    component: SpeakerPortalPage,
  });
  const formsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/e/$eventId/forms",
    component: CfpFormsPage,
  });
  const formBuilderRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/e/$eventId/forms/$formId",
    component: CfpBuilderPage,
  });
  const submissionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/e/$eventId/submissions",
    component: SubmissionsPage,
    validateSearch: (search: Record<string, unknown>) => search,
  });
  const submissionDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/e/$eventId/submissions/$proposalId",
    component: SubmissionsPage,
    validateSearch: (search: Record<string, unknown>) => search,
  });
  const agendaRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/e/$eventId/agenda",
    component: AgendaPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      cfpRoute,
      proposalRoute,
      editRoute,
      portalRoute,
      formsRoute,
      formBuilderRoute,
      submissionsRoute,
      submissionDetailRoute,
      agendaRoute,
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

function mockOrganizerForm(
  overrides: Partial<OrganizerCfpForm> = {},
): OrganizerCfpForm {
  const draft = createDefaultCfpDefinition({
    definitionId: "main-cfp",
    eventId: "pacific-open-data-summit-2026",
    trackChoices: [
      { value: "platform", text: "Platform" },
      { value: "community", text: "Community" },
    ],
  });
  return {
    id: "main-cfp",
    name: "Main CFP",
    lifecycleStatus: "draft",
    draft,
    draftUpdatedAt: "2026-08-01T00:00:00.000Z",
    publishedVersion: null,
    publishedAt: null,
    publishedDefinition: null,
    ...overrides,
  };
}

function mockPublishedDefinition(
  elements: Array<Record<string, unknown>>,
  eventId = "pacific-open-data-summit-2026",
) {
  return {
    schemaVersion: 1 as const,
    definitionId: "main-cfp",
    definitionVersion: 1,
    eventId,
    status: "published" as const,
    opensAt: null,
    closesAt: null,
    runtime: {
      engine: "surveyjs" as const,
      engineMajor: 2 as const,
      survey: {
        showTitle: false as const,
        showQuestionNumbers: "off" as const,
        checkErrorsMode: "onComplete" as const,
        textUpdateMode: "onTyping" as const,
        questionErrorLocation: "bottom" as const,
        completeText: "Submit proposal",
        requiredMark: "*" as const,
        elements,
      },
    },
    chartstead: {
      template: "standard-cfp" as const,
      protectedNames: ["title", "abstract", "trackId", "speakers"],
      proposalTitleName: "title" as const,
      trackQuestionName: "trackId" as const,
      speakerPanelName: "speakers" as const,
      uploadQuestionNames: [] as string[],
    },
  };
}

const eventsPayload = {
  events: [
    {
      id: "pacific-open-data-summit-2026",
      name: "Pacific Open Data Summit 2026",
      startsOn: "2026-10-07",
      endsOn: "2026-10-08",
      submissionCount: 57,
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
    sessionStorage.clear();
  });

  it("shows the seeded event in the locked organizer shell", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/sessions")) {
        return new Response(
          JSON.stringify({
            eventId: "ai-engineer-worlds-fair-2026",
            sessions: [],
            unplacedSessions: [],
            conflicts: [],
            counts: { unplaced: 0, partial: 0, placed: 0, conflicts: 0 },
            calendarIntents: [],
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify(eventsPayload), {
        headers: { "content-type": "application/json" },
      });
    });

    renderAt("/");

    expect(
      await screen.findByRole("heading", { name: "Pacific Open Data Summit 2026" }),
    ).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Organizer" })).toBeVisible();
    expect(screen.getByLabelText("4 tracks")).toBeVisible();
    expect(screen.getByLabelText("3 rooms")).toBeVisible();

    await userEvent.click(screen.getByRole("combobox", { name: "Event" }));
    await userEvent.click(
      screen.getByRole("option", { name: "AI Engineer World's Fair 2026" }),
    );

    expect(
      await screen.findByRole("heading", { name: "AI Engineer World's Fair 2026" }),
    ).toBeVisible();
    expect(screen.getByLabelText("32 submissions")).toBeVisible();

    await userEvent.click(screen.getByRole("link", { name: "Agenda" }));
    expect(await screen.findByRole("link", { name: "Agenda" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(await screen.findByLabelText("Unplaced sessions")).toBeVisible();
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
              definition: mockPublishedDefinition([
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
              ]),
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
            definition: mockPublishedDefinition([
              {
                type: "text",
                name: "title",
                title: "Published title from snapshot",
                isRequired: true,
              },
            ]),
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
            definition: mockPublishedDefinition(
              [
                {
                  type: "text",
                  name: "title",
                  title: isAiEvent ? "AI talk title" : "Pacific talk title",
                  isRequired: true,
                },
              ],
              eventId,
            ),
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
      search: {},
    });

    expect(await screen.findByLabelText(/AI talk title/)).toBeVisible();
    expect(screen.queryByLabelText(/Pacific talk title/)).not.toBeInTheDocument();

    await router.navigate({
      to: "/e/$eventId/cfp",
      params: { eventId: "pacific-open-data-summit-2026" },
      search: {},
    });

    expect(await screen.findByLabelText(/Pacific talk title/)).toBeVisible();
    expect(screen.queryByLabelText(/AI talk title/)).not.toBeInTheDocument();
  });

  it("renders organizer submissions master-detail with search", async () => {
    const proposal = {
      id: "SUB-ABCD12",
      eventId: "pacific-open-data-summit-2026",
      formId: "main-cfp",
      formDefinitionVersion: 1,
      answers: {},
      title: "Open charts for harbor operations",
      abstract: "Abstract text",
      trackId: "platform",
      trackName: "Platform",
      speakerName: "Ada Harbor",
      speakerEmail: "ada@example.com",
      biography: "Bio",
      supportingLink: "https://example.com",
      sessionFormat: "talk",
      workshopDuration: "",
      coSpeakers: [],
      supportingFile: null,
      status: "unreviewed",
      committeeNote: "Committee only",
      privateNote: "",
      reviewVersion: 0,
      confirmationEmailStatus: null,
      submittedAt: "2026-08-10T12:00:00.000Z",
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/events")) {
        return new Response(JSON.stringify(eventsPayload), {
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/organizer/proposals/")) {
        return new Response(JSON.stringify({ proposal, auditEvents: [] }), {
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/proposals")) {
        return new Response(
          JSON.stringify({ proposals: [proposal] }),
          { headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    renderAt("/e/pacific-open-data-summit-2026/submissions");

    expect(await screen.findByRole("heading", { name: "Submissions" })).toBeVisible();
    expect(await screen.findByText("Open charts for harbor operations")).toBeVisible();
    expect(screen.getByLabelText("Proposal detail")).toBeVisible();
    expect(
      screen.getByLabelText("Search title, speaker, or ID"),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /Submissions/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const proposalRow = screen.getByRole("row", {
      name: /Open charts for harbor operations/,
    });
    expect(proposalRow).not.toHaveAttribute("tabindex");
    const proposalLinks = within(proposalRow).getAllByRole("link");
    expect(proposalLinks).toHaveLength(1);
    expect(proposalLinks[0]).toHaveAttribute(
      "href",
      "/e/pacific-open-data-summit-2026/submissions/SUB-ABCD12",
    );
    let defaultPreventedByComponent: boolean | undefined;
    proposalLinks[0]!.closest(".app")?.parentElement?.addEventListener(
      "click",
      (event) => {
        defaultPreventedByComponent = event.defaultPrevented;
        event.preventDefault();
      },
      { once: true },
    );
    fireEvent.click(proposalLinks[0]!, { ctrlKey: true });
    expect(defaultPreventedByComponent).toBe(false);
    await userEvent.click(proposalLinks[0]!);
    expect(await screen.findByText("Committee only")).toBeVisible();
    expect(screen.getByText("SUB-ABCD12")).toBeVisible();
  });

  it("restores a selected decision batch after browser history returns to submissions", async () => {
    const proposal = {
      id: "SUB-ABCD12",
      eventId: "pacific-open-data-summit-2026",
      formId: "main-cfp",
      formDefinitionVersion: 1,
      answers: {},
      title: "Open charts for harbor operations",
      abstract: "Abstract text",
      trackId: "platform",
      trackName: "Platform",
      speakerName: "Ada Harbor",
      speakerEmail: "ada@example.com",
      biography: "Bio",
      supportingLink: "https://example.com",
      sessionFormat: "talk",
      workshopDuration: "",
      coSpeakers: [],
      supportingFile: null,
      status: "unreviewed",
      committeeNote: "",
      privateNote: "",
      reviewVersion: 0,
      confirmationEmailStatus: null,
      submittedAt: "2026-08-10T12:00:00.000Z",
      programOutcome: null,
    };
    sessionStorage.setItem(
      "chartstead:decision-batch:pacific-open-data-summit-2026",
      JSON.stringify([proposal.id]),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/events")) {
        return new Response(JSON.stringify(eventsPayload), {
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/proposals")) {
        return new Response(JSON.stringify({ proposals: [proposal] }), {
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    renderAt("/e/pacific-open-data-summit-2026/submissions");

    expect(await screen.findByRole("region", { name: "Batch final decisions" })).toHaveTextContent("1 selected");
    expect(await screen.findByRole("checkbox", { name: `Select ${proposal.id} for batch decision` })).toBeChecked();
  });

  it("preserves review queue context while saving notes and reversible decisions", async () => {
    const user = userEvent.setup();
    const reviewWrites: Array<Record<string, unknown>> = [];
    let reviewVersion = 2;
    let status = "unreviewed";
    let committeeNote = "Committee only";
    const proposal = () => ({
      id: "SUB-ABCD12",
      eventId: "pacific-open-data-summit-2026",
      formId: "main-cfp",
      formDefinitionVersion: 1,
      answers: {
        title: "Open charts for harbor operations",
        abstract: "Abstract text",
        trackId: "platform",
        audienceTakeaway: "A repeatable harbor data checklist.",
        speakers: [
          {
            name: "Ada Harbor",
            email: "ada@example.com",
            biography: "Bio",
            pronouns: "she/her",
            headshot: {
              assetId: "asset-headshot",
              objectKey: "headshots/ada.jpg",
              name: "ada-headshot.jpg",
              mime: "image/jpeg",
              size: 2048,
              status: "complete",
            },
          },
        ],
      },
      title: "Open charts for harbor operations",
      abstract: "Abstract text",
      trackId: "platform",
      trackName: "Platform",
      speakerName: "Ada Harbor",
      speakerEmail: "ada@example.com",
      biography: "Bio",
      supportingLink: "https://example.com",
      sessionFormat: "talk",
      workshopDuration: "",
      coSpeakers: [],
      supportingFile: null,
      status,
      committeeNote,
      privateNote: "",
      reviewVersion,
      confirmationEmailStatus: null,
      submittedAt: "2026-08-10T12:00:00.000Z",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/events")) {
        return new Response(JSON.stringify(eventsPayload), {
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/organizer/proposals/") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as {
          status?: string;
          committeeNote?: string;
          expectedVersion: number;
        };
        reviewWrites.push(body);
        expect(body.expectedVersion).toBe(reviewVersion);
        status = body.status ?? status;
        committeeNote = body.committeeNote ?? committeeNote;
        reviewVersion += 1;
        return new Response(
          JSON.stringify({
            proposal: proposal(),
            auditEvents: [
              {
                id: `audit-${reviewVersion}`,
                proposalId: "SUB-ABCD12",
                type: "proposal.review.changed",
                actorId: "demo-admin",
                actorName: "Demo Administrator",
                fromStatus: "unreviewed",
                toStatus: status,
                committeeNoteChanged: body.committeeNote !== undefined,
                createdAt: "2026-08-11T12:00:00.000Z",
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/organizer/proposals/")) {
        return new Response(
          JSON.stringify({ proposal: proposal(), auditEvents: [] }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/proposals")) {
        expect(url).toContain("q=harbor");
        expect(url).toContain("status=unreviewed");
        expect(url).toContain("track=platform");
        expect(url).toContain("sort=title-asc");
        return new Response(JSON.stringify({ proposals: [proposal()] }), {
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    renderAt(
      "/e/pacific-open-data-summit-2026/submissions/SUB-ABCD12?q=harbor&status=unreviewed&track=platform&sort=title-asc",
    );

    expect(
      await screen.findByRole("heading", { name: "Open charts for harbor operations" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Search title, speaker, or ID")).toHaveValue(
      "harbor",
    );
    expect(
      within(screen.getByRole("group", { name: "Status filter" })).getByRole(
        "button",
        { name: "Unreviewed" },
      ),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("combobox", { name: "Track filter" }),
    ).toHaveTextContent("FilterPlatform");
    expect(
      screen.getByRole("combobox", { name: "Sort submissions" }),
    ).toHaveTextContent("SortTitle A-Z");
    expect(screen.getByText("A repeatable harbor data checklist.")).toBeVisible();
    expect(screen.getByText("ada-headshot.jpg")).toBeVisible();
    expect(screen.getByText("she/her")).toBeVisible();
    expect(screen.getByText(/No speaker email is sent/i)).toBeVisible();
    const stableLink = within(
      screen.getByRole("row", { name: /Open charts for harbor operations/ }),
    ).getByRole("link");
    expect(stableLink.getAttribute("href")).toContain(
      "/e/pacific-open-data-summit-2026/submissions/SUB-ABCD12",
    );
    expect(stableLink.getAttribute("href")).toContain("q=harbor");

    const note = screen.getByRole("textbox", { name: "Committee note" });
    await user.clear(note);
    await user.type(note, "Compare against the second platform slot.");
    await user.click(screen.getByRole("button", { name: "Save committee note" }));
    expect(await screen.findByText("Committee note saved.")).toBeVisible();

    await user.click(
      within(screen.getByLabelText("Internal decision")).getByRole("button", {
        name: "Maybe",
      }),
    );
    expect(await screen.findByText("Internal decision changed to Maybe.")).toBeVisible();
    expect(reviewWrites).toEqual([
      {
        committeeNote: "Compare against the second platform slot.",
        expectedVersion: 2,
      },
      { status: "maybe", expectedVersion: 3 },
    ]);
    const history = screen.getByText("Review history").closest(".panel");
    expect(history).toBeTruthy();
    expect(history?.querySelector("summary")).toHaveTextContent(
      /Demo Administrator.*Maybe/,
    );
  });

  it("lets administrators route signed-in reviewers to event tracks", async () => {
    const user = userEvent.setup();
    const writes: unknown[] = [];
    let assignedReviewer: {
      id: string;
      name: string;
      email: string;
      trackIds: string[];
    } | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/events")) {
        return new Response(JSON.stringify(eventsPayload), {
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/reviewers") && init?.method === "POST") {
        writes.push(JSON.parse(String(init.body)));
        assignedReviewer = {
          id: "reviewer-1",
          name: "Rae Viewer",
          email: "rae@example.com",
          trackIds: ["platform"],
        };
        return new Response(
          JSON.stringify({ reviewer: assignedReviewer }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (url.endsWith("/reviewers/reviewer-1") && init?.method === "DELETE") {
        writes.push({ remove: "reviewer-1" });
        assignedReviewer = null;
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/reviewers/reviewer-1") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        writes.push({ edit: body });
        assignedReviewer = {
          ...assignedReviewer!,
          trackIds: body.trackIds,
        };
        return new Response(JSON.stringify({ reviewer: assignedReviewer }), {
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/reviewers")) {
        return new Response(JSON.stringify({ reviewers: assignedReviewer ? [assignedReviewer] : [] }), {
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/proposals")) {
        return new Response(JSON.stringify({ proposals: [] }), {
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    renderAt("/e/pacific-open-data-summit-2026/submissions");
    await user.click(await screen.findByRole("button", { name: "Reviewer routing" }));
    expect(screen.getByRole("heading", { name: "Reviewer routing" })).toBeVisible();
    await user.type(screen.getByLabelText("Reviewer email"), "rae@example.com");
    await user.click(screen.getByRole("checkbox", { name: "Platform" }));
    await user.click(screen.getByRole("button", { name: "Send reviewer invitation" }));

    expect(
      await screen.findByText("Rae Viewer can now review 1 track."),
    ).toBeVisible();
    expect(writes).toEqual([
      { email: "rae@example.com", trackIds: ["platform"] },
    ]);
    const editButton = await screen.findByRole("button", {
      name: "Edit access for Rae Viewer",
    });
    await user.click(editButton);
    const reviewerRow = editButton.closest("li");
    expect(reviewerRow).toBeTruthy();
    await user.click(within(reviewerRow as HTMLElement).getByRole("checkbox", { name: "Platform" }));
    await user.click(within(reviewerRow as HTMLElement).getByRole("checkbox", { name: "Design Systems" }));
    await user.click(within(reviewerRow as HTMLElement).getByRole("button", { name: "Save tracks" }));
    expect(await screen.findByText("Reviewer tracks saved.")).toBeVisible();
    expect(writes).toEqual([
      { email: "rae@example.com", trackIds: ["platform"] },
      { edit: { trackIds: ["design-systems"] } },
    ]);
    await user.click(await screen.findByRole("button", { name: "Remove access for Rae Viewer" }));
    expect(await screen.findByText("Reviewer access removed.")).toBeVisible();
    expect(writes).toEqual([
      { email: "rae@example.com", trackIds: ["platform"] },
      { edit: { trackIds: ["design-systems"] } },
      { remove: "reviewer-1" },
    ]);
  });

  it("shows truthful invitation delivery state and organizer revoke and retry controls", async () => {
    const user = userEvent.setup();
    const writes: Array<{ action: string; body?: unknown }> = [];
    const invitation = {
      id: "invite-1",
      email: "future@example.com",
      trackIds: ["platform"],
      status: "pending",
      deliveryState: "retryable",
      expiresAt: "2026-08-19T12:00:00.000Z",
      acceptedAt: null,
      revokedAt: null,
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/events")) {
        return new Response(JSON.stringify(eventsPayload), {
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/reviewers") && init?.method === "POST") {
        writes.push({ action: "invite", body: JSON.parse(String(init.body)) });
        return new Response(
          JSON.stringify({
            invitation: {
              ...invitation,
              email: "next@example.com",
              deliveryState: "queued",
            },
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        );
      }
      if (url.endsWith("/reviewers")) {
        return new Response(
          JSON.stringify({ reviewers: [], invitations: [invitation] }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (url.endsWith("/reviewer-invitations/invite-1/retry")) {
        writes.push({ action: "retry" });
        return new Response(
          JSON.stringify({
            invitation: { ...invitation, deliveryState: "delivered" },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (url.endsWith("/reviewer-invitations/invite-1") && init?.method === "DELETE") {
        writes.push({ action: "revoke" });
        return new Response(
          JSON.stringify({ invitation: { ...invitation, status: "revoked" } }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/proposals")) {
        return new Response(JSON.stringify({ proposals: [] }), {
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    renderAt("/e/pacific-open-data-summit-2026/submissions");
    await user.click(await screen.findByRole("button", { name: "Reviewer routing" }));
    expect(await screen.findByText("Delivery failed — retry available")).toBeVisible();
    const invitationRow = screen.getByText("future@example.com").closest("li");
    expect(invitationRow).toBeTruthy();
    expect(within(invitationRow as HTMLElement).getByText("Platform")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Retry invitation to future@example.com" }));
    expect(await screen.findByText("Invitation delivered.")).toBeVisible();

    await user.type(screen.getByLabelText("Reviewer email"), "next@example.com");
    await user.click(screen.getByRole("checkbox", { name: "Platform" }));
    await user.click(screen.getByRole("button", { name: "Send reviewer invitation" }));
    expect(await screen.findByText("Invitation queued for next@example.com.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Revoke invitation to future@example.com" }));
    expect(await screen.findByText("Reviewer invitation revoked.")).toBeVisible();
    expect(writes).toEqual([
      { action: "retry" },
      {
        action: "invite",
        body: { email: "next@example.com", trackIds: ["platform"] },
      },
      { action: "revoke" },
    ]);
  });

  it("edits every published answer through the submitter edit runtime", async () => {
    const user = userEvent.setup();
    const patchBodies: unknown[] = [];
    const editFormElements = [
      {
        type: "text",
        name: "title",
        title: "Talk title",
        isRequired: true,
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
        choices: [
          { value: "platform", text: "Platform" },
          { value: "program-ops", text: "Program Ops" },
        ],
      },
      {
        type: "dropdown",
        name: "sessionFormat",
        title: "Session format",
        isRequired: true,
        choices: [
          { value: "talk", text: "Talk" },
          { value: "workshop", text: "Workshop" },
        ],
      },
      {
        type: "dropdown",
        name: "workshopDuration",
        title: "Workshop duration",
        isRequired: true,
        visibleIf: '{sessionFormat} = "workshop"',
        choices: [
          { value: "60 minutes", text: "60 minutes" },
          { value: "90 minutes", text: "90 minutes" },
        ],
      },
      {
        type: "paneldynamic",
        name: "speakers",
        title: "Speakers",
        panelCount: 1,
        minPanelCount: 1,
        maxPanelCount: 4,
        panelAddText: "Add co-speaker",
        templateElements: [
          {
            type: "text",
            name: "name",
            title: "Speaker name",
            isRequired: true,
          },
          {
            type: "text",
            name: "email",
            title: "Speaker email",
            isRequired: true,
          },
          {
            type: "comment",
            name: "biography",
            title: "Biography",
            isRequired: true,
          },
        ],
      },
      {
        type: "text",
        name: "supportingLink",
        title: "Supporting link",
      },
    ];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/submitter/edit")) {
        return new Response(
          JSON.stringify({
            eventId: "pacific-open-data-summit-2026",
            proposalId: "SUB-EDIT01",
            expiresAt: "2026-12-01T00:00:00.000Z",
            form: {
              id: "main-cfp",
              name: "Main CFP",
              status: "published",
              definitionVersion: 1,
              definition: mockPublishedDefinition(editFormElements),
              publishedAt: "2026-08-01T00:00:00.000Z",
            },
            answers: {
              title: "Original title",
              abstract: "Original abstract for editing.",
              trackId: "platform",
              sessionFormat: "talk",
              speakers: [
                {
                  name: "Primary Speaker",
                  email: "primary@example.com",
                  biography: "Primary biography.",
                },
              ],
              supportingLink: "https://example.com/original",
            },
            proposal: {
              id: "SUB-EDIT01",
              eventId: "pacific-open-data-summit-2026",
              title: "Original title",
              trackId: "platform",
              trackName: "Platform",
              speakerName: "Primary Speaker",
              speakerEmail: "primary@example.com",
              submittedAt: "2026-08-10T12:00:00.000Z",
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/submitter/proposals/") && init?.method === "PATCH") {
        patchBodies.push(JSON.parse(String(init.body)));
        return new Response(
          JSON.stringify({
            proposal: {
              id: "SUB-EDIT01",
              eventId: "pacific-open-data-summit-2026",
              title: "Original title",
              trackId: "program-ops",
              trackName: "Program Ops",
              speakerName: "Primary Speaker",
              submittedAt: "2026-08-10T12:00:00.000Z",
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    renderAt("/e/pacific-open-data-summit-2026/edit/test-token");

    expect(
      await screen.findByRole("heading", { name: /Edit proposal SUB-EDIT01/ }),
    ).toBeVisible();
    expect(screen.getByText("Secure edit link")).toBeVisible();
    expect(screen.queryByText("Committee only")).not.toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: /Track/ }));
    await user.click(screen.getByRole("option", { name: "Program Ops" }));

    await user.click(screen.getByRole("combobox", { name: /Session format/ }));
    await user.click(screen.getByRole("option", { name: "Workshop" }));

    expect(
      await screen.findByRole("combobox", { name: /Workshop duration/ }),
    ).toBeVisible();
    await user.click(screen.getByRole("combobox", { name: /Workshop duration/ }));
    await user.click(screen.getByRole("option", { name: "90 minutes" }));

    await user.click(screen.getByRole("button", { name: "Add co-speaker" }));
    const speakerNames = await screen.findAllByRole("textbox", {
      name: /Speaker name/,
    });
    const speakerEmails = screen.getAllByRole("textbox", {
      name: /Speaker email/,
    });
    const biographies = screen.getAllByRole("textbox", { name: /Biography/ });
    expect(speakerNames.length).toBeGreaterThanOrEqual(2);
    await user.clear(speakerNames[1]!);
    await user.type(speakerNames[1]!, "Co Speaker");
    await user.clear(speakerEmails[1]!);
    await user.type(speakerEmails[1]!, "co@example.com");
    await user.clear(biographies[1]!);
    await user.type(biographies[1]!, "Co-speaker biography.");

    const supportingLink = screen.getByRole("textbox", {
      name: /Supporting link/,
    });
    await user.clear(supportingLink);
    await user.type(supportingLink, "https://example.com/updated-slides");

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("Your proposal was updated."),
    ).toBeVisible();
    expect(patchBodies).toHaveLength(1);
    expect(patchBodies[0]).toMatchObject({
      answers: {
        trackId: "program-ops",
        sessionFormat: "workshop",
        workshopDuration: "90 minutes",
        supportingLink: "https://example.com/updated-slides",
        speakers: expect.arrayContaining([
          expect.objectContaining({
            name: "Primary Speaker",
            email: "primary@example.com",
          }),
          expect.objectContaining({
            name: "Co Speaker",
            email: "co@example.com",
          }),
        ]),
      },
    });
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

  it("shows real Uppy upload progress with cancel, retry, replace, and submit blocking", async () => {
    const user = userEvent.setup();
    const OriginalXHR = globalThis.XMLHttpRequest;
    type MockXhr = {
      method: string;
      url: string;
      status: number;
      responseText: string;
      responseType: string;
      upload: { onprogress: ((event: ProgressEvent) => void) | null };
      onload: (() => void) | null;
      onerror: (() => void) | null;
      headers: Record<string, string>;
      aborted: boolean;
      open: (method: string, url: string) => void;
      setRequestHeader: (key: string, value: string) => void;
      send: (body?: Document | XMLHttpRequestBodyInit | null) => void;
      abort: () => void;
      emitProgress: (loaded: number, total: number) => void;
      completeOk: (body: unknown) => void;
      completeError: (status?: number) => void;
    };
    const xhrQueue: MockXhr[] = [];
    let nextXhrShouldFail = false;

    class FakeXHR {
      method = "";
      url = "";
      status = 0;
      responseText = "";
      responseType = "";
      withCredentials = false;
      upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      headers: Record<string, string> = {};
      aborted = false;
      body: Document | XMLHttpRequestBodyInit | null = null;

      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }

      setRequestHeader(key: string, value: string) {
        this.headers[key.toLowerCase()] = value;
      }

      send(body?: Document | XMLHttpRequestBodyInit | null) {
        this.body = body ?? null;
        const mock = this as unknown as MockXhr;
        Object.assign(mock, {
          emitProgress: (loaded: number, total: number) => {
            this.upload.onprogress?.({
              lengthComputable: true,
              loaded,
              total,
            } as ProgressEvent);
          },
          completeOk: (payload: unknown) => {
            this.status = 200;
            (this as { statusText?: string }).statusText = "OK";
            this.responseText = JSON.stringify(payload);
            this.onload?.();
          },
          completeError: (status = 500) => {
            this.status = status;
            (this as { statusText?: string }).statusText = "Internal Server Error";
            this.responseText = JSON.stringify({ error: "Upload failed" });
            this.onload?.();
          },
        });
        xhrQueue.push(mock);
        if (nextXhrShouldFail) {
          nextXhrShouldFail = false;
          queueMicrotask(() => mock.completeError(500));
        }
      }

      abort() {
        this.aborted = true;
      }
    }

    // @ts-expect-error test double for Uppy XHR transport
    globalThis.XMLHttpRequest = FakeXHR;

    const startBodies: unknown[] = [];
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
              definition: mockPublishedDefinition(
                [
                  {
                    type: "text",
                    name: "title",
                    title: "Talk title",
                    isRequired: true,
                  },
                  {
                    type: "chartstead-file",
                    name: "supportingFile",
                    title: "Supporting file",
                    isRequired: false,
                    maxFileBytes: 5 * 1024 * 1024,
                    acceptMimeTypes: ["application/pdf"],
                  },
                ],
                "pacific-open-data-summit-2026",
              ),
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/uploads") && init?.method === "POST") {
        startBodies.push(JSON.parse(String(init.body)));
        return new Response(
          JSON.stringify({
            upload: {
              assetId: `asset-${startBodies.length}`,
              objectKey: `pacific-open-data-summit-2026/asset-${startBodies.length}/slides.pdf`,
              uploadUrl: `/api/events/pacific-open-data-summit-2026/uploads/asset-${startBodies.length}`,
              maxBytes: 5 * 1024 * 1024,
              acceptMimeTypes: ["application/pdf"],
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/proposals") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            proposal: {
              id: "SUB-UPLOAD1",
              eventId: "pacific-open-data-summit-2026",
              title: "Uploaded talk",
              trackId: "platform",
              trackName: "Platform",
              speakerName: "Ada",
              submittedAt: "2026-08-10T12:00:00.000Z",
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    try {
      renderAt("/e/pacific-open-data-summit-2026/cfp");
      expect(await screen.findByRole("button", { name: "Choose file" })).toBeVisible();

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      expect(fileInput).toBeTruthy();
      expect(fileInput).toHaveAttribute("accept", "application/pdf");

      const pdf = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], "slides.pdf", {
        type: "application/pdf",
      });
      await user.upload(fileInput, pdf);

      await vi.waitFor(() => {
        expect(startBodies).toHaveLength(1);
        expect(xhrQueue.length).toBeGreaterThanOrEqual(1);
      });
      expect(startBodies[0]).toMatchObject({
        formId: "main-cfp",
        formDefinitionVersion: 1,
        questionName: "supportingFile",
        fileName: "slides.pdf",
        mime: "application/pdf",
      });

      expect(await screen.findByText("slides.pdf")).toBeVisible();
      expect(screen.getByRole("button", { name: "Cancel upload" })).toBeEnabled();

      const activeXhr = xhrQueue[xhrQueue.length - 1]!;
      activeXhr.emitProgress(42, 100);
      expect(await screen.findByText("42%")).toBeVisible();
      expect(screen.getByRole("status")).toHaveTextContent("42%");

      await user.type(screen.getByRole("textbox", { name: /Talk title/ }), "Kept title");
      await user.click(screen.getByRole("button", { name: "Submit proposal" }));
      expect(
        await screen.findByText("Wait for file uploads to finish."),
      ).toBeVisible();
      expect(screen.getByRole("textbox", { name: /Talk title/ })).toHaveValue(
        "Kept title",
      );

      await user.click(screen.getByRole("button", { name: "Cancel upload" }));
      await vi.waitFor(() => {
        expect(screen.queryByText("42%")).not.toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: "Choose file" })).toBeVisible();

      nextXhrShouldFail = true;
      const beforeFailCount = xhrQueue.length;
      await user.upload(fileInput, pdf);
      expect(
        await screen.findByRole("button", { name: "Retry upload" }),
      ).toBeEnabled();
      expect(screen.getByText(/network error|Upload failed/i)).toBeVisible();
      expect(screen.getByRole("textbox", { name: /Talk title/ })).toHaveValue(
        "Kept title",
      );

      await user.click(screen.getByRole("button", { name: "Submit proposal" }));
      expect(
        await screen.findByText("Fix failed uploads before submitting."),
      ).toBeVisible();

      await user.click(screen.getByRole("button", { name: "Retry upload" }));
      await vi.waitFor(() => {
        expect(xhrQueue.length).toBeGreaterThan(beforeFailCount);
      });
      const retryXhr = xhrQueue[xhrQueue.length - 1]!;
      retryXhr.emitProgress(100, 100);
      retryXhr.completeOk({
        asset: {
          assetId: "asset-retry",
          objectKey: "pacific-open-data-summit-2026/asset-retry/slides.pdf",
          name: "slides.pdf",
          mime: "application/pdf",
          size: 8,
          status: "complete",
        },
      });

      expect(
        await screen.findByRole("button", { name: "Replace file" }),
      ).toBeEnabled();
      expect(screen.getByRole("button", { name: "Remove" })).toBeEnabled();
      expect(screen.getByText("slides.pdf")).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Retry upload" }),
      ).not.toBeInTheDocument();

      const beforeReplaceCount = xhrQueue.length;
      await user.click(screen.getByRole("button", { name: "Remove" }));
      expect(await screen.findByRole("button", { name: "Choose file" })).toBeVisible();

      const replacement = new File([new Uint8Array([9, 9, 9])], "deck.pdf", {
        type: "application/pdf",
      });
      const latestInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      await user.upload(latestInput, replacement);
      await vi.waitFor(() => {
        expect(xhrQueue.length).toBeGreaterThan(beforeReplaceCount);
      });
      const replaceXhr = xhrQueue[xhrQueue.length - 1]!;
      replaceXhr.emitProgress(50, 100);
      expect(await screen.findByText("50%")).toBeVisible();
      replaceXhr.completeOk({
        asset: {
          assetId: "asset-replace",
          objectKey: "pacific-open-data-summit-2026/asset-replace/deck.pdf",
          name: "deck.pdf",
          mime: "application/pdf",
          size: 3,
          status: "complete",
        },
      });
      expect(
        await screen.findByRole("button", { name: "Replace file" }),
      ).toBeEnabled();
      expect(screen.getByText("deck.pdf")).toBeVisible();
    } finally {
      globalThis.XMLHttpRequest = OriginalXHR;
    }
  });

  it("does not start R2 uploads in CFP preview mode", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/uploads")) {
        throw new Error("Preview must not allocate uploads");
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const { CfpRuntime } = await import("../../src/CfpRuntime");
    const form = {
      id: "main-cfp",
      name: "Main CFP",
      status: "published" as const,
      definitionVersion: 1,
      definition: mockPublishedDefinition([
        {
          type: "chartstead-file",
          name: "supportingFile",
          title: "Supporting file",
          maxFileBytes: 5 * 1024 * 1024,
          acceptMimeTypes: ["application/pdf"],
        },
      ]),
      publishedAt: "2026-08-01T00:00:00.000Z",
    } as const;

    render(
      <CfpRuntime
        eventId="pacific-open-data-summit-2026"
        form={form as never}
        mode="preview"
      />,
    );

    expect(await screen.findByRole("button", { name: "Choose file" })).toBeVisible();
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const pdf = new File([new Uint8Array([1, 2, 3])], "preview.pdf", {
      type: "application/pdf",
    });
    await user.upload(fileInput, pdf);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Uploads are disabled in preview.",
    );
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes("/uploads")),
    ).toBe(false);
  });
});
describe("guided CFP builder", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  function mockBuilderFetch(options?: {
    themeAccent?: string;
    onDraftPut?: (
      body: { name?: string; draft: unknown },
      callIndex: number,
    ) => Promise<Response> | Response;
  }) {
    let form = mockOrganizerForm();
    const themeAccent = options?.themeAccent ?? "#2f5d98";
    let draftPutCount = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        const url = String(input);
        if (url.endsWith("/forms/main-cfp") && (!init?.method || init.method === "GET")) {
          return new Response(
            JSON.stringify({
              form,
              event: {
                id: "pacific-open-data-summit-2026",
                name: "Pacific Open Data Summit 2026",
                startsOn: "2026-10-07",
                endsOn: "2026-10-08",
                themeAccent,
              },
            }),
            {
              headers: { "content-type": "application/json" },
            },
          );
        }
        if (url.endsWith("/forms/main-cfp/draft") && init?.method === "PUT") {
          draftPutCount += 1;
          const body = JSON.parse(String(init.body)) as {
            name?: string;
            draft: unknown;
          };
          if (options?.onDraftPut) {
            return options.onDraftPut(body, draftPutCount);
          }
          form = {
            ...form,
            name: body.name ?? form.name,
            draft: body.draft as OrganizerCfpForm["draft"],
            draftUpdatedAt: new Date().toISOString(),
          };
          return new Response(JSON.stringify({ form }), {
            headers: { "content-type": "application/json" },
          });
        }
        if (url.endsWith("/forms/main-cfp/publish") && init?.method === "POST") {
          const body = init.body
            ? (JSON.parse(String(init.body)) as {
                name?: string;
                draft?: OrganizerCfpForm["draft"];
              })
            : {};
          form = {
            ...form,
            name: body.name ?? form.name,
            draft: body.draft ?? form.draft,
            lifecycleStatus: "published",
            publishedVersion: (form.publishedVersion ?? 0) + 1,
            publishedAt: new Date().toISOString(),
            draftUpdatedAt: new Date().toISOString(),
            publishedDefinition: body.draft ?? form.draft,
          };
          return new Response(JSON.stringify({ form }), {
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`Unexpected fetch ${url} ${init?.method ?? "GET"}`);
      },
    );
    return {
      fetchMock,
      getForm: () => form,
      setForm: (next: OrganizerCfpForm) => {
        form = next;
      },
    };
  }

  it("shows the organizer form fetch error instead of loading forever", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Form not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );

    renderAt("/e/pacific-open-data-summit-2026/forms/missing-form");

    expect(await screen.findByRole("alert")).toHaveTextContent("Form not found");
    expect(screen.queryByText("Loading form builder…")).not.toBeInTheDocument();
  });

  it("keeps event track choices read-only in the guided builder", async () => {
    const user = userEvent.setup();
    mockBuilderFetch();

    renderAt("/e/pacific-open-data-summit-2026/forms/main-cfp");

    await user.click(await screen.findByRole("button", { name: "Proposal" }));
    const trackCard = await screen.findByTestId("field-card-trackId");
    expect(
      within(trackCard).getByLabelText("Choices (one per line as value|label)"),
    ).toBeDisabled();
  });

  it("does not let a stale save response clobber newer local edits", async () => {
    const user = userEvent.setup();
    let resolveFirstSave!: (response: Response) => void;
    const firstSave = new Promise<Response>((resolve) => {
      resolveFirstSave = resolve;
    });
    let draftPuts = 0;
    mockBuilderFetch({
      onDraftPut: async (body, callIndex) => {
        draftPuts = callIndex;
        const saved = mockOrganizerForm({
          name: body.name ?? "Main CFP",
          draft: body.draft as OrganizerCfpForm["draft"],
        });
        const response = new Response(JSON.stringify({ form: saved }), {
          headers: { "content-type": "application/json" },
        });
        if (callIndex === 1) return firstSave.then(() => response);
        return response;
      },
    });

    renderAt("/e/pacific-open-data-summit-2026/forms/main-cfp");
    expect(await screen.findByText("Saved")).toBeVisible();

    await user.type(screen.getByLabelText("Welcome title"), " first");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Saving")).toBeVisible();

    await user.type(screen.getByLabelText("Welcome title"), " second");
    resolveFirstSave(
      new Response(
        JSON.stringify({
          form: mockOrganizerForm({
            draft: createDefaultCfpDefinition({
              definitionId: "main-cfp",
              eventId: "pacific-open-data-summit-2026",
              trackChoices: [{ value: "platform", text: "Platform" }],
            }),
          }),
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );

    expect(await screen.findByLabelText("Welcome title")).toHaveValue(
      "Submit a proposal first second",
    );
    expect(screen.getByText("Unsaved changes")).toBeVisible();
    expect(draftPuts).toBe(1);
  });

  it("disables publish while a draft save is in flight", async () => {
    const user = userEvent.setup();
    let resolveSlowSave!: (response: Response) => void;
    const slowSave = new Promise<Response>((resolve) => {
      resolveSlowSave = resolve;
    });
    mockBuilderFetch({
      onDraftPut: async (body, callIndex) => {
        const saved = mockOrganizerForm({
          name: body.name ?? "Main CFP",
          draft: body.draft as OrganizerCfpForm["draft"],
          draftUpdatedAt: `2026-08-01T00:00:0${callIndex}.000Z`,
        });
        if (callIndex === 1) return slowSave;
        return new Response(JSON.stringify({ form: saved }), {
          headers: { "content-type": "application/json" },
        });
      },
    });

    renderAt("/e/pacific-open-data-summit-2026/forms/main-cfp");
    expect(await screen.findByText("Saved")).toBeVisible();

    await user.type(screen.getByLabelText("Welcome title"), " pre-publish");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Saving")).toBeVisible();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();

    resolveSlowSave(
      new Response(
        JSON.stringify({
          form: mockOrganizerForm({
            draftUpdatedAt: "2026-08-01T00:00:01.000Z",
          }),
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    expect(await screen.findByText("Saved")).toBeVisible();
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
  });

  it("publishes the current draft body atomically without a prior save race", async () => {
    const user = userEvent.setup();
    mockBuilderFetch();

    renderAt("/e/pacific-open-data-summit-2026/forms/main-cfp");
    expect(await screen.findByText("Saved")).toBeVisible();

    await user.type(screen.getByLabelText("Welcome title"), " live");
    expect(screen.getByText("Unsaved changes")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText(/Published version/)).toBeVisible();
    expect(screen.getByText("Saved")).toBeVisible();
    expect(screen.getByLabelText("Welcome title")).toHaveValue(
      "Submit a proposal live",
    );
  });

  it("ignores stale draft-save errors after a newer local revision", async () => {
    const user = userEvent.setup();
    let resolveSlowFail!: (response: Response) => void;
    const slowFail = new Promise<Response>((resolve) => {
      resolveSlowFail = resolve;
    });
    mockBuilderFetch({
      onDraftPut: async (_body, callIndex) => {
        if (callIndex === 1) {
          return slowFail;
        }
        return new Response(
          JSON.stringify({
            form: mockOrganizerForm(),
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });

    renderAt("/e/pacific-open-data-summit-2026/forms/main-cfp");
    await screen.findByText("Saved");
    await user.type(screen.getByLabelText("Welcome title"), " first");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Saving")).toBeVisible();

    await user.type(screen.getByLabelText("Welcome title"), " second");
    expect(screen.getByText("Unsaved changes")).toBeVisible();

    resolveSlowFail(
      new Response(JSON.stringify({ error: "stale failure" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );

    await vi.waitFor(() => {
      expect(screen.queryByText("Save failed")).not.toBeInTheDocument();
      expect(screen.queryByText("stale failure")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Unsaved changes")).toBeVisible();
    expect(screen.getByLabelText("Welcome title")).toHaveValue(
      "Submit a proposal first second",
    );
  });

  it("adds moves and removes custom fields without SurveyJS vocabulary", async () => {
    const user = userEvent.setup();
    mockBuilderFetch();
    renderAt("/e/pacific-open-data-summit-2026/forms/main-cfp");
    expect(await screen.findByText("Saved")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Proposal" }));
    await user.click(screen.getByRole("button", { name: "Add short text" }));

    expect(screen.getByText("Unsaved changes")).toBeVisible();
    expect(screen.queryByText(/visibleIf|surveyjs|paneldynamic/i)).not.toBeInTheDocument();

    const customCard = screen.getByTestId("field-card-customQuestion1");
    expect(within(customCard).getByDisplayValue("Short text question")).toBeVisible();

    await user.clear(within(customCard).getByLabelText("Label"));
    await user.type(within(customCard).getByLabelText("Label"), "Extra notes");
    await user.click(within(customCard).getByRole("button", { name: "Move up" }));
    await user.click(within(customCard).getByRole("button", { name: "Remove" }));

    expect(screen.queryByTestId("field-card-customQuestion1")).not.toBeInTheDocument();
  });

  it("prevents removing protected fields and clearing their required flag", async () => {
    const user = userEvent.setup();
    mockBuilderFetch();
    renderAt("/e/pacific-open-data-summit-2026/forms/main-cfp");
    await screen.findByText("Saved");
    await user.click(screen.getByRole("button", { name: "Proposal" }));

    const titleCard = screen.getByTestId("field-card-title");
    expect(within(titleCard).getByRole("button", { name: "Remove" })).toBeDisabled();
    expect(within(titleCard).getByLabelText("Required")).toBeDisabled();
    expect(within(titleCard).getByLabelText("Required")).toBeChecked();
  });

  it("toggles required on custom fields and edits sentence conditions", async () => {
    const user = userEvent.setup();
    mockBuilderFetch();
    renderAt("/e/pacific-open-data-summit-2026/forms/main-cfp");
    await screen.findByText("Saved");
    await user.click(screen.getByRole("button", { name: "Proposal" }));
    await user.click(screen.getByRole("button", { name: "Add short text" }));

    const customCard = screen.getByTestId("field-card-customQuestion1");
    await user.click(within(customCard).getByLabelText("Required"));
    expect(within(customCard).getByLabelText("Required")).toBeChecked();

    await user.selectOptions(
      within(customCard).getByLabelText("Show this question when"),
      "sessionFormat",
    );
    await user.selectOptions(within(customCard).getByLabelText("is"), "workshop");
    expect(
      within(customCard).getByText("Show when Session format is Workshop"),
    ).toBeVisible();
    expect(screen.queryByText(/visibleIf/i)).not.toBeInTheDocument();

    await user.click(within(customCard).getByRole("button", { name: "Remove condition" }));
    expect(
      within(customCard).queryByText("Show when Session format is Workshop"),
    ).not.toBeInTheDocument();
  });

  it("shows Save failed and retries with the current draft", async () => {
    const user = userEvent.setup();
    let failOnce = true;
    const bodies: Array<{ name?: string; draft: { runtime: { survey: { elements: Array<{ name: string; html?: string }> } } } }> =
      [];
    mockBuilderFetch({
      onDraftPut: async (body) => {
        bodies.push(body as (typeof bodies)[number]);
        if (failOnce) {
          failOnce = false;
          return new Response(JSON.stringify({ error: "Draft store unavailable" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            form: mockOrganizerForm({
              name: body.name ?? "Main CFP",
              draft: body.draft as OrganizerCfpForm["draft"],
            }),
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });

    renderAt("/e/pacific-open-data-summit-2026/forms/main-cfp");
    await screen.findByText("Saved");
    await user.type(screen.getByLabelText("Welcome title"), " retry-me");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText("Save failed")).toBeVisible();
    await user.type(screen.getByLabelText("Welcome title"), " again");
    await user.click(screen.getByRole("button", { name: "Retry save" }));

    expect(await screen.findByText("Saved")).toBeVisible();
    expect(bodies).toHaveLength(2);
    const secondWelcome = bodies[1]!.draft.runtime.survey.elements.find(
      (element) => element.name === "welcome",
    );
    expect(secondWelcome?.html).toContain("retry-me again");
  });

  it("uses the same event accent in builder preview and public runtime", async () => {
    const accent = "#2f5d98";
    mockBuilderFetch({ themeAccent: accent });
    renderAt("/e/pacific-open-data-summit-2026/forms/main-cfp");
    await screen.findByText("Saved");
    const preview = document.querySelector(".cfp-survey") as HTMLElement | null;
    expect(preview).not.toBeNull();
    expect(preview?.style.getPropertyValue("--cfp-accent")).toBe(accent);
    cleanup();

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/cfp")) {
        return new Response(
          JSON.stringify({
            event: {
              id: "pacific-open-data-summit-2026",
              name: "Pacific Open Data Summit 2026",
              startsOn: "2026-10-07",
              endsOn: "2026-10-08",
              themeAccent: accent,
            },
            form: {
              id: "main-cfp",
              name: "Main CFP",
              status: "published",
              definitionVersion: 1,
              definition: mockPublishedDefinition([
                {
                  type: "text",
                  name: "title",
                  title: "Title",
                  isRequired: true,
                },
              ]),
              publishedAt: "2026-08-01T00:00:00.000Z",
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    renderAt("/e/pacific-open-data-summit-2026/cfp");
    await screen.findByRole("heading", {
      name: "Pacific Open Data Summit 2026",
    });
    const publicRoot = document.querySelector(".cfp-survey") as HTMLElement | null;
    expect(publicRoot?.style.getPropertyValue("--cfp-accent")).toBe(accent);
  });

  it("blocks navigation while the draft is dirty", async () => {
    const user = userEvent.setup();
    mockBuilderFetch();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    const rootRoute = createRootRoute({
      component: () => (
        <div>
          <Link to={"/" as "/"}>Event desk</Link>
          <Outlet />
        </div>
      ),
    });
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => <p>Left builder</p>,
    });
    const builderRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/e/$eventId/forms/$formId",
      component: CfpBuilderPage,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, builderRoute]),
      history: createMemoryHistory({
        initialEntries: ["/e/pacific-open-data-summit-2026/forms/main-cfp"],
      }),
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await screen.findByText("Saved");
    await user.type(screen.getByLabelText("Welcome title"), " dirty");
    expect(screen.getByText("Unsaved changes")).toBeVisible();

    await user.click(screen.getByRole("link", { name: "Event desk" }));
    expect(confirmSpy).toHaveBeenCalledWith(
      "Leave without saving your CFP changes?",
    );
    expect(screen.queryByText("Left builder")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Welcome title")).toHaveValue(
      "Submit a proposal dirty",
    );
  });

  it("renders a signed speaker portal with profile, event snapshot, and tasks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/events/pacific-open-data-summit-2026/portal?")) {
          return new Response(
            JSON.stringify({
              eventId: "pacific-open-data-summit-2026",
              eventName: "Pacific Open Data Summit 2026",
              expiresAt: "2026-12-01T00:00:00.000Z",
              acceptanceState: "accepted",
              profile: {
                id: "spk_1",
                name: "Portal Speaker",
                email: "portal@example.test",
                biography: "Living biography",
              },
              participation: {
                id: "prt_1",
                speakerId: "spk_1",
                role: "primary",
                titleAtEvent: "Director at Event Time",
                organizationAtEvent: "Historic Org",
              },
              proposal: {
                id: "SUB-PODS0099",
                title: "Portal talk",
                trackName: "Platform",
                programOutcome: "accepted",
              },
              session: {
                id: "ses_1",
                title: "Portal talk",
                format: "talk",
                trackId: "platform",
                roomId: null,
                startsAt: null,
                endsAt: null,
              },
              messages: [
                {
                  id: "msg_1",
                  subject: "Your session calendar invite",
                  status: "delivered",
                  kind: "calendar_invite",
                  createdAt: "2026-08-11T12:00:00.000Z",
                  updatedAt: "2026-08-11T12:05:00.000Z",
                  calendar: {
                    operation: "create",
                    uid: "cal_ses_1",
                    sequence: 0,
                    locationPending: true,
                    location: "Location pending",
                  },
                },
              ],
              tasks: [
                {
                  id: "tsk_1",
                  title: "Upload headshot",
                  kind: "headshot",
                  status: "open",
                  speakerId: "spk_1",
                  dueAt: "2026-09-01T00:00:00.000Z",
                },
              ],
              nextDeadline: "2026-09-01T00:00:00.000Z",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
      }),
    );

    renderAt("/e/pacific-open-data-summit-2026/portal/signed-token");

    expect(await screen.findByRole("heading", { name: "Pacific Open Data Summit 2026" })).toBeVisible();
    expect(screen.getByText("Living biography")).toBeVisible();
    expect(screen.getByText("Director at Event Time")).toBeVisible();
    expect(screen.getByText("Historic Org")).toBeVisible();
    expect(screen.getByText("Upload headshot")).toBeVisible();
    expect(screen.getByText(/SUB-PODS0099/)).toBeVisible();
    expect(screen.getByRole("heading", { name: /Messages & calendar/i })).toBeVisible();
    expect(screen.getByText("Your session calendar invite")).toBeVisible();
    expect(screen.getByText("Delivered")).toBeVisible();
    expect(screen.getByText(/Location pending/i)).toBeVisible();
    expect(screen.getByText(/Independent of acceptance/i)).toBeVisible();
    expect(screen.queryByText(/committee|private note|digest/i)).not.toBeInTheDocument();
  });
});
